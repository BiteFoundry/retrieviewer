#include <windows.h>
#include <gdiplus.h>
#include <memory>
#include <array>
#include "paint-regions.hpp"
#include "native-control.hpp"
namespace NativePet {
static JSContext* context;
static HWND target=nullptr;
static bool showing=false,paused=false,failed=false;
static ULONGLONG startTime=0,lastTick=0,durationMs=0;
static int stage=0,painted=0;
static std::string previous;
static std::vector<double> timings;
static bool saveProof=false,verifyAtlas=false,verifyEveryPaint=false,proofSaved=false,atlasVerified=false;
static std::string proofPath="dist/native-memory/native-window-proof.png";
static bool production=false,diagnostic=false,testPicker=false,visible=false,inkExplicit=false;
static HWND followed=nullptr,picker=nullptr,windowList=nullptr;
static DWORD followedPid=0;
static HANDLE instanceMutex=nullptr;
static NativeControl control;
static std::thread startupGuard;
static std::atomic<bool> detached{false};
static std::string petKind="dog",inkName="cream",returnStyle="auto",lastKind;
static bool lastAccepted=false;
static uint64_t frames=0;static size_t timingCursor=0;
static std::vector<std::pair<HWND,DWORD>> choices;
static POINT lastCanvas{INT_MIN,INT_MIN};static int lastWidth=0,lastHeight=0;
static Gdiplus::Color ink(){return inkName=="dark"?Gdiplus::Color(245,67,48,24):inkName=="gold"?(petKind=="cat"?Gdiplus::Color(245,241,182,107):Gdiplus::Color(245,231,184,103)):Gdiplus::Color(245,248,242,232);}
static void updateStatus();static void chooseWindow();static void layoutControls();
static JSValue call(const char* name,int argc=0,JSValue* args=nullptr){JSValue global=JS_GetGlobalObject(context),fn=JS_GetPropertyStr(context,global,name),out=JS_Call(context,fn,global,argc,args);JS_FreeValue(context,fn);JS_FreeValue(context,global);if(JS_IsException(out)){js_std_dump_error(context);failed=true;if(target)PostMessage(target,WM_CLOSE,0,0);}return out;}
static void interact(const char* kind){JSValue arg=JS_NewString(context,kind),result=call("__desktopInteract",1,&arg);bool accepted=!JS_IsException(result)&&JS_ToBool(context,result);JS_FreeValue(context,result);JS_FreeValue(context,arg);lastKind=kind;lastAccepted=accepted;if(!production||diagnostic){printf("{\"interaction\":\"%s\",\"accepted\":%s}\n",kind,accepted?"true":"false");fflush(stdout);}previous.clear();updateStatus();}
#include "native-paint.hpp"
static void updateStatus(){
 if(!production)return;
 PROCESS_MEMORY_COUNTERS_EX memory{};GetProcessMemoryInfo(GetCurrentProcess(),(PROCESS_MEMORY_COUNTERS*)&memory,sizeof(memory));
 std::ostringstream out;out<<"{\"running\":true,\"reachable\":true,\"engine\":\"quickjs-native\",\"pet\":\""<<petKind<<"\",\"ink\":\""<<inkName<<"\",\"returnStyle\":\""<<returnStyle<<"\",\"selected\":"<<(followed?"true":"false")<<",\"visible\":"<<(visible?"true":"false")<<",\"pickerVisible\":"<<(picker?"true":"false")<<",\"paused\":"<<(paused?"true":"false")<<",\"frames\":"<<frames<<",\"paintedFrames\":"<<painted<<",\"pid\":"<<GetCurrentProcessId()<<",\"painterPid\":"<<GetCurrentProcessId()<<",\"rssBytes\":"<<memory.WorkingSetSize<<",\"peakWorkingSetBytes\":"<<memory.PeakWorkingSetSize<<",\"privateBytes\":"<<memory.PrivateUsage<<",\"paintSurfaceBytes\":"<<paintBytes()<<",\"paintRegionCount\":"<<paintCount()<<",\"paintVerificationCount\":"<<verifiedPaints<<",\"watch\":{\"source\":\"off\",\"state\":\"off\",\"pendingCount\":0},\"brain\":{\"provider\":\"off\",\"state\":\"off\"},\"lastInteraction\":";
 if(lastKind.empty())out<<"null";else out<<"{\"kind\":\""<<lastKind<<"\",\"accepted\":"<<(lastAccepted?"true":"false")<<"}";out<<"}";control.update(out.str());
}
static void switchPet(const std::string& next){
 if(next==petKind)return;JSValue arg=JS_NewString(context,next.c_str()),result=call("__desktopSwitchPet",1,&arg);bool ok=!JS_IsException(result)&&JS_ToBool(context,result);JS_FreeValue(context,arg);JS_FreeValue(context,result);if(!ok)return;petKind=next;if(!inkExplicit)inkName=next=="cat"?"gold":"cream";previous.clear();releasePanels();lastCanvas={INT_MIN,INT_MIN};layoutControls();updateStatus();
}
static BOOL CALLBACK enumerate(HWND window,LPARAM){
 if(!IsWindowVisible(window)||GetWindow(window,GW_OWNER))return TRUE;DWORD pid=0;GetWindowThreadProcessId(window,&pid);if(!pid||pid==GetCurrentProcessId())return TRUE;wchar_t title[512];if(!GetWindowText(window,title,512))return TRUE;RECT rect;if(!GetClientRect(window,&rect)||rect.right<160||rect.bottom<120)return TRUE;LRESULT index=SendMessage(windowList,LB_ADDSTRING,0,(LPARAM)title);if(index!=LB_ERR&&index!=LB_ERRSPACE){SendMessage(windowList,LB_SETITEMDATA,index,(LPARAM)choices.size());choices.emplace_back(window,pid);}return TRUE;
}
static void attachSelection(){
 LRESULT selected=SendMessage(windowList,LB_GETCURSEL,0,0);if(selected==LB_ERR)return;LRESULT item=SendMessage(windowList,LB_GETITEMDATA,selected,0);if(item<0||(size_t)item>=choices.size())return;const auto candidate=choices[(size_t)item];DWORD pid=0;GetWindowThreadProcessId(candidate.first,&pid);if(!IsWindow(candidate.first)||pid!=candidate.second)return;followed=candidate.first;followedPid=candidate.second;HWND old=picker;picker=nullptr;DestroyWindow(old);previous.clear();SetForegroundWindow(followed);updateStatus();
}
static void addPetCombo(HWND parent){HWND combo=CreateWindow(L"COMBOBOX",L"",WS_CHILD|WS_VISIBLE|CBS_DROPDOWNLIST,8,8,114,180,parent,(HMENU)9,GetModuleHandle(nullptr),nullptr);SendMessage(combo,CB_ADDSTRING,0,(LPARAM)L"Retriever");SendMessage(combo,CB_ADDSTRING,0,(LPARAM)L"Ginger cat");SendMessage(combo,CB_SETCURSEL,petKind=="cat"?1:0,0);}
static LRESULT CALLBACK pickerProcedure(HWND window,UINT message,WPARAM w,LPARAM l){
 if(message==WM_COMMAND){int id=LOWORD(w);if(id==101||(id==100&&HIWORD(w)==LBN_DBLCLK)){attachSelection();return 0;}if(id==102){SendMessage(windowList,LB_RESETCONTENT,0,0);choices.clear();EnumWindows(enumerate,0);return 0;}if(id==9&&HIWORD(w)==CBN_SELCHANGE){switchPet(SendMessage((HWND)l,CB_GETCURSEL,0,0)==1?"cat":"dog");return 0;}}
 if(message==WM_DESTROY){if(picker==window)picker=nullptr;if(!followed&&target)PostMessage(target,WM_CLOSE,0,0);updateStatus();return 0;}return DefWindowProc(window,message,w,l);
}
static void chooseWindow(){
 if(!production||(diagnostic&&!testPicker))return;if(picker){SetForegroundWindow(picker);return;}visible=false;hidePanels();ShowWindow(target,SW_HIDE);previous.clear();WNDCLASS wc{};wc.lpfnWndProc=pickerProcedure;wc.hInstance=GetModuleHandle(nullptr);wc.lpszClassName=L"RetrieviewerNativePicker";wc.hbrBackground=(HBRUSH)(COLOR_WINDOW+1);RegisterClass(&wc);
 picker=CreateWindowEx(WS_EX_TOOLWINDOW,wc.lpszClassName,L"Retrieviewer - choose an app window",WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU, std::max(0,(GetSystemMetrics(SM_CXSCREEN)-650)/2),std::max(0,(GetSystemMetrics(SM_CYSCREEN)-450)/2),650,450,nullptr,nullptr,wc.hInstance,nullptr);if(!picker)throw std::runtime_error("Cannot open window picker");
 addPetCombo(picker);CreateWindow(L"STATIC",L"Choose the app window your companion should follow.",WS_CHILD|WS_VISIBLE,136,12,490,24,picker,nullptr,wc.hInstance,nullptr);windowList=CreateWindowEx(WS_EX_CLIENTEDGE,L"LISTBOX",L"",WS_CHILD|WS_VISIBLE|WS_VSCROLL|LBS_NOTIFY,12,44,610,310,picker,(HMENU)100,wc.hInstance,nullptr);CreateWindow(L"BUTTON",L"Attach",WS_CHILD|WS_VISIBLE|BS_DEFPUSHBUTTON,434,367,90,30,picker,(HMENU)101,wc.hInstance,nullptr);CreateWindow(L"BUTTON",L"Refresh",WS_CHILD|WS_VISIBLE,532,367,90,30,picker,(HMENU)102,wc.hInstance,nullptr);choices.clear();EnumWindows(enumerate,0);ShowWindow(picker,SW_SHOW);SetWindowPos(picker,HWND_TOP,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW);SetForegroundWindow(picker);updateStatus();
}
static void layoutControls(){
 if(!production||diagnostic||!target)return;const std::vector<int> ids=petKind=="cat"?std::vector<int>{1,2,3,6,8,4,5,7}:std::vector<int>{1,2,3,4,5,7};
 for(int id:{1,2,3,4,5,6,7,8})ShowWindow(GetDlgItem(target,id),SW_HIDE);int x=128;
 for(int id:ids){const wchar_t* label=id==1?(petKind=="cat"?L"Greet":L"Ball"):id==2?L"Treat":id==3?(petKind=="cat"?L"Company":L"Tug"):id==4?(paused?L"Resume":L"Pause"):id==5?L"Window":id==6?L"Tower":id==8?L"Wheel":L"Quit";HWND button=GetDlgItem(target,id);SetWindowText(button,label);SetWindowPos(button,nullptr,x,6,64,28,SWP_NOACTIVATE|SWP_NOZORDER|SWP_SHOWWINDOW);x+=68;}
 SendMessage(GetDlgItem(target,9),CB_SETCURSEL,petKind=="cat"?1:0,0);SetWindowPos(target,nullptr,0,0,x+6,40,SWP_NOMOVE|SWP_NOACTIVATE|SWP_NOZORDER);previous.clear();
}
static void tick(){
 const ULONGLONG now=GetTickCount64(),elapsed=now-startTime;if((durationMs&&elapsed>=durationMs)||(production&&!detached&&elapsed>12000)){DestroyWindow(target);return;}
 if(!showing&&!testPicker&&(!production||diagnostic)){const int next=elapsed>=120000?5:elapsed>=95000?4:elapsed>=70000?3:elapsed>=45000?2:elapsed>=1000?1:0;if(next>stage){stage=next;if(petKind=="cat")interact(stage==1?"toy":stage==2?"treat":stage==3?"company":stage==4?"tower":"wheel");else if(stage==1||stage==2)interact("ball");else if(stage==3)interact("treat");else if(stage==4)interact("tug");else if(stage==5)interact("wall");}}
 double dt=lastTick?std::min(.1,(now-lastTick)/1000.0):0;lastTick=now;
 HWND scene=production&&(!diagnostic||testPicker)?followed:target;
 DWORD scenePid=0;if(scene)GetWindowThreadProcessId(scene,&scenePid);
 if(production&&(!diagnostic||testPicker)&&scene&&(!IsWindow(scene)||scenePid!=followedPid)){followed=nullptr;chooseWindow();scene=nullptr;}
 if(picker||!scene||IsIconic(scene)||(production&&(!diagnostic||testPicker)&&GetForegroundWindow()!=scene&&GetForegroundWindow()!=target)||(showing&&GetForegroundWindow()!=target)){
  visible=false;hidePanels();if(production&&(!diagnostic||testPicker))ShowWindow(target,SW_HIDE);previous.clear();updateStatus();return;
 }
 RECT rect;GetClientRect(scene,&rect);POINT canvas{0,0};ClientToScreen(scene,&canvas);int cell=8,columns=rect.right/cell,rows=rect.bottom/(cell*2);while(columns*rows>125000&&cell<32){cell+=2;columns=rect.right/cell;rows=rect.bottom/(cell*2);}if(columns<8||rows<4||columns*rows>125000){visible=false;hidePanels();previous.clear();updateStatus();return;}
 visible=true;if(canvas.x!=lastCanvas.x||canvas.y!=lastCanvas.y||rect.right!=lastWidth||rect.bottom!=lastHeight){previous.clear();lastCanvas=canvas;lastWidth=rect.right;lastHeight=rect.bottom;}
 if(production&&(!diagnostic||testPicker)){RECT bar;GetWindowRect(target,&bar);int x=canvas.x+std::max<LONG>(0,rect.right-(bar.right-bar.left)),y=canvas.y+8;if(bar.left!=x||bar.top!=y||!IsWindowVisible(target))SetWindowPos(target,HWND_TOPMOST,x,y,0,0,SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW);}
 if(paused){updateStatus();return;}
 LARGE_INTEGER freq,t0,t1;QueryPerformanceFrequency(&freq);QueryPerformanceCounter(&t0);JSValue args[]={JS_NewFloat64(context,dt),JS_NewInt32(context,columns),JS_NewInt32(context,rows),JS_NewBool(context,previous.empty())},result=call("__desktopFrame",4,args);for(auto value:args)JS_FreeValue(context,value);if(JS_IsException(result)||JS_IsNull(result)||JS_IsUndefined(result)){JS_FreeValue(context,result);updateStatus();return;}
 frames++;size_t length;const char* value=JS_ToCStringLen(context,&length,result);if(!value){JS_FreeValue(context,result);throw std::runtime_error("Native frame string");}std::string text(value,length);JS_FreeCString(context,value);JS_FreeValue(context,result);if(text!=previous){paint(text,columns,rows,cell,canvas);previous=std::move(text);}QueryPerformanceCounter(&t1);double cost=(t1.QuadPart-t0.QuadPart)*1000.0/freq.QuadPart;if(production&&timings.size()>=1024)timings[timingCursor++%1024]=cost;else timings.push_back(cost);updateStatus();
}
static LRESULT CALLBACK procedure(HWND window,UINT message,WPARAM w,LPARAM l){
 if(message==WM_TIMER){try{tick();}catch(const std::exception& e){fprintf(stderr,"Native renderer: %s\n",e.what());failed=true;DestroyWindow(window);}return 0;}
 if(message==WM_APP+1){if(w==1||w==2)switchPet(w==2?"cat":"dog");return 0;}
 if(message==WM_COMMAND){int id=LOWORD(w);if(id==9&&HIWORD(w)==CBN_SELCHANGE)switchPet(SendMessage((HWND)l,CB_GETCURSEL,0,0)==1?"cat":"dog");else if(id==1)interact(petKind=="cat"?"greet":"ball");else if(id==2)interact("treat");else if(id==3)interact(petKind=="cat"?"company":"tug");else if(id==4){paused=!paused;previous.clear();layoutControls();updateStatus();}else if(id==5){if(production)chooseWindow();else interact("paw");}else if(id==6)interact(production?"tower":"wall");else if(id==8)interact("wheel");else if(id==7)DestroyWindow(window);return 0;}
 if(message==WM_SIZE||message==WM_MOVE){previous.clear();return 0;}
 if(message==WM_DESTROY){KillTimer(window,1);followed=nullptr;if(picker){HWND old=picker;picker=nullptr;SetWindowLongPtr(old,GWLP_WNDPROC,(LONG_PTR)DefWindowProc);DestroyWindow(old);}releasePanels();PostQuitMessage(0);return 0;}
 return DefWindowProc(window,message,w,l);
}
static int run(JSContext* ctx,int argc,char** argv){
 context=ctx;showing=false;durationMs=150000;for(int i=1;i<argc;i++){std::string arg=argv[i];if(arg=="--production"){production=true;durationMs=0;}if(arg=="--show"){showing=true;durationMs=0;}if(arg=="--proof")saveProof=true;if(arg=="--verify-atlas")verifyAtlas=true;if(arg=="--verify-regions"){verifyAtlas=true;verifyEveryPaint=true;}if(arg.rfind("--proof=",0)==0){saveProof=true;proofPath=arg.substr(8);}if(arg.rfind("--duration=",0)==0)durationMs=(ULONGLONG)(std::stod(arg.substr(11))*1000);}
 JSValue global=JS_GetGlobalObject(ctx),config=JS_GetPropertyStr(ctx,global,"__nativeConfig");if(JS_IsObject(config)){petKind=propertyString(ctx,config,"pet","dog");inkName=propertyString(ctx,config,"ink",petKind=="cat"?"gold":"cream");returnStyle=propertyString(ctx,config,"returnStyle","auto");inkExplicit=propertyBool(ctx,config,"inkExplicit");diagnostic=propertyBool(ctx,config,"diagnostic");testPicker=diagnostic&&propertyBool(ctx,config,"testPicker");}if(petKind!="dog"&&petKind!="cat")throw std::runtime_error("Invalid native pet");if(inkName!="cream"&&inkName!="gold"&&inkName!="dark")throw std::runtime_error("Invalid native ink");
 SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);Gdiplus::GdiplusStartupInput gdip;ULONG_PTR token;if(Gdiplus::GdiplusStartup(&token,&gdip,nullptr)!=Gdiplus::Ok)throw std::runtime_error("GDI+ startup");
 if(production){std::wstring name=wide("Local\\BiteFoundry.Retrieviewer.Overlay."+userSid()+(diagnostic?".Diagnostics."+std::to_string(GetCurrentProcessId()):""));instanceMutex=CreateMutexW(nullptr,TRUE,name.c_str());if(!instanceMutex||GetLastError()==ERROR_ALREADY_EXISTS)throw std::runtime_error("A Retrieviewer companion is already running");}
 HINSTANCE instance=GetModuleHandle(nullptr);WNDCLASS wc{};wc.lpfnWndProc=procedure;wc.hInstance=instance;wc.lpszClassName=L"RetrieviewerNativeHost";wc.hbrBackground=(HBRUSH)GetStockObject(BLACK_BRUSH);RegisterClass(&wc);
 const bool attach=production&&(!diagnostic||testPicker);target=CreateWindowEx(WS_EX_TOOLWINDOW|(attach?WS_EX_NOACTIVATE:0),wc.lpszClassName,attach?L"Retrieviewer controls":L"Retrieviewer diagnostic scene",showing?WS_OVERLAPPEDWINDOW:WS_POPUP,showing?80:-12000,showing?80:-12000,attach?552:showing?1280:3840,attach?40:showing?800:2160,nullptr,nullptr,instance,nullptr);if(!target)throw std::runtime_error("Native host window");if(!attach)followed=target;
 WNDCLASS pet{};pet.lpfnWndProc=DefWindowProc;pet.hInstance=instance;pet.lpszClassName=L"RetrieviewerNativeDots";RegisterClass(&pet);
 if(attach){addPetCombo(target);for(int id=1;id<=8;id++)CreateWindow(L"BUTTON",L"",WS_CHILD|BS_PUSHBUTTON,0,0,1,1,target,(HMENU)(INT_PTR)id,instance,nullptr);layoutControls();chooseWindow();}
 else if(showing){const wchar_t* names[]={L"Ball",L"Treat",L"Tug",L"Pause",L"Paw",L"Wall",L"Quit"};for(int i=0;i<7;i++)CreateWindow(L"BUTTON",names[i],WS_CHILD|WS_VISIBLE|BS_PUSHBUTTON,8+i*70,8,66,28,target,(HMENU)(INT_PTR)(i+1),instance,nullptr);}
 if(!attach)ShowWindow(target,showing?SW_SHOW:SW_SHOWNOACTIVATE);startTime=GetTickCount64();lastTick=0;timings.reserve(1024);SetTimer(target,1,33,nullptr);
 if(production){updateStatus();control.start(propertyString(ctx,config,"pipe"),propertyString(ctx,config,"token"),propertyString(ctx,config,"sessionFile"),[](const std::string& command){PostMessage(target,command=="stop"?WM_CLOSE:WM_APP+1,command=="pet-cat"?2:command=="pet-dog"?1:0,0);});printf("{\"ready\":true,\"pid\":%lu}\n",GetCurrentProcessId());fflush(stdout);startupGuard=std::thread([]{std::string ack;bool ok=std::getline(std::cin,ack)&&ack=="DETACH";if(ok){detached=true;printf("{\"detached\":true}\n");fflush(stdout);}else{DWORD pid=0;GetWindowThreadProcessId(target,&pid);if(pid==GetCurrentProcessId())PostMessage(target,WM_CLOSE,0,0);}});}
 else{detached=true;printf("{\"stage\":\"native-window\",\"width\":%d,\"height\":%d,\"durationMs\":%llu,\"pid\":%lu}\n",showing?1280:3840,showing?800:2160,durationMs,GetCurrentProcessId());fflush(stdout);}
 JS_FreeValue(ctx,config);JS_FreeValue(ctx,global);MSG msg;while(GetMessage(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessage(&msg);}
 if(startupGuard.joinable()){CancelSynchronousIo(startupGuard.native_handle());startupGuard.join();}control.close();JSValue result=call("__desktopDispose");JS_FreeValue(ctx,result);releasePanels();if(instanceMutex){ReleaseMutex(instanceMutex);CloseHandle(instanceMutex);instanceMutex=nullptr;}Gdiplus::GdiplusShutdown(token);
 std::sort(timings.begin(),timings.end());double sum=0;for(auto t:timings)sum+=t;if(!production||diagnostic){printf("{\"stage\":\"native-exit\",\"painted\":%d,\"renders\":%llu,\"meanMs\":%.3f,\"p95Ms\":%.3f,\"maxMs\":%.3f,\"failed\":%s}\n",painted,frames,timings.empty()?0:sum/timings.size(),timings.empty()?0:timings[(size_t)(timings.size()*.95)],timings.empty()?0:timings.back(),failed?"true":"false");fflush(stdout);}return failed?1:0;
}
}
