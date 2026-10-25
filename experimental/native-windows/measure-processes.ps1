param([int]$WorkerProcess, [int]$PainterProcess)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class OwnedPetProbe {
 public delegate bool EnumProc(IntPtr window, IntPtr data);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L,T,R,B; }
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder text,int length);
 [DllImport("user32.dll",SetLastError=true)] static extern bool MoveWindow(IntPtr window,int x,int y,int w,int h,bool repaint);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 public static bool IsOwned(IntPtr window,int pid){uint owner;GetWindowThreadProcessId(window,out owner);return owner==(uint)pid;}
 static string Text(IntPtr window){var text=new StringBuilder(512);GetWindowText(window,text,512);return text.ToString();}
 public static IntPtr Target(int pid){SetThreadDpiAwarenessContext(new IntPtr(-4));IntPtr result=IntPtr.Zero;long area=0;EnumWindows((w,d)=>{Rect r;if(IsOwned(w,pid)&&GetWindowRect(w,out r)&&Text(w)!="Retrieviewer controls"&&r.R-r.L>=640&&r.B-r.T>=400){long a=(long)(r.R-r.L)*(r.B-r.T);if(a>area){area=a;result=w;}}return true;},IntPtr.Zero);if(result==IntPtr.Zero)throw new Exception("Owned diagnostic target not found");return result;}
 public static void Resize(IntPtr target,int pid,int width,int height){if(!IsOwned(target,pid)||width<160||height<120||width>3840||height>2160)throw new Exception("Invalid owned target resize");if(!MoveWindow(target,-12000,-12000,width,height,true))throw new Exception("Owned resize failed");}
 public static void Click(int pid,string name){if(name!="Ball"&&name!="Treat"&&name!="Tug")throw new Exception("Invalid test interaction");IntPtr bar=IntPtr.Zero,button=IntPtr.Zero;EnumWindows((w,d)=>{if(IsOwned(w,pid)&&Text(w)=="Retrieviewer controls"){bar=w;return false;}return true;},IntPtr.Zero);if(bar==IntPtr.Zero)throw new Exception("Owned controls not found");EnumChildWindows(bar,(w,d)=>{if(IsOwned(w,pid)&&Text(w)==name){button=w;return false;}return true;},IntPtr.Zero);if(button==IntPtr.Zero)throw new Exception("Owned interaction not found");IntPtr response;if(SendMessageTimeout(button,0xF5,IntPtr.Zero,IntPtr.Zero,2,2000,out response)==IntPtr.Zero)throw new Exception("Owned button timed out");}
}
'@
$ownedTarget = [OwnedPetProbe]::Target($PainterProcess)
while ($null -ne ($requestLine = [Console]::ReadLine())) {
 try {
  $request = $requestLine | ConvertFrom-Json
  if ($request.op -eq 'quit') { break }
  if ($request.op -eq 'resize') { [OwnedPetProbe]::Resize($ownedTarget,$PainterProcess,[int]$request.width,[int]$request.height) }
  elseif ($request.op -eq 'click') { [OwnedPetProbe]::Click($PainterProcess,[string]$request.name) }
  elseif ($request.op -ne 'sample') { throw 'Invalid probe operation' }
  $processRows = @()
  foreach ($processNumber in @($WorkerProcess,$PainterProcess)) {
   $observedProcess = Get-Process -Id $processNumber
   $observedProcess.Refresh()
   $processRows += [pscustomobject]@{pid=$processNumber;workingSetBytes=$observedProcess.WorkingSet64;peakWorkingSetBytes=$observedProcess.PeakWorkingSet64;privateBytes=$observedProcess.PrivateMemorySize64;handles=$observedProcess.HandleCount;cpuSeconds=$observedProcess.TotalProcessorTime.TotalSeconds}
  }
  $rectangle = New-Object OwnedPetProbe+Rect
  if (-not [OwnedPetProbe]::GetWindowRect($ownedTarget,[ref]$rectangle)) { throw 'Owned window disappeared' }
  [pscustomobject]@{ok=$true;processes=$processRows;targetWidth=($rectangle.R-$rectangle.L);targetHeight=($rectangle.B-$rectangle.T)} | ConvertTo-Json -Compress -Depth 5
 } catch { [pscustomobject]@{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress }
}
