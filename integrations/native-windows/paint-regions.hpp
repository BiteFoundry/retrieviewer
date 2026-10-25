#pragma once
#include <algorithm>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

// One final-mask crop and one layered-window upload per scene. Separate HWNDs
// cannot present a repartitioned frame atomically, even with identical pixels.
namespace PetPaint {
constexpr size_t MaxRegions=1;
struct Rect {
 int left=std::numeric_limits<int>::max(),top=std::numeric_limits<int>::max();
 int right=0,bottom=0;
 bool empty() const {return left>=right||top>=bottom;}
 int width() const {return empty()?0:right-left;}
 int height() const {return empty()?0:bottom-top;}
 void include(int x,int y){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
 void include(const Rect& r){if(!r.empty()){left=std::min(left,r.left);top=std::min(top,r.top);right=std::max(right,r.right);bottom=std::max(bottom,r.bottom);}}
};
inline int rounded(int n){return (n+63)/64*64;}
inline uint64_t bytes(const Rect& r,int cell){return r.empty()?0:(uint64_t)rounded(r.width()*cell)*rounded(r.height()*cell*2)*4;}
inline std::vector<Rect> partition(const std::vector<uint8_t>& masks,int columns,int rows,int cell){
 if(columns<1||rows<1||(uint64_t)columns*rows>125000||masks.size()!=(size_t)columns*rows||cell<6||cell>32)throw std::runtime_error("Invalid paint mask grid");
 Rect all;for(int y=0;y<rows;y++)for(int x=0;x<columns;x++)if(masks[(size_t)y*columns+x])all.include(x,y);
 return all.empty()?std::vector<Rect>{}:std::vector<Rect>{all};
}
}
