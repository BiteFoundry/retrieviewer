// Included inside NativePet. Shared final-mask stamps preserve original pixels.
struct Surface {
 HDC dc=nullptr;HBITMAP bitmap=nullptr;HGDIOBJ old=nullptr;uint8_t* bits=nullptr;int width=0,height=0;
 ~Surface(){release();}
 uint64_t bytes() const {return (uint64_t)width*height*4;}
 void release(){if(dc&&old)SelectObject(dc,old);if(bitmap)DeleteObject(bitmap);if(dc)DeleteDC(dc);dc=nullptr;bitmap=nullptr;old=nullptr;bits=nullptr;width=height=0;}
 void ensure(int w,int h){
  const int rw=PetPaint::rounded(w),rh=PetPaint::rounded(h);
  if(w<=width&&h<=height&&(uint64_t)width*height<=(uint64_t)rw*rh*2)return;
  int nw=std::max(width,rw),nh=std::max(height,rh);
  if((uint64_t)nw*nh>(uint64_t)rw*rh*2){nw=rw;nh=rh;}
  release();width=nw;height=nh;BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);info.bmiHeader.biWidth=nw;info.bmiHeader.biHeight=-nh;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
  HDC screen=GetDC(nullptr);dc=CreateCompatibleDC(screen);bitmap=CreateDIBSection(screen,&info,DIB_RGB_COLORS,(void**)&bits,nullptr,0);ReleaseDC(nullptr,screen);
  if(!bitmap||!dc)throw std::runtime_error("Native surface allocation");old=SelectObject(dc,bitmap);
 }
};
struct Panel {
 HWND window=nullptr;Surface surface;PetPaint::Rect crop;
 void release(){if(window)DestroyWindow(window);window=nullptr;surface.release();crop={};}
};
static std::array<Panel,PetPaint::MaxRegions> panels;
static void releasePanels(){for(auto& p:panels)p.release();}
static void hidePanels(){releasePanels();}
static uint64_t paintBytes(){uint64_t total=0;for(const auto& p:panels)total+=p.surface.bytes();return total;}
static size_t paintCount(){size_t n=0;for(const auto& p:panels)if(p.window)n++;return n;}
struct DotAtlas {
 int cell=0;uint32_t color=0;std::vector<uint8_t> pixels;
 void ensure(int value){
  if(cell==value&&color==ink().GetValue())return;cell=value;color=ink().GetValue();size_t length=(size_t)cell*cell*2*4;pixels.assign(length*256,0);
  static const int dx[]={0,0,0,1,1,1,0,1},dy[]={0,1,2,0,1,2,3,3};float step=cell/2.f,diameter=std::max(1.1f,step*.48f);
  for(int mask=0;mask<256;mask++){Gdiplus::Bitmap bitmap(cell,cell*2,cell*4,PixelFormat32bppPARGB,pixels.data()+mask*length);Gdiplus::Graphics g(&bitmap);g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);Gdiplus::SolidBrush brush(ink());for(int bit=0;bit<8;bit++)if(mask&(1<<bit)){float x=(dx[bit]+.5f)*step,y=(dy[bit]+.5f)*step;g.FillEllipse(&brush,x-diameter/2,y-diameter/2,diameter,diameter);}}
 }
};
static DotAtlas atlas;
static uint64_t verifiedPaints=0;
static std::vector<uint8_t> assemble(const PetPaint::Rect& all,int cell){
 const int width=all.width()*cell,height=all.height()*cell*2;std::vector<uint8_t> image((size_t)width*height*4,0);
 for(const auto& p:panels)if(p.window){const auto& r=p.crop;const int w=r.width()*cell,h=r.height()*cell*2;
  for(int y=0;y<h;y++)memcpy(image.data()+((size_t)((r.top-all.top)*cell*2+y)*width+(r.left-all.left)*cell)*4,p.surface.bits+(size_t)y*p.surface.width*4,(size_t)w*4);
 }
 return image;
}
static void verifyPaint(const std::vector<uint8_t>& masks,int columns,const PetPaint::Rect& all,int cell){
 const int w=all.width()*cell,h=all.height()*cell*2;std::vector<uint8_t> reference((size_t)w*h*4,0);
 {Gdiplus::Bitmap bitmap(w,h,w*4,PixelFormat32bppPARGB,reference.data());Gdiplus::Graphics g(&bitmap);g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);Gdiplus::SolidBrush brush(ink());
  static const int dx[]={0,0,0,1,1,1,0,1},dy[]={0,1,2,0,1,2,3,3};float step=cell/2.f,diameter=std::max(1.1f,step*.48f);
  for(int y=all.top;y<all.bottom;y++)for(int x=all.left;x<all.right;x++){int mask=masks[(size_t)y*columns+x];for(int bit=0;bit<8;bit++)if(mask&(1<<bit)){float px=(x-all.left)*cell+(dx[bit]+.5f)*step,py=(y-all.top)*cell*2+(dy[bit]+.5f)*step;g.FillEllipse(&brush,px-diameter/2,py-diameter/2,diameter,diameter);}}g.Flush(Gdiplus::FlushIntentionSync);
 }
 if(reference!=assemble(all,cell))throw std::runtime_error("Partitioned dots changed pixels");verifiedPaints++;
 if(!atlasVerified){printf("{\"stage\":\"dot-atlas-verified\",\"pixelExact\":true,\"regions\":%zu}\n",paintCount());fflush(stdout);}atlasVerified=true;
}
static void paint(const std::string& text,int columns,int rows,int cell,POINT canvas){
 std::vector<uint8_t> masks((size_t)columns*rows);size_t at=0;
 for(int y=0;y<rows;y++){if(y){if(at>=text.size()||text[at++]!='\n')throw std::runtime_error("Native row separator");}for(int x=0;x<columns;x++){if(at+3>text.size())throw std::runtime_error("Native text length");const auto* p=(const unsigned char*)text.data()+at;uint32_t ch=((p[0]&15)<<12)|((p[1]&63)<<6)|(p[2]&63);at+=3;if(ch<0x2800||ch>0x28ff)throw std::runtime_error("Native glyph");masks[(size_t)y*columns+x]=(uint8_t)(ch-0x2800);}}
 if(at!=text.size())throw std::runtime_error("Native trailing text");
 const auto regions=PetPaint::partition(masks,columns,rows,cell);if(regions.empty()){releasePanels();return;}
 PetPaint::Rect all;for(const auto& r:regions)all.include(r);
 if((int64_t)all.width()*cell*all.height()*cell*2>8000000){hidePanels();visible=false;return;}
 atlas.ensure(cell);const size_t stampSize=(size_t)cell*cell*2*4;
 for(size_t i=0;i<regions.size();i++){
  auto& panel=panels[i];panel.crop=regions[i];const auto& r=panel.crop;auto& surface=panel.surface;
  if(!panel.window){panel.window=CreateWindowEx(WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE|WS_EX_TOPMOST,L"RetrieviewerNativeDots",L"",WS_POPUP,0,0,1,1,nullptr,nullptr,GetModuleHandle(nullptr),nullptr);if(!panel.window)throw std::runtime_error("Native overlay region");}
  surface.ensure(r.width()*cell,r.height()*cell*2);std::fill(surface.bits,surface.bits+(size_t)surface.width*surface.height*4,0);
  for(int y=r.top;y<r.bottom;y++)for(int x=r.left;x<r.right;x++){int mask=masks[(size_t)y*columns+x];if(!mask)continue;const uint8_t* stamp=atlas.pixels.data()+mask*stampSize;for(int sy=0;sy<cell*2;sy++)memcpy(surface.bits+((size_t)((y-r.top)*cell*2+sy)*surface.width+(x-r.left)*cell)*4,stamp+(size_t)sy*cell*4,cell*4);}
 }
 for(size_t i=regions.size();i<panels.size();i++)panels[i].release();
 if(verifyAtlas&&(!atlasVerified||verifyEveryPaint))verifyPaint(masks,columns,all,cell);
 if(saveProof&&!proofSaved){const int w=all.width()*cell,h=all.height()*cell*2;auto image=assemble(all,cell);Gdiplus::Bitmap source(w,h,w*4,PixelFormat32bppPARGB,image.data()),proof(w,h,PixelFormat32bppARGB);Gdiplus::Graphics pg(&proof);pg.Clear(Gdiplus::Color(255,0,0,0));pg.DrawImage(&source,Gdiplus::Rect(0,0,w,h),0,0,w,h,Gdiplus::UnitPixel);pg.Flush(Gdiplus::FlushIntentionSync);CLSID png={0x557cf406,0x1a04,0x11d3,{0x9a,0x73,0x00,0x00,0xf8,0x1e,0xf3,0x2e}};if(proof.Save(wide(proofPath).c_str(),&png,nullptr)!=Gdiplus::Ok)throw std::runtime_error("PNG proof failed");proofSaved=true;}
 // Prepare every region before uploading any. The disjoint cell boundaries
 // neither duplicate alpha nor clip a glyph; all share the same source frame.
 HDC screen=GetDC(nullptr);BLENDFUNCTION blend={AC_SRC_OVER,0,255,AC_SRC_ALPHA};POINT origin={0,0};
 for(size_t i=0;i<regions.size();i++){auto& p=panels[i];POINT destination={canvas.x+p.crop.left*cell,canvas.y+p.crop.top*cell*2};SIZE size={p.crop.width()*cell,p.crop.height()*cell*2};BOOL ok=UpdateLayeredWindow(p.window,screen,&destination,&size,p.surface.dc,&origin,0,&blend,ULW_ALPHA);if(!ok){ReleaseDC(nullptr,screen);throw std::runtime_error("Native layered update");}SetWindowPos(p.window,HWND_TOPMOST,destination.x,destination.y,size.cx,size.cy,SWP_NOACTIVATE|SWP_SHOWWINDOW);}
 ReleaseDC(nullptr,screen);painted++;
}
static int selfTestPaintRegions(){
 uint32_t random=731;auto next=[&](){random^=random<<13;random^=random>>17;random^=random<<5;return random;};size_t checks=0;
 for(int cell:{6,8,10,12,16,24,32})for(int type=0;type<8;type++){
  const int cols=type==7?1000:240,rows=type==7?125:90;std::vector<uint8_t> masks((size_t)cols*rows);
  for(int y=0;y<rows;y++)for(int x=0;x<cols;x++){bool on=type==1||type==2&&x%61==0||type==3&&y%31==0||type==4&&(x<20||x>cols-30)&&y>10||type==5&&(next()%100<4)||type==6&&((x-cols/2)*(x-cols/2)+(y-rows/2)*(y-rows/2)<900)||type==7&&x%97<3&&y%17<2;if(on)masks[(size_t)y*cols+x]=(uint8_t)(1+next()%255);}
  const auto regions=PetPaint::partition(masks,cols,rows,cell);if(regions.size()>PetPaint::MaxRegions)throw std::runtime_error("Region count overflow");std::vector<uint8_t> seen(masks.size(),0);PetPaint::Rect all;uint64_t bytes=0;
  for(const auto& r:regions){if(r.empty()||r.left<0||r.top<0||r.right>cols||r.bottom>rows)throw std::runtime_error("Region outside grid");all.include(r);bytes+=PetPaint::bytes(r,cell);for(int y=r.top;y<r.bottom;y++)for(int x=r.left;x<r.right;x++)if(++seen[(size_t)y*cols+x]!=1)throw std::runtime_error("Overlapping paint regions");}
  for(size_t i=0;i<masks.size();i++)if(masks[i]&&seen[i]!=1)throw std::runtime_error("Missing mask cell");if(bytes>PetPaint::bytes(all,cell))throw std::runtime_error("Partition grew allocation");checks++;
 }
 Surface s;s.ensure(2048,1024);const auto big=s.bytes();s.ensure(1800,900);if(s.bytes()!=big)throw std::runtime_error("Surface churn on small size change");s.ensure(96,64);if(s.bytes()>(uint64_t)128*64*4*2)throw std::runtime_error("Surface did not shrink");s.release();if(s.bytes()!=0)throw std::runtime_error("Surface did not release");
 printf("{\"passed\":true,\"partitionCases\":%zu,\"coverageAndDisjointness\":true,\"surfaceShrink\":true}\n",checks);return 0;
}
