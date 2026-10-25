#include <quickjs.h>
#include <quickjs-libc.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <string>
#include <vector>
#include <stdexcept>
#include <iostream>
#include <zlib.h>
#include "native-window.hpp"

struct Bytes { JSContext* ctx; JSValue owner; uint8_t* p; size_t n;
 Bytes(JSContext* c,JSValueConst arg):ctx(c){size_t offset,bpe;owner=JS_GetTypedArrayBuffer(c,arg,&offset,&n,&bpe);if(JS_IsException(owner))throw std::runtime_error("Expected pixels");size_t all;p=JS_GetArrayBuffer(c,&all,owner)+offset;}
 ~Bytes(){JS_FreeValue(ctx,owner);}
};
static double number(JSContext* c,JSValueConst obj,const char* key){JSValue v=JS_GetPropertyStr(c,obj,key);double n;int result=JS_ToFloat64(c,&n,v);JS_FreeValue(c,v);if(result<0)throw std::runtime_error(key);return n;}
static double clamp(double n,double low,double high){return std::max(low,std::min(high,n));}
static uint8_t byteClamp(double v){if(v<=0)return 0;if(v>=255)return 255;double f=floor(v),d=v-f;return (uint8_t)(f+(d>.5||(d==.5&&((int)f&1))?1:0));}
static JSValue failure(JSContext* c,const std::exception& e){return JS_ThrowTypeError(c,"%s",e.what());}
static JSValue inflateGzip(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{Bytes compressed(c,a[0]);int32_t size;JS_ToInt32(c,&size,a[1]);if(size<0||size>640*641)throw std::runtime_error("Inflate size");std::vector<uint8_t> out(std::max(1,size));z_stream z{};z.next_in=compressed.p;z.avail_in=(uInt)compressed.n;z.next_out=out.data();z.avail_out=(uInt)out.size();if(inflateInit2(&z,31)!=Z_OK)throw std::runtime_error("Inflate init");int result=inflate(&z,Z_FINISH);auto total=z.total_out;inflateEnd(&z);if(result!=Z_STREAM_END||total!=(uLong)size)throw std::runtime_error("Invalid crop gzip");JSValue buffer=JS_NewArrayBufferCopy(c,out.data(),size);JSValue typed=JS_NewTypedArray(c,1,&buffer,JS_TYPED_ARRAY_UINT8);JS_FreeValue(c,buffer);return typed;}catch(const std::exception& e){return failure(c,e);}}
static int paeth(int a,int b,int d){int p=a+b-d,aa=abs(p-a),bb=abs(p-b),dd=abs(p-d);return aa<=bb&&aa<=dd?a:bb<=dd?b:d;}
static JSValue decodeRows(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{Bytes out(c,a[0]),rows(c,a[1]);int32_t x,y,w,h,width;JS_ToInt32(c,&x,a[2]);JS_ToInt32(c,&y,a[3]);JS_ToInt32(c,&w,a[4]);JS_ToInt32(c,&h,a[5]);JS_ToInt32(c,&width,a[6]);if(x<0||y<0||w<0||h<0||width<1||x+w>width||rows.n!=(size_t)h*(w+1)||((size_t)y+h)*width>out.n)throw std::runtime_error("Decode rows bounds");std::fill(out.p,out.p+out.n,0);std::vector<uint8_t> prev(w,0),cur(w,0);size_t at=0;for(int r=0;r<h;r++){int type=rows.p[at++];if(type>4)throw std::runtime_error("Filter");for(int col=0;col<w;col++){int left=col?cur[col-1]:0,up=prev[col],diagonal=col?prev[col-1]:0,p=type==0?0:type==1?left:type==2?up:type==3?(left+up)>>1:paeth(left,up,diagonal),q=(rows.p[at++]+p)&255;if(q>31)throw std::runtime_error("Q5 pixel");cur[col]=(uint8_t)q;out.p[((size_t)y+r)*width+x+col]=(uint8_t)floor(q*255/31.0+.5);}std::swap(cur,prev);}return JS_UNDEFINED;}catch(const std::exception& e){return failure(c,e);}}
static JSValue clearPixels(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{Bytes out(c,a[0]);std::fill(out.p,out.p+out.n,0);for(size_t i=3;i<out.n;i+=4)out.p[i]=255;return JS_UNDEFINED;}catch(const std::exception& e){return failure(c,e);}}
static JSValue copyGray(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{Bytes out(c,a[0]),gray(c,a[1]);if(out.n<gray.n*4)throw std::runtime_error("Gray size");for(size_t i=0,j=0;i<gray.n;i++,j+=4)out.p[j]=out.p[j+1]=out.p[j+2]=gray.p[i];return JS_UNDEFINED;}catch(const std::exception& e){return failure(c,e);}}
static JSValue blendGray(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{Bytes out(c,a[0]),x(c,a[1]),y(c,a[2]);double t;JS_ToFloat64(c,&t,a[3]);if(x.n!=y.n||out.n<x.n*4)throw std::runtime_error("Blend size");for(size_t i=0,j=0;i<x.n;i++,j+=4){const auto v=byteClamp(x.p[i]*(1-t)+y.p[i]*t);out.p[j]=out.p[j+1]=out.p[j+2]=v;}return JS_UNDEFINED;}catch(const std::exception& e){return failure(c,e);}}
static JSValue catBlit(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{
 Bytes out(c,a[0]),gray(c,a[1]);const auto opts=a[2];int width=(int)number(c,opts,"width"),height=(int)number(c,opts,"height");double px=number(c,opts,"x"),py=number(c,opts,"y"),size=number(c,opts,"size");JSValue mirrored=JS_GetPropertyStr(c,opts,"mirror");bool mirror=JS_ToBool(c,mirrored);JS_FreeValue(c,mirrored);
 if(width<1||height<1||(int64_t)width*height>1000000||out.n!=(size_t)width*height*4||gray.n!=320*320||!std::isfinite(size)||size<=0)throw std::runtime_error("Cat raster bounds");
 struct Pin{double sx,sy,dx,dy,radius;};std::vector<Pin> pins;JSValue list=JS_GetPropertyStr(c,opts,"pins"),len=JS_GetPropertyStr(c,list,"length");uint32_t count;JS_ToUint32(c,&count,len);JS_FreeValue(c,len);if(count>16)throw std::runtime_error("Cat pin limit");for(uint32_t i=0;i<count;i++){JSValue p=JS_GetPropertyUint32(c,list,i),s=JS_GetPropertyStr(c,p,"source"),t=JS_GetPropertyStr(c,p,"target");double radius=number(c,p,"radius");if(!std::isfinite(radius))radius=28;Pin pin{number(c,s,"x"),number(c,s,"y"),number(c,t,"x")-number(c,s,"x"),number(c,t,"y")-number(c,s,"y"),radius};JS_FreeValue(c,s);JS_FreeValue(c,t);JS_FreeValue(c,p);pins.push_back(pin);}JS_FreeValue(c,list);
 double left=px-size*.5,top=py-size*(290.0/320);int x0=std::max(0,(int)floor(left)),y0=std::max(0,(int)floor(top)),x1=std::min(width,(int)ceil(left+size)),y1=std::min(height,(int)ceil(top+size));
 for(int y=y0;y<y1;y++)for(int x=x0;x<x1;x++){double u=(x+.5-left)*320/size-.5,v=(y+.5-top)*320/size-.5;if(mirror)u=319-u;if(v>225)for(const auto& p:pins){if(p.radius<=0||hypot(p.dx,p.dy)>std::min(6.0,.22*p.radius)||fabs(p.dy)>3||hypot(u-p.sx,v-p.sy)>=p.radius)continue;double q=u-p.dx,r=v-p.dy;for(int i=0;i<12;i++){double distance=hypot(q-p.sx,r-p.sy),t=clamp((distance-p.radius*.3)/(p.radius*.7),0,1),weight=1-t*t*(3-2*t);q=u-p.dx*weight;r=v-p.dy*weight;}u=q;v=r;break;}if(u<0||v<0||u>319||v>319)continue;int ax=(int)floor(u),by=(int)floor(v),aa=std::min(319,ax+1),bb=std::min(319,by+1);double fu=u-ax,fv=v-by,value=(gray.p[by*320+ax]*(1-fu)+gray.p[by*320+aa]*fu)*(1-fv)+(gray.p[bb*320+ax]*(1-fu)+gray.p[bb*320+aa]*fu)*fv;auto b=(uint8_t)floor(value+.5);size_t at=((size_t)y*width+x)*4;out.p[at]=out.p[at+1]=out.p[at+2]=b;}
 return JS_UNDEFINED;
 }catch(const std::exception& e){return failure(c,e);}}
static JSValue braille(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{
 Bytes pixels(c,a[0]);int32_t width,height;double brightness,contrast;JS_ToInt32(c,&width,a[1]);JS_ToInt32(c,&height,a[2]);JS_ToFloat64(c,&brightness,a[3]);JS_ToFloat64(c,&contrast,a[4]);
 if(width<1||height<1||(int64_t)width*height>1000000||pixels.n!=(size_t)width*height*4)throw std::runtime_error("Braille dimensions");
 static float table[256];static double lastB=0,lastC=0;if(lastB!=brightness||lastC!=contrast){for(int i=0;i<256;i++){double l=(.2126*i+.7152*i+.0722*i)/255;table[i]=(float)(l==0?0:clamp((pow(l,.9)*brightness-.5)*contrast+.5,0,1));}lastB=brightness;lastC=contrast;}
 const int cols=(width+1)/2,rows=(height+3)/4;static const int bits[4][2]={{1,8},{2,16},{4,32},{64,128}};std::vector<uint8_t> masks(cols*rows,0);int dots=0;
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){auto* p=pixels.p+((size_t)y*width+x)*4;int r=p[0],g=p[1],b=p[2],alpha=p[3];if(alpha==0||!(r|g|b))continue;float value;
  if(alpha==255&&r==g&&g==b)value=table[r];else{double l=(.2126*r+.7152*g+.0722*b)/255*(alpha/255.0);value=(float)(l==0?0:clamp((pow(l,.9)*brightness-.5)*contrast+.5,0,1));}if(value<=0)continue;
  uint32_t hash=(uint32_t)(x+1)*0x1f123bb5u^(uint32_t)(y+1)*0x5f356495u;hash=(hash^(hash>>16))*0x45d9f3bu;hash=(hash^(hash>>16))*0x45d9f3bu;hash^=hash>>16;
  if(value>(hash+.5)/4294967296.0){masks[(y>>2)*cols+(x>>1)]|=bits[y&3][x&1];dots++;}
 }
 std::string text;text.reserve((size_t)cols*rows*3+rows);for(int y=0;y<rows;y++){if(y)text+='\n';for(int x=0;x<cols;x++){uint32_t ch=0x2800+masks[y*cols+x];text+=(char)(0xe0|(ch>>12));text+=(char)(0x80|((ch>>6)&63));text+=(char)(0x80|(ch&63));}}
 JSValue out=JS_NewObject(c);JS_SetPropertyStr(c,out,"text",JS_NewStringLen(c,text.data(),text.size()));JS_SetPropertyStr(c,out,"columns",JS_NewInt32(c,cols));JS_SetPropertyStr(c,out,"rows",JS_NewInt32(c,rows));JS_SetPropertyStr(c,out,"dots",JS_NewInt32(c,dots));return out;
 }catch(const std::exception& e){return failure(c,e);}}
struct Layer {double lo,hi,dx,dy,toe,span,a,lastY=NAN,lastSource=NAN;};
static double smooth(double t){return t<=0?0:t>=1?1:t*t*(3-2*t);}
static double gy(const Layer& l,double s){double t=(s-226)/l.span;return t<=0?0:t>=1?1:(1-l.a)*smooth(t)+l.a*t;}
static double inverseY(Layer& l,double y){if(l.dy==0)return y;if(y>=l.toe+l.dy)return y-l.dy;if(y==l.lastY)return l.lastSource;double lo=226,hi=l.toe;for(int i=0;i<48&&hi-lo>1e-9;i++){double m=(lo+hi)/2;if(m+l.dy*gy(l,m)<y)lo=m;else hi=m;}l.lastY=y;l.lastSource=(lo+hi)/2;return l.lastSource;}
static JSValue blit(JSContext* c,JSValueConst,int argc,JSValueConst* a){try{
 Bytes output(c,a[0]),image(c,a[1]);JSValueConst opts=a[2];const int width=(int)number(c,opts,"width"),height=(int)number(c,opts,"height"),sourceN=(int)number(c,opts,"sourceN");
 const double left=number(c,opts,"left"),top=number(c,opts,"top"),side=number(c,opts,"side"),sideX=number(c,opts,"sideX"),originX=number(c,opts,"originX"),originY=number(c,opts,"originY"),drawTop=number(c,opts,"drawTop"),bottom=number(c,opts,"bottom"),drawLeft=number(c,opts,"drawLeft"),drawRight=number(c,opts,"drawRight");
 JSValue flipValue=JS_GetPropertyStr(c,opts,"flip");bool flip=JS_ToBool(c,flipValue);JS_FreeValue(c,flipValue);
 if(width<1||height<1||(int64_t)width*height>1000000||sourceN<1||sourceN>640||output.n!=(size_t)width*height*4||image.n<(size_t)sourceN*sourceN*4||side<=0||sideX<=0)throw std::runtime_error("Blit dimensions");
 JSValue layersValue=JS_GetPropertyStr(c,opts,"layers"),length=JS_GetPropertyStr(c,layersValue,"length");uint32_t count;JS_ToUint32(c,&count,length);JS_FreeValue(c,length);if(count>16)throw std::runtime_error("Layer limit");std::vector<Layer> layers;
 for(uint32_t i=0;i<count;i++){JSValue v=JS_GetPropertyUint32(c,layersValue,i);Layer l;l.lo=number(c,v,"lo");l.hi=number(c,v,"hi");l.dx=number(c,v,"dx");l.dy=number(c,v,"dy");l.toe=number(c,v,"toeTop");l.span=l.toe-226;l.a=0;if(l.dy<0){double k=.9*l.span/-l.dy;if(k<1)l.a=1;else if(k<1.5)l.a=std::min(1.0,3-2*k);}JS_FreeValue(c,v);layers.push_back(l);}JS_FreeValue(c,layersValue);
 const bool minify=side<320||sideX<320;int pitch=sourceN+1;std::vector<uint32_t> sums;
 if(minify){sums.assign(pitch*pitch,0);for(int y=0;y<sourceN;y++){uint32_t row=0;for(int x=0;x<sourceN;x++){row+=image.p[((size_t)y*sourceN+x)*4];sums[(y+1)*pitch+x+1]=sums[y*pitch+x+1]+row;}}}
 auto integral=[&](double x,double y){x=clamp(x,0,sourceN);y=clamp(y,0,sourceN);int ix=std::min(sourceN-1,(int)floor(x)),iy=std::min(sourceN-1,(int)floor(y));double fx=x-ix,fy=y-iy;size_t k=iy*pitch+ix;return (sums[k]*(1-fx)+sums[k+1]*fx)*(1-fy)+(sums[k+pitch]*(1-fx)+sums[k+pitch+1]*fx)*fy;};
 auto area=[&](double x,double y){double dx=320/sideX,dy=320/side,l=x-dx/2,r=x+dx/2,t=y-dy/2,b=y+dy/2;return std::max(0.0,(integral(r,b)-integral(l,b)-integral(r,t)+integral(l,t))/(dx*dy));};
 auto opaque=[&](double x,double y){double xx=x+originX,yy=y+originY;if(xx<0||xx>=sourceN||yy<0||yy>=sourceN)return false;int sx=(int)floor(xx);if(flip)sx=sourceN-1-sx;return image.p[((size_t)floor(yy)*sourceN+sx)*4]>16;};
 const int y0=std::max(0,(int)(minify?floor(drawTop):ceil(drawTop-.5))),y1=std::min(height,(int)(minify?ceil(bottom):ceil(bottom-.5))),x0=std::max(0,(int)(minify?floor(drawLeft):ceil(drawLeft-.5))),x1=std::min(width,(int)(minify?ceil(drawRight):ceil(drawRight-.5)));
 for(int y=y0;y<y1;y++)for(int x=x0;x<x1;x++){
  double px=(x+.5-left)/sideX*320,py=(y+.5-top)/side*320,wx=px,wy=py;bool claimed=true;
  if(py>=226&&!layers.empty()){claimed=false;bool fallback=false;double fallbackX=0,fallbackY=0;for(auto& l:layers){double sx,sy;if(l.dx==0&&l.dy==0){sx=px;sy=py;}else{sy=inverseY(l,py);sx=sy>=l.toe?px-l.dx:px-l.dx*smooth((sy-226)/l.span);}if(!(sx>=l.lo&&sx<l.hi))continue;if(opaque(sx,sy)){wx=sx;wy=sy;claimed=true;break;}if(!fallback){fallback=true;fallbackX=sx;fallbackY=sy;}}if(!claimed&&fallback){wx=fallbackX;wy=fallbackY;claimed=true;}}
  if(!claimed)continue;double rawX=wx+originX,rawY=wy+originY;int sx=(int)clamp(floor(rawX),0,sourceN-1),sy=(int)clamp(floor(rawY),0,sourceN-1);if(flip)sx=sourceN-1-sx;size_t j=((size_t)y*width+x)*4,k=((size_t)sy*sourceN+sx)*4;
  uint8_t value=byteClamp(minify?area(flip?sourceN-rawX:rawX,rawY):(rawY<0||rawY>=sourceN||rawX<0||rawX>=sourceN?0:image.p[k]));output.p[j]=output.p[j+1]=output.p[j+2]=value;
 }
 return JS_UNDEFINED;
 }catch(const std::exception& e){return failure(c,e);}}
int wmain(int argc,wchar_t** wideArgs){
 std::vector<std::string> argText;for(int i=0;i<argc;i++){int n=WideCharToMultiByte(CP_UTF8,0,wideArgs[i],-1,nullptr,0,nullptr,nullptr);std::string value(n,0);WideCharToMultiByte(CP_UTF8,0,wideArgs[i],-1,value.data(),n,nullptr,nullptr);value.pop_back();argText.push_back(value);}std::vector<char*> args;for(auto& text:argText)args.push_back(text.data());char** argv=args.data();
 if(argc==2&&std::string(argv[1])=="--self-test-regions")try{return NativePet::selfTestPaintRegions();}catch(const std::exception& e){fprintf(stderr,"%s\n",e.what());return 1;}
 bool production=false;for(int i=1;i<argc;i++)if(std::string(argv[i])=="--production")production=true;std::string configuration;
 if(production){char ch;while(std::cin.get(ch)&&ch!='\n'){if(configuration.size()>=8192)return 2;configuration+=ch;}if(configuration.empty())return 2;}
 if(argc<2)return 2;JSRuntime* rt=JS_NewRuntime();js_std_init_handlers(rt);JSContext* ctx=JS_NewContext(rt);JS_SetModuleLoaderFunc2(rt,nullptr,js_module_loader,js_module_check_attributes,nullptr);js_init_module_std(ctx,"qjs:std");js_init_module_os(ctx,"qjs:os");js_std_add_helpers(ctx,argc-1,argv+1);
 JSValue global=JS_GetGlobalObject(ctx),fast=JS_NewObject(ctx);if(production){JSValue config=JS_ParseJSON(ctx,configuration.data(),configuration.size(),"native-config");if(JS_IsException(config)){js_std_dump_error(ctx);return 2;}JS_SetPropertyStr(ctx,global,"__nativeConfig",config);}JS_SetPropertyStr(ctx,fast,"catBlit",JS_NewCFunction(ctx,catBlit,"catBlit",3));JS_SetPropertyStr(ctx,fast,"inflate",JS_NewCFunction(ctx,inflateGzip,"inflate",2));JS_SetPropertyStr(ctx,fast,"decodeRows",JS_NewCFunction(ctx,decodeRows,"decodeRows",7));JS_SetPropertyStr(ctx,fast,"clear",JS_NewCFunction(ctx,clearPixels,"clear",1));JS_SetPropertyStr(ctx,fast,"copyGray",JS_NewCFunction(ctx,copyGray,"copyGray",2));JS_SetPropertyStr(ctx,fast,"blendGray",JS_NewCFunction(ctx,blendGray,"blendGray",4));JS_SetPropertyStr(ctx,fast,"braille",JS_NewCFunction(ctx,braille,"braille",5));JS_SetPropertyStr(ctx,fast,"blit",JS_NewCFunction(ctx,blit,"blit",3));JS_SetPropertyStr(ctx,global,"__fast",fast);JS_FreeValue(ctx,global);
 std::ifstream input(std::filesystem::u8path(argv[1]),std::ios::binary);if(!input){fprintf(stderr,"Native runtime bundle is missing\n");return 2;}std::string source((std::istreambuf_iterator<char>(input)),std::istreambuf_iterator<char>());JSValue value=JS_Eval(ctx,source.data(),source.size(),argv[1],JS_EVAL_TYPE_MODULE);value=js_std_await(ctx,value);int code=0;if(JS_IsException(value)){js_std_dump_error(ctx);code=1;}JS_FreeValue(ctx,value);if(!code)js_std_loop(ctx);
 global=JS_GetGlobalObject(ctx);JSValue desktop=JS_GetPropertyStr(ctx,global,"__desktopReady");bool runWindow=JS_ToBool(ctx,desktop);JS_FreeValue(ctx,desktop);JS_FreeValue(ctx,global);if(!code&&runWindow)try{code=NativePet::run(ctx,argc,argv);}catch(const std::exception& e){fprintf(stderr,"%s\n",e.what());code=1;}
 js_std_free_handlers(rt);JS_FreeContext(ctx);JS_FreeRuntime(rt);return code;
}
