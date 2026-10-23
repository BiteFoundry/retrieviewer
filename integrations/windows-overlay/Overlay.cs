// Native Windows painter for the existing Braille engine. No injection, keyboard
// hooks, terminal output, screen capture, network, registry or agent config access.
// Built locally with the Windows .NET Framework compiler; no downloaded binaries.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Native {
    [StructLayout(LayoutKind.Sequential)] internal struct POINT { internal int X,Y; internal POINT(int x,int y){X=x;Y=y;} }
    [StructLayout(LayoutKind.Sequential)] internal struct SIZE { internal int Width,Height; internal SIZE(int w,int h){Width=w;Height=h;} }
    [StructLayout(LayoutKind.Sequential)] internal struct RECT { internal int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential,Pack=1)] internal struct BLEND { internal byte Op,Flags,Alpha,Format; }
    internal delegate bool EnumProc(IntPtr hwnd,IntPtr data);
    [DllImport("user32.dll")] internal static extern bool EnumWindows(EnumProc proc,IntPtr data);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] internal static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int length);
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
    [DllImport("user32.dll")] internal static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
    [DllImport("user32.dll")] internal static extern bool ClientToScreen(IntPtr hwnd,ref POINT point);
    [DllImport("user32.dll")] internal static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
    [DllImport("user32.dll")] internal static extern int GetWindowLong(IntPtr hwnd,int index);
    [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr hwnd,int command);
    [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] internal static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] internal static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
    [DllImport("gdi32.dll")] internal static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] internal static extern IntPtr SelectObject(IntPtr dc,IntPtr bitmap);
    [DllImport("gdi32.dll")] internal static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] internal static extern bool DeleteObject(IntPtr obj);
    [DllImport("user32.dll",SetLastError=true)] internal static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr dc,ref POINT dst,ref SIZE size,IntPtr src,ref POINT point,int key,ref BLEND blend,int flags);
    internal static Rectangle ClientBounds(IntPtr hwnd){
        RECT r;POINT p=new POINT(0,0);
        if(!GetClientRect(hwnd,out r)||!ClientToScreen(hwnd,ref p))return Rectangle.Empty;
        return new Rectangle(p.X,p.Y,r.Right-r.Left,r.Bottom-r.Top);
    }
    internal static void Place(IntPtr hwnd,Rectangle rect){
        SetWindowPos(hwnd,new IntPtr(-1),rect.X,rect.Y,rect.Width,rect.Height,0x10|0x40); // TOPMOST, NOACTIVATE, SHOWWINDOW
    }
}

class QuietWindow : Form {
    internal QuietWindow(){FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;AutoScaleMode=AutoScaleMode.None;StartPosition=FormStartPosition.Manual;}
    protected override bool ShowWithoutActivation {get{return true;}}
    protected override CreateParams CreateParams {get{CreateParams p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}} // NOACTIVATE, TOOLWINDOW
    protected override void WndProc(ref Message m){if(m.Msg==0x21){m.Result=new IntPtr(3);return;}base.WndProc(ref m);} // MA_NOACTIVATE
}

sealed class PetWindow : QuietWindow {
    protected override CreateParams CreateParams {get{CreateParams p=base.CreateParams;p.ExStyle|=0x80000|0x20;return p;}} // LAYERED + TRANSPARENT
    internal int PaintedDots;
    internal Bitmap PaintFrame(Dictionary<string,object> m,int cell,Rectangle canvas){
        int cols=Program.Int(m,"columns"),rows=Program.Int(m,"rows"),cx=Program.Int(m,"x"),cy=Program.Int(m,"y");
        string text=Program.Str(m,"text");
        if(cols==0&&rows==0&&text.Length==0){Hide();return null;}
        if(cols<1||rows<1||cols*rows>125000||cx<0||cy<0||(cx+cols)*cell>canvas.Width||(cy+rows)*cell*2>canvas.Height)throw new Exception("Out-of-bounds overlay frame");
        string[] lines=text.Split('\n');if(lines.Length!=rows)throw new Exception("Invalid overlay row count");
        Bitmap image=new Bitmap(cols*cell,rows*cell*2,PixelFormat.Format32bppPArgb);
        try{
            using(Graphics g=Graphics.FromImage(image))using(Brush ink=new SolidBrush(Color.FromArgb(245,248,242,232))){
                g.Clear(Color.Transparent);g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                int[] dx={0,0,0,1,1,1,0,1},dy={0,1,2,0,1,2,3,3};float step=cell/2f,diameter=Math.Max(1.1f,step*.48f);PaintedDots=0;
                for(int y=0;y<rows;y++){
                    if(lines[y].Length!=cols)throw new Exception("Invalid overlay column count");
                    for(int x=0;x<cols;x++){
                        int mask=lines[y][x]-0x2800;if(mask<0||mask>255)throw new Exception("Not a Braille frame");
                        for(int bit=0;bit<8;bit++)if((mask&(1<<bit))!=0){
                            float px=x*cell+(dx[bit]+.5f)*step,py=y*cell*2+(dy[bit]+.5f)*step;
                            g.FillEllipse(ink,px-diameter/2,py-diameter/2,diameter,diameter);PaintedDots++;
                        }
                    }
                }
            }
            Rectangle destination=new Rectangle(canvas.X+cx*cell,canvas.Y+cy*cell*2,image.Width,image.Height);
            if(!Visible){Bounds=destination;Show();}
            IntPtr screen=Native.GetDC(IntPtr.Zero),memory=Native.CreateCompatibleDC(screen),bitmap=IntPtr.Zero,old=IntPtr.Zero;
            try{
                bitmap=image.GetHbitmap(Color.FromArgb(0));old=Native.SelectObject(memory,bitmap);
                Native.POINT target=new Native.POINT(canvas.X+cx*cell,canvas.Y+cy*cell*2),source=new Native.POINT(0,0);
                Native.SIZE size=new Native.SIZE(image.Width,image.Height);Native.BLEND blend=new Native.BLEND();blend.Alpha=255;blend.Format=1;
                if(!Native.UpdateLayeredWindow(Handle,screen,ref target,ref size,memory,ref source,0,ref blend,2))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                Native.Place(Handle,new Rectangle(target.X,target.Y,size.Width,size.Height));
            }finally{if(old!=IntPtr.Zero)Native.SelectObject(memory,old);if(bitmap!=IntPtr.Zero)Native.DeleteObject(bitmap);Native.DeleteDC(memory);Native.ReleaseDC(IntPtr.Zero,screen);}
            return image;
        }catch{image.Dispose();throw;}
    }
}

sealed class TargetItem {
    internal IntPtr Window;internal uint Process;internal string Title;internal bool Terminal;
    public override string ToString(){return Title;}
}

sealed class Companion : ApplicationContext {
    readonly PetWindow pet=new PetWindow();readonly QuietWindow bar=new QuietWindow();
    readonly NotifyIcon tray=new NotifyIcon();readonly System.Windows.Forms.Timer clock=new System.Windows.Forms.Timer();
    readonly JavaScriptSerializer json=new JavaScriptSerializer();readonly object inputLock=new object();
    readonly Queue<Dictionary<string,object>> messages=new Queue<Dictionary<string,object>>();
    TargetItem target;Form pickerWindow;QuietWindow testTarget;readonly bool testMode;Rectangle canvas;int revision=0,cell=8;bool visible=false,paused=false,loaded=false,quitting=false,picking=false,announced=false;
    Label status=new Label();Mutex mutex;
    internal Companion(Mutex single,bool diagnostic){
        mutex=single;testMode=diagnostic;bar.Text="Retrieviewer controls";bar.Size=new Size(354,40);bar.BackColor=Color.FromArgb(28,30,34);bar.ForeColor=Color.White;
        bar.Font=new Font("Segoe UI",9);bar.Controls.Add(MakeButton("공",8,()=>Interact("ball")));bar.Controls.Add(MakeButton("간식",52,()=>Interact("treat")));
        bar.Controls.Add(MakeButton("창",102,ChooseTarget));bar.Controls.Add(MakeButton("쉼",146,TogglePause));bar.Controls.Add(MakeButton("종료",190,Quit));
        status.AutoSize=false;status.Location=new Point(240,12);status.Size=new Size(110,22);status.Text="준비 중";bar.Controls.Add(status);
        ContextMenuStrip menu=new ContextMenuStrip();menu.Items.Add("다른 창 선택",null,(s,e)=>ChooseTarget());menu.Items.Add("숨기기 / 다시 표시",null,(s,e)=>TogglePause());menu.Items.Add("종료",null,(s,e)=>Quit());
        tray.Icon=SystemIcons.Application;tray.Text="Retrieviewer · 창 선택";tray.ContextMenuStrip=menu;tray.Visible=true;tray.DoubleClick+=(s,e)=>ChooseTarget();
        // Handles are created on the UI thread before the reader can signal EOF.
        IntPtr unused=bar.Handle;unused=pet.Handle;
        Thread reader=new Thread(ReadInput);reader.IsBackground=true;reader.Start();
        clock.Interval=16;clock.Tick+=(s,e)=>Tick();clock.Start();
        if(testMode){
            testTarget=new QuietWindow();testTarget.Bounds=new Rectangle(-12000,-12000,1280,800);testTarget.Show();
            target=new TargetItem{Window=testTarget.Handle,Process=(uint)Process.GetCurrentProcess().Id,Title="owned diagnostic window"};
        }
    }
    Button MakeButton(string title,int x,Action action){
        Button b=new Button();b.Text=title;b.TabStop=false;b.Size=new Size(title=="간식"?46:40,28);b.Location=new Point(x,6);b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.BackColor=Color.FromArgb(48,51,58);b.ForeColor=Color.White;b.Click+=(s,e)=>action();return b;
    }
    void ReadInput(){
        try{
            string line;while((line=Program.Input.ReadLine())!=null){
                if(line.Length>800000)break;
                Dictionary<string,object> value=json.Deserialize<Dictionary<string,object>>(line);
                lock(inputLock){if(messages.Count>4)break;messages.Enqueue(value);}
            }
        }catch{}
        try{bar.BeginInvoke(new Action(Quit));}catch{}
    }
    void Interact(string kind){if(!loaded||paused)return;Program.Emit(new {type="interact",kind=kind});}
    void TogglePause(){paused=!paused;Program.Emit(new {type="pause",paused=paused});Track(true);}
    void Tick(){
        if(quitting)return;
        try{
            if(!announced){announced=true;if(!testMode)ChooseTarget();Program.Emit(new {type="ready",pickerVisible=pickerWindow!=null&&pickerWindow.Visible});}
            Track(false);
            for(;;){Dictionary<string,object> m;lock(inputLock){if(messages.Count==0)break;m=messages.Dequeue();}
                string type=Program.Str(m,"type");
                if(type=="quit"){Quit();return;}
                if(type=="loaded"){loaded=true;status.Text="함께 노는 중";if(testMode)((Button)bar.Controls[0]).PerformClick();continue;}
                if(type=="interaction"){status.Text=Program.Bool(m,"accepted")?"좋아!":"잠깐 기다려";continue;}
                if(type=="error"){status.Text="엔진 오류";Quit();return;}
                if(type=="frame"){
                    // Always acknowledge discarded frames too, otherwise resizing can deadlock the sender.
                    bool painted=visible&&!paused&&Program.Int(m,"revision")==revision;
                    if(painted){using(Bitmap image=pet.PaintFrame(m,cell,canvas)){} }
                    Program.Emit(new {type="ack",painted=painted});
                }
            }
        }catch(Exception error){Program.Emit(new {type="error",message=error.Message});Quit();}
    }
    void Track(bool force){
        Rectangle next=Rectangle.Empty;bool show=false;uint pid;
        if(target!=null&&(!Native.IsWindow(target.Window)||Native.GetWindowThreadProcessId(target.Window,out pid)==0||pid!=target.Process)){target=null;}
        if(target!=null&&!Native.IsIconic(target.Window)&&Native.IsWindowVisible(target.Window)){
            next=Native.ClientBounds(target.Window);IntPtr foreground=Native.GetForegroundWindow();show=!picking&&(testMode||foreground==target.Window||foreground==bar.Handle)&&next.Width>=160&&next.Height>=120;
        }
        int nextCell=8;while(next.Width/nextCell*(next.Height/(nextCell*2))>125000&&nextCell<16)nextCell+=2;
        if(nextCell==14)nextCell=16;
        int columns=next.Width/nextCell,rows=next.Height/(nextCell*2);
        if(force||show!=visible||next!=canvas||nextCell!=cell){
            visible=show;canvas=next;cell=nextCell;revision++;pet.Hide();
            Program.Emit(new {type="viewport",revision=revision,visible=show&&!paused,selected=target!=null,columns=columns,rows=rows,cellWidth=cell,cellHeight=cell*2});
        }
        if(visible){
            if(!bar.Visible)bar.Show();Native.Place(bar.Handle,new Rectangle(canvas.Right-bar.Width-10,canvas.Top+10,bar.Width,bar.Height));
            if(paused)pet.Hide();
        }else{pet.Hide();bar.Hide();}
    }
    List<TargetItem> Targets(){
        List<TargetItem> result=new List<TargetItem>();uint mine=(uint)Process.GetCurrentProcess().Id;
        Native.EnumWindows((hwnd,data)=>{
            uint pid;Native.GetWindowThreadProcessId(hwnd,out pid);if(pid==mine||!Native.IsWindowVisible(hwnd))return true;
            StringBuilder name=new StringBuilder(512);Native.GetWindowText(hwnd,name,name.Capacity);if(name.Length==0)return true;
            string process="";try{using(Process p=Process.GetProcessById((int)pid)){process=p.ProcessName;}}catch{}
            bool terminal=process.Equals("WindowsTerminal",StringComparison.OrdinalIgnoreCase)||process.IndexOf("wezterm",StringComparison.OrdinalIgnoreCase)>=0||process=="OpenConsole"||process=="conhost"||process=="mintty";
            result.Add(new TargetItem{Window=hwnd,Process=pid,Title=(terminal?"[터미널] ":"")+name.ToString()+" · "+process,Terminal=terminal});return true;
        },IntPtr.Zero);
        result.Sort((a,b)=>a.Terminal==b.Terminal?String.Compare(a.Title,b.Title,StringComparison.CurrentCulture):a.Terminal?-1:1);return result;
    }
    void ChooseTarget(){
        if(picking||quitting)return;picking=true;Track(true);
        Form picker=new Form();pickerWindow=picker;
        {
            picker.Text="Retrieviewer · 함께 있을 창";picker.Size=new Size(650,230);picker.StartPosition=FormStartPosition.CenterScreen;picker.FormBorderStyle=FormBorderStyle.FixedDialog;picker.MaximizeBox=false;picker.MinimizeBox=false;picker.Font=new Font("Segoe UI",10);
            picker.ShowInTaskbar=true;picker.TopMost=true;
            Label hint=new Label();hint.Text="Codex를 사용하는 터미널 창을 선택하세요.\n내용을 읽지 않고 창의 위치·크기만 따라갑니다. 탭은 구별하지 않습니다.";hint.SetBounds(18,16,610,50);
            ComboBox list=new ComboBox();list.DropDownStyle=ComboBoxStyle.DropDownList;list.SetBounds(18,76,600,28);foreach(TargetItem item in Targets())list.Items.Add(item);if(list.Items.Count>0)list.SelectedIndex=0;
            Button refresh=new Button();refresh.Text="새로 고침";refresh.SetBounds(18,124,100,34);refresh.Click+=(s,e)=>{list.Items.Clear();foreach(TargetItem item in Targets())list.Items.Add(item);if(list.Items.Count>0)list.SelectedIndex=0;};
            Button attach=new Button();attach.Text="이 창에 붙이기";attach.SetBounds(378,124,140,34);attach.Click+=(s,e)=>{if(list.SelectedItem!=null){target=(TargetItem)list.SelectedItem;paused=false;Program.Emit(new {type="pause",paused=false});picker.Close();}};
            Button cancel=new Button();cancel.Text="취소";cancel.SetBounds(528,124,90,34);cancel.Click+=(s,e)=>picker.Close();
            picker.Controls.AddRange(new Control[]{hint,list,refresh,attach,cancel});
            picker.FormClosed+=(s,e)=>{pickerWindow=null;picking=false;Program.Emit(new {type="picker",visible=false});if(!quitting){if(target==null)status.Text="트레이에서 창 선택";tray.Text=target==null?"Retrieviewer · 창 선택":"Retrieviewer · 창에 붙어 있음";Track(true);}picker.Dispose();};
            picker.Show();Native.ShowWindow(picker.Handle,5);Program.Emit(new {type="picker",visible=Native.IsWindowVisible(picker.Handle)});
        }
    }
    void Quit(){if(quitting)return;quitting=true;clock.Stop();if(pickerWindow!=null)pickerWindow.Close();pet.Close();bar.Close();tray.Visible=false;tray.Dispose();Program.Emit(new {type="quit"});ExitThread();}
    protected override void Dispose(bool disposing){if(disposing){clock.Dispose();pet.Dispose();bar.Dispose();tray.Dispose();if(testTarget!=null)testTarget.Dispose();if(mutex!=null){mutex.ReleaseMutex();mutex.Dispose();mutex=null;}}base.Dispose(disposing);}
}

static class Program {
    static readonly object outputLock=new object();
    internal static TextReader Input;static TextWriter Output;
    internal static void Emit(object value){lock(outputLock){try{Output.WriteLine(new JavaScriptSerializer().Serialize(value));Output.Flush();}catch{Environment.Exit(0);}}}
    internal static int Int(Dictionary<string,object> m,string key){return Convert.ToInt32(m[key]);}
    internal static string Str(Dictionary<string,object> m,string key){return Convert.ToString(m[key]);}
    internal static bool Bool(Dictionary<string,object> m,string key){return Convert.ToBoolean(m[key]);}
    [STAThread] static int Main(string[] args){
        try{
            // GUI-subsystem processes have redirected handles but no console code
            // page. Setting Console.*Encoding can throw before startup on Windows.
            Input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false),false);
            Output=new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false));
            try{Native.SetProcessDpiAwarenessContext(new IntPtr(-4));}catch(EntryPointNotFoundException){Native.SetProcessDPIAware();}
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
            if(args.Length==2&&args[0]=="--self-test")return SelfTest(args[1]);
            bool ipcTest=args.Length==1&&args[0]=="--ipc-test";
            if(args.Length!=0&&!ipcTest)throw new Exception("Unsupported native painter argument");
            // Diagnostics own only off-screen windows and must not stop or contend
            // with a user's running companion during a release verification.
            string mutexName="Local\\BiteFoundry.Retrieviewer.Overlay."+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value+(ipcTest?".Diagnostics."+Process.GetCurrentProcess().Id:"");
            bool first;Mutex single=new Mutex(true,mutexName,out first);
            if(!first){single.Dispose();Emit(new {type="error",message="A Retrieviewer companion is already running"});return 2;}
            using(Companion context=new Companion(single,ipcTest))Application.Run(context);return 0;
        }catch(Exception error){Emit(new {type="error",message=error.Message});return 1;}
    }
    static int SelfTest(string proof){
        // Uses only our own off-screen windows. Does NOT click/type in or capture a user application.
        IntPtr foreground=Native.GetForegroundWindow();
        Dictionary<string,object> frame=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Input.ReadLine());
        using(QuietWindow target=new QuietWindow())using(PetWindow pet=new PetWindow()){
            target.Bounds=new Rectangle(-12000,-12000,1600,1000);target.Show();Application.DoEvents();
            Rectangle first=Native.ClientBounds(target.Handle);using(Bitmap bitmap=pet.PaintFrame(frame,8,first)){bitmap.Save(proof,ImageFormat.Png);}
            int styles=Native.GetWindowLong(pet.Handle,-20);bool clickThrough=(styles&0x20)!=0,noActivate=(styles&0x08000000)!=0,layered=(styles&0x80000)!=0;
            target.Bounds=new Rectangle(-11000,-11500,1800,1100);Application.DoEvents();Rectangle moved=Native.ClientBounds(target.Handle);
            using(Bitmap bitmap=pet.PaintFrame(frame,8,moved)){}
            Native.RECT actual;Native.GetWindowRect(pet.Handle,out actual);
            int expectedX=moved.Left+Int(frame,"x")*8,expectedY=moved.Top+Int(frame,"y")*16;
            bool follows=actual.Left==expectedX&&actual.Top==expectedY;
            Native.ShowWindow(target.Handle,7);Application.DoEvents();bool minimized=Native.IsIconic(target.Handle);pet.Hide();bool hidden=!pet.Visible;
            Native.ShowWindow(target.Handle,4);Application.DoEvents();bool restored=!Native.IsIconic(target.Handle);
            bool focus=Native.GetForegroundWindow()==foreground;
            bool passed=clickThrough&&noActivate&&layered&&follows&&minimized&&hidden&&restored&&focus&&pet.PaintedDots>0;
            Emit(new {type="self-test",passed=passed,clickThroughStyle=clickThrough,noActivateStyle=noActivate,layered=layered,followGeometry=follows,expectedX=expectedX,expectedY=expectedY,actualX=actual.Left,actualY=actual.Top,minimize=minimized,hide=hidden,restore=restored,foregroundPreserved=focus,dots=pet.PaintedDots,proof=proof});return passed?0:1;
        }
    }
}
