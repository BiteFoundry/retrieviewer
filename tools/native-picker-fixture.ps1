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
 [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr w,int id);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr w,uint m,IntPtr a,StringBuilder b);
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr w,uint m,IntPtr a,IntPtr b);
 static string Text(IntPtr w){var b=new StringBuilder(512);GetWindowText(w,b,512);return b.ToString();}
 public static void Start(string title){thread=new Thread(()=>{target=new Form();target.Text=title;target.StartPosition=FormStartPosition.Manual;target.SetBounds(-12000,-12000,1280,800);target.Shown+=(s,e)=>{SetWindowPos(target.Handle,IntPtr.Zero,0,0,0,0,0x53);ready.Set();};Application.Run(target);});thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();if(!ready.WaitOne(5000))throw new Exception("Fixture startup timeout");}
 static IntPtr Find(int pid,string name){IntPtr found=IntPtr.Zero;EnumWindows((w,p)=>{uint owner;GetWindowThreadProcessId(w,out owner);if(owner==(uint)pid&&Text(w)==name){found=w;return false;}return true;},IntPtr.Zero);if(found==IntPtr.Zero)throw new Exception("Owned native window not found: "+name);return found;}
 public static void Attach(int pid,string title){var picker=Find(pid,"Retrieviewer - choose an app window");if(!IsWindowVisible(picker))throw new Exception("Native picker is hidden");var list=GetDlgItem(picker,100);int n=(int)SendMessage(list,0x18b,IntPtr.Zero,IntPtr.Zero);int selected=-1;for(int i=0;i<n;i++){var b=new StringBuilder(1024);SendMessage(list,0x189,new IntPtr(i),b);if(b.ToString()==title){selected=i;break;}}if(selected<0)throw new Exception("Owned fixture absent from picker");SendMessage(list,0x186,new IntPtr(selected),IntPtr.Zero);SendMessage(picker,0x111,new IntPtr(101),IntPtr.Zero);}
 public static void PickAgain(int pid){var bar=Find(pid,"Retrieviewer controls");SendMessage(bar,0x111,new IntPtr(5),IntPtr.Zero);}
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
   switch ($request.op) {
    'attach' {[NativePickerFixture]::Attach([int]$request.pid,$Title)}
    'picker' {[NativePickerFixture]::PickAgain([int]$request.pid)}
    'minimize' {[NativePickerFixture]::Minimize()}
    'restore' {[NativePickerFixture]::Restore()}
    'quit' {break}
    default {throw 'Unknown fixture command'}
   }
   '{"ok":true}'
   if ($request.op -eq 'quit') {break}
  } catch { @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress }
 }
} finally {[NativePickerFixture]::Close()}
