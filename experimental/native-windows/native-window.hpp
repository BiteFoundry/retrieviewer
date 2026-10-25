#include <windows.h>
#include <gdiplus.h>
#include <memory>
namespace NativePet {
static JSContext* context;
static HWND target=nullptr,overlay=nullptr;
static bool showing=false,paused=false,failed=false;
static ULONGLONG startTime=0,lastTick=0,durationMs=0;
static int stage=0,painted=0;
static std::string previous;
static std::vector<double> timings;
static bool saveProof=false,verifyAtlas=false,proofSaved=false,atlasVerified=false;
static JSValue call(const char* name,int argc=0,JSValue* args=nullptr){JSValue global=JS_GetGlobalObject(context),fn=JS_GetPropertyStr(context,global,name),out=JS_Call(context,fn,global,argc,args);JS_FreeValue(context,fn);JS_FreeValue(context,global);if(JS_IsException(out)){js_std_dump_error(context);failed=true;if(target)PostMessage(target,WM_CLOSE,0,0);}return out;}
static void interact(const char* kind){JSValue arg=JS_NewString(context,kind),result=call("__desktopInteract",1,&arg);bool accepted=JS_ToBool(context,result);JS_FreeValue(context,result);JS_FreeValue(context,arg);printf("{\"interaction\":\"%s\",\"accepted\":%s}\n",kind,accepted?"true":"false");fflush(stdout);previous.clear();}
struct Surface {
 HDC dc=nullptr;HBITMAP bitmap=nullptr;HGDIOBJ old=nullptr;uint8_t* bits=nullptr;int width=0,height=0;
 ~Surface(){release();}
 void release(){if(dc){if(old)SelectObject(dc,old);if(bitmap)DeleteObject(bitmap);DeleteDC(dc);}dc=nullptr;bitmap=nullptr;old=nullptr;bits=nullptr;width=height=0;}
 void ensure(int w,int h){if(w<=width&&h<=height)return;w=std::max(width,(w+63)/64*64);h=std::max(height,(h+63)/64*64);release();width=w;height=h;BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);info.bmiHeader.biWidth=w;info.bmiHeader.biHeight=-h;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;HDC screen=GetDC(nullptr);dc=CreateCompatibleDC(screen);bitmap=CreateDIBSection(screen,&info,DIB_RGB_COLORS,(void**)&bits,nullptr,0);ReleaseDC(nullptr,screen);if(!bitmap||!dc)throw std::runtime_error("Native surface allocation");old=SelectObject(dc,bitmap);}
};
static Surface surface;
struct DotAtlas {
 int cell=0;std::vector<uint8_t> pixels;
 void ensure(int value){if(cell==value)return;cell=value;size_t length=(size_t)cell*cell*2*4;pixels.assign(length*256,0);static const int dx[]={0,0,0,1,1,1,0,1},dy[]={0,1,2,0,1,2,3,3};float step=cell/2.f,diameter=std::max(1.1f,step*.48f);
  for(int mask=0;mask<256;mask++){Gdiplus::Bitmap bitmap(cell,cell*2,cell*4,PixelFormat32bppPARGB,pixels.data()+mask*length);Gdiplus::Graphics g(&bitmap);g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);Gdiplus::SolidBrush ink(Gdiplus::Color(245,248,242,232));for(int bit=0;bit<8;bit++)if(mask&(1<<bit)){float x=(dx[bit]+.5f)*step,y=(dy[bit]+.5f)*step;g.FillEllipse(&ink,x-diameter/2,y-diameter/2,diameter,diameter);}}
 }
};
static DotAtlas atlas;
static void paint(const std::string& text,int columns,int rows,int cell,POINT canvas){
 std::vector<uint8_t> masks((size_t)columns*rows);size_t at=0;int left=columns,top=rows,right=-1,bottom=-1;
 for(int y=0;y<rows;y++){if(y){if(at>=text.size()||text[at++]!='\n')throw std::runtime_error("Native row separator");}for(int x=0;x<columns;x++){if(at+3>text.size())throw std::runtime_error("Native text length");const auto* p=(const unsigned char*)text.data()+at;uint32_t ch=((p[0]&15)<<12)|((p[1]&63)<<6)|(p[2]&63);at+=3;if(ch<0x2800||ch>0x28ff)throw std::runtime_error("Native glyph");uint8_t mask=(uint8_t)(ch-0x2800);masks[y*columns+x]=mask;if(mask){left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);}}}
 if(at!=text.size())throw std::runtime_error("Native trailing text");if(right<left){ShowWindow(overlay,SW_HIDE);return;}
 int w=(right-left+1)*cell,h=(bottom-top+1)*cell*2;surface.ensure(w,h);std::fill(surface.bits,surface.bits+(size_t)surface.width*surface.height*4,0);
 atlas.ensure(cell);size_t stampSize=(size_t)cell*cell*2*4;
 for(int y=top;y<=bottom;y++)for(int x=left;x<=right;x++){int mask=masks[y*columns+x];if(!mask)continue;const uint8_t* stamp=atlas.pixels.data()+mask*stampSize;for(int sy=0;sy<cell*2;sy++)memcpy(surface.bits+((size_t)((y-top)*cell*2+sy)*surface.width+(x-left)*cell)*4,stamp+(size_t)sy*cell*4,cell*4);}
 if(verifyAtlas&&!atlasVerified){std::vector<uint8_t> reference((size_t)w*h*4,0);Gdiplus::Bitmap bitmap(w,h,w*4,PixelFormat32bppPARGB,reference.data());Gdiplus::Graphics g(&bitmap);g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);Gdiplus::SolidBrush ink(Gdiplus::Color(245,248,242,232));static const int dx[]={0,0,0,1,1,1,0,1},dy[]={0,1,2,0,1,2,3,3};float step=cell/2.f,diameter=std::max(1.1f,step*.48f);for(int y=top;y<=bottom;y++)for(int x=left;x<=right;x++){int mask=masks[y*columns+x];for(int bit=0;bit<8;bit++)if(mask&(1<<bit)){float px=(x-left)*cell+(dx[bit]+.5f)*step,py=(y-top)*cell*2+(dy[bit]+.5f)*step;g.FillEllipse(&ink,px-diameter/2,py-diameter/2,diameter,diameter);}}g.Flush(Gdiplus::FlushIntentionSync);for(int y=0;y<h;y++)if(memcmp(reference.data()+(size_t)y*w*4,surface.bits+(size_t)y*surface.width*4,w*4)!=0)throw std::runtime_error("Dot atlas changed pixels");atlasVerified=true;printf("{\"stage\":\"dot-atlas-verified\",\"pixelExact\":true}\n");fflush(stdout);}
 if(saveProof&&!proofSaved){Gdiplus::Bitmap source(surface.width,surface.height,surface.width*4,PixelFormat32bppPARGB,surface.bits),proof(w,h,PixelFormat32bppARGB);Gdiplus::Graphics pg(&proof);pg.Clear(Gdiplus::Color(255,0,0,0));pg.DrawImage(&source,Gdiplus::Rect(0,0,w,h),0,0,w,h,Gdiplus::UnitPixel);pg.Flush(Gdiplus::FlushIntentionSync);CLSID png={0x557cf406,0x1a04,0x11d3,{0x9a,0x73,0x00,0x00,0xf8,0x1e,0xf3,0x2e}};if(proof.Save(L"dist/native-memory/native-window-proof.png",&png,nullptr)!=Gdiplus::Ok)throw std::runtime_error("PNG proof failed");proofSaved=true;}
 POINT destination={canvas.x+left*cell,canvas.y+top*cell*2},origin={0,0};SIZE size={w,h};BLENDFUNCTION blend={AC_SRC_OVER,0,255,AC_SRC_ALPHA};HDC screen=GetDC(nullptr);BOOL result=UpdateLayeredWindow(overlay,screen,&destination,&size,surface.dc,&origin,0,&blend,ULW_ALPHA);ReleaseDC(nullptr,screen);if(!result)throw std::runtime_error("Native layered update");SetWindowPos(overlay,HWND_TOPMOST,destination.x,destination.y,w,h,SWP_NOACTIVATE|SWP_SHOWWINDOW);painted++;
}
static void tick(){
 const ULONGLONG now=GetTickCount64(),elapsed=now-startTime;if(durationMs&&elapsed>=durationMs){DestroyWindow(target);return;}
 if(!showing){const int next=elapsed>=120000?5:elapsed>=95000?4:elapsed>=70000?3:elapsed>=45000?2:elapsed>=1000?1:0;if(next>stage){stage=next;if(stage==1||stage==2)interact("ball");else if(stage==3)interact("treat");else if(stage==4)interact("tug");else if(stage==5)interact("wall");}}
 double dt=lastTick?std::min(.1,(now-lastTick)/1000.0):0;lastTick=now;if(paused)return;
 if(showing&&GetForegroundWindow()!=target){ShowWindow(overlay,SW_HIDE);previous.clear();return;}
 RECT rect;GetClientRect(target,&rect);POINT canvas{0,0};ClientToScreen(target,&canvas);int cell=8,columns=rect.right/cell,rows=rect.bottom/(cell*2);while(columns*rows>125000&&cell<32){cell+=2;columns=rect.right/cell;rows=rect.bottom/(cell*2);}if(columns<1||rows<1||columns*rows>125000){ShowWindow(overlay,SW_HIDE);return;}
 LARGE_INTEGER freq,t0,t1;QueryPerformanceFrequency(&freq);QueryPerformanceCounter(&t0);JSValue args[]={JS_NewFloat64(context,dt),JS_NewInt32(context,columns),JS_NewInt32(context,rows)},result=call("__desktopFrame",3,args);for(auto value:args)JS_FreeValue(context,value);if(JS_IsException(result)||JS_IsNull(result)||JS_IsUndefined(result)){JS_FreeValue(context,result);return;}
 size_t length;const char* value=JS_ToCStringLen(context,&length,result);if(!value){JS_FreeValue(context,result);throw std::runtime_error("Native frame string");}std::string text(value,length);JS_FreeCString(context,value);JS_FreeValue(context,result);if(text!=previous){paint(text,columns,rows,cell,canvas);previous=std::move(text);}QueryPerformanceCounter(&t1);timings.push_back((t1.QuadPart-t0.QuadPart)*1000.0/freq.QuadPart);
}
static LRESULT CALLBACK procedure(HWND window,UINT message,WPARAM w,LPARAM l){
 if(message==WM_TIMER){try{tick();}catch(const std::exception& e){fprintf(stderr,"Native renderer: %s\n",e.what());failed=true;DestroyWindow(window);}return 0;}
 if(message==WM_COMMAND){int id=LOWORD(w);if(id>=1&&id<=3)interact(id==1?"ball":id==2?"treat":"tug");else if(id==4){paused=!paused;previous.clear();}else if(id==5||id==6)interact(id==5?"paw":"wall");else if(id==7)DestroyWindow(window);return 0;}
 if(message==WM_SIZE||message==WM_MOVE){previous.clear();return 0;}
 if(message==WM_DESTROY){KillTimer(window,1);if(overlay)DestroyWindow(overlay);overlay=nullptr;PostQuitMessage(0);return 0;}
 return DefWindowProc(window,message,w,l);
}
static int run(JSContext* ctx,int argc,char** argv){
 context=ctx;showing=false;durationMs=150000;for(int i=1;i<argc;i++){std::string arg=argv[i];if(arg=="--show"){showing=true;durationMs=0;}if(arg=="--proof")saveProof=true;if(arg=="--verify-atlas")verifyAtlas=true;if(arg.rfind("--duration=",0)==0)durationMs=(ULONGLONG)(std::stod(arg.substr(11))*1000);}
 SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);Gdiplus::GdiplusStartupInput gdip;ULONG_PTR token;if(Gdiplus::GdiplusStartup(&token,&gdip,nullptr)!=Gdiplus::Ok)throw std::runtime_error("GDI+ startup");HINSTANCE instance=GetModuleHandle(nullptr);WNDCLASS wc{};wc.lpfnWndProc=procedure;wc.hInstance=instance;wc.lpszClassName=L"RetrieviewerNativeProbe";wc.hbrBackground=(HBRUSH)GetStockObject(BLACK_BRUSH);RegisterClass(&wc);
 target=CreateWindowEx(WS_EX_TOOLWINDOW,wc.lpszClassName,L"Retrieviewer native · prototype",showing?WS_OVERLAPPEDWINDOW:WS_POPUP,showing?80:-12000,showing?80:-12000,showing?1280:3840,showing?800:2160,nullptr,nullptr,instance,nullptr);if(!target)throw std::runtime_error("Native target window");
 WNDCLASS pet{};pet.lpfnWndProc=DefWindowProc;pet.hInstance=instance;pet.lpszClassName=L"RetrieviewerNativeDots";RegisterClass(&pet);overlay=CreateWindowEx(WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE|WS_EX_TOPMOST,pet.lpszClassName,L"",WS_POPUP,0,0,1,1,nullptr,nullptr,instance,nullptr);if(!overlay)throw std::runtime_error("Native overlay window");
 if(showing){const wchar_t* names[]={L"Ball",L"Treat",L"Tug",L"Pause",L"Paw",L"Wall",L"Quit"};for(int i=0;i<7;i++)CreateWindow(L"BUTTON",names[i],WS_CHILD|WS_VISIBLE|BS_PUSHBUTTON,8+i*70,8,66,28,target,(HMENU)(INT_PTR)(i+1),instance,nullptr);}
 ShowWindow(target,showing?SW_SHOW:SW_SHOWNOACTIVATE);startTime=GetTickCount64();lastTick=0;SetTimer(target,1,33,nullptr);printf("{\"stage\":\"native-window\",\"width\":%d,\"height\":%d,\"durationMs\":%llu,\"pid\":%lu}\n",showing?1280:3840,showing?800:2160,durationMs,GetCurrentProcessId());fflush(stdout);MSG msg;while(GetMessage(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessage(&msg);}
 JSValue result=call("__desktopDispose");JS_FreeValue(ctx,result);surface.release();Gdiplus::GdiplusShutdown(token);std::sort(timings.begin(),timings.end());double sum=0;for(auto t:timings)sum+=t;printf("{\"stage\":\"native-exit\",\"painted\":%d,\"renders\":%zu,\"meanMs\":%.3f,\"p95Ms\":%.3f,\"maxMs\":%.3f,\"failed\":%s}\n",painted,timings.size(),timings.empty()?0:sum/timings.size(),timings.empty()?0:timings[(size_t)(timings.size()*.95)],timings.empty()?0:timings.back(),failed?"true":"false");fflush(stdout);return failed?1:0;
}
}
