param([string]$Title)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;using System.Text;using System.Threading;using System.Windows.Forms;using System.Runtime.InteropServices;
public static class NativePickerFixture {
 static Form target;static Thread thread;static AutoResetEvent ready=new AutoResetEvent(false);
 public delegate bool EnumProc(IntPtr w,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr w,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr w,StringBuilder b,int n);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr w,IntPtr after,int x,int y,int cx,int cy,uint flags);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr w);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr w,int index);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr w,int how);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr w,StringBuilder text,int n);
 [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr w,int id);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr w,uint m,IntPtr a,StringBuilder b);
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr w,uint m,IntPtr a,IntPtr b);
 static string Text(IntPtr w){var b=new StringBuilder(512);GetWindowText(w,b,512);return b.ToString();}
 public static void Start(string title){thread=new Thread(()=>{target=new Form();target.Text=title;target.StartPosition=FormStartPosition.Manual;target.SetBounds(-12000,-12000,1280,800);target.Shown+=(s,e)=>{SetWindowPos(target.Handle,IntPtr.Zero,0,0,0,0,0x53);ready.Set();};Application.Run(target);});thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();if(!ready.WaitOne(5000))throw new Exception("Fixture startup timeout");}
 static IntPtr Find(int pid,string name){IntPtr found=IntPtr.Zero;EnumWindows((w,p)=>{uint owner;GetWindowThreadProcessId(w,out owner);if(owner==(uint)pid&&Text(w)==name){found=w;return false;}return true;},IntPtr.Zero);if(found==IntPtr.Zero)throw new Exception("Owned native window not found: "+name);return found;}
 public static void Attach(int pid,string title){var picker=Find(pid,"Retrieviewer - choose an app window");if(!IsWindowVisible(picker))throw new Exception("Native picker is hidden");var list=GetDlgItem(picker,100);int n=(int)SendMessage(list,0x18b,IntPtr.Zero,IntPtr.Zero);int selected=-1;for(int i=0;i<n;i++){var b=new StringBuilder(1024);SendMessage(list,0x189,new IntPtr(i),b);if(b.ToString()==title){selected=i;break;}}if(selected<0)throw new Exception("Owned fixture absent from picker");SendMessage(list,0x186,new IntPtr(selected),IntPtr.Zero);SendMessage(picker,0x111,new IntPtr(101),IntPtr.Zero);}
 [StructLayout(LayoutKind.Sequential)] struct RECT {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr w,out RECT r);
 public static string BarState(int pid,string action){SetThreadDpiAwarenessContext(new IntPtr(-4));var bar=Find(pid,"Retrieviewer controls");if(action=="toggle")SendMessage(bar,0x111,new IntPtr(10),IntPtr.Zero);else if(action=="pause")SendMessage(bar,0x111,new IntPtr(4),IntPtr.Zero);else if(action=="cat")SendMessage(bar,0x8001,new IntPtr(2),IntPtr.Zero);RECT r;if(!GetWindowRect(bar,out r))throw new Exception("Bar bounds unavailable");return "{\"ok\":true,\"width\":"+(r.Right-r.Left)+",\"right\":"+r.Right+",\"toggle\":\""+Text(GetDlgItem(bar,10))+"\",\"barVisible\":"+(IsWindowVisible(bar)?"true":"false")+",\"comboVisibleStyle\":"+((GetWindowLong(GetDlgItem(bar,9),-16)&0x10000000)!=0?"true":"false")+"}";}
 public static void PickAgain(int pid){var bar=Find(pid,"Retrieviewer controls");SendMessage(bar,0x111,new IntPtr(5),IntPtr.Zero);}
 public static void NativeResize(int pid,int width,int height){if(width<640||height<400||width>3840||height>2160)throw new Exception("Invalid owned resize");SetThreadDpiAwarenessContext(new IntPtr(-4));var window=Find(pid,"Retrieviewer diagnostic scene");if(!SetWindowPos(window,IntPtr.Zero,-12000,-12000,width,height,0x14))throw new Exception("Native resize failed");}
 public static void NativeMinimize(int pid,bool minimize){var window=Find(pid,"Retrieviewer diagnostic scene");ShowWindow(window,minimize?6:4);if(!minimize)SetWindowPos(window,IntPtr.Zero,-12000,-12000,0,0,0x55);}
 public static int NativePanels(int pid){int n=0;EnumWindows((w,p)=>{uint owner;GetWindowThreadProcessId(w,out owner);if(owner==(uint)pid){var b=new StringBuilder(128);GetClassName(w,b,128);if(b.ToString()=="RetrieviewerNativeDots")n++;}return true;},IntPtr.Zero);return n;}
 public static bool TargetForeground(){return GetForegroundWindow()==target.Handle;}
 public static void Minimize(){target.Invoke((Action)(()=>target.WindowState=FormWindowState.Minimized));}
 public static void Restore(){target.Invoke((Action)(()=>{target.WindowState=FormWindowState.Normal;target.SetBounds(-12000,-12000,1920,1080);}));}
 public static void Close(){target.Invoke((Action)(()=>target.Close()));thread.Join(5000);}
}
'@
[NativePickerFixture]::Start($Title)
'{"ready":true}'
try {
 while ($null -ne ($line = [Console]::ReadLine())) {
  try {
   $request = $line | ConvertFrom-Json
   $fixtureResult = $null
   switch ($request.op) {
    'attach' {[NativePickerFixture]::Attach([int]$request.pid,$Title)}
    'picker' {[NativePickerFixture]::PickAgain([int]$request.pid)}
    'bar' {$fixtureResult = [NativePickerFixture]::BarState([int]$request.pid,[string]$request.action) | ConvertFrom-Json}
    'foreground' {$fixtureResult = @{ok=$true;targetForeground=[NativePickerFixture]::TargetForeground()}}
    'minimize' {[NativePickerFixture]::Minimize()}
    'restore' {[NativePickerFixture]::Restore()}
    'native-resize' {[NativePickerFixture]::NativeResize([int]$request.pid,[int]$request.width,[int]$request.height)}
    'native-minimize' {[NativePickerFixture]::NativeMinimize([int]$request.pid,$true)}
    'native-restore' {[NativePickerFixture]::NativeMinimize([int]$request.pid,$false)}
    'native-panels' {$fixtureResult = @{ok=$true;panels=[NativePickerFixture]::NativePanels([int]$request.pid)}}
    'quit' {break}
    default {throw 'Unknown fixture command'}
   }
   if ($null -ne $fixtureResult) {$fixtureResult | ConvertTo-Json -Compress} else {'{"ok":true}'}
   if ($request.op -eq 'quit') {break}
  } catch { @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress }
 }
} finally {[NativePickerFixture]::Close()}
