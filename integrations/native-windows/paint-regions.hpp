#pragma once
#include <algorithm>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

// Cell-aligned, non-overlapping crops of the FINAL mask. No animal/layer redraw.
namespace PetPaint {
constexpr size_t MaxRegions=8;
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
struct Split {Rect box,a,b;uint64_t saved=0;};
inline Split bestSplit(const std::vector<uint8_t>& masks,int columns,const Rect& box,int cell){
 Split result;result.box=box;const auto parent=bytes(box,cell);
 for(bool horizontal:{false,true}){
  const int n=horizontal?box.height():box.width();std::vector<Rect> bins(n),suffix(n+1);
  for(int y=box.top;y<box.bottom;y++)for(int x=box.left;x<box.right;x++)
   if(masks[(size_t)y*columns+x])bins[horizontal?y-box.top:x-box.left].include(x,y);
  for(int i=n-1;i>=0;i--){suffix[i]=suffix[i+1];suffix[i].include(bins[i]);}
  Rect prefix;
  for(int i=0;i+1<n;i++){
   prefix.include(bins[i]);const Rect& other=suffix[i+1];if(prefix.empty()||other.empty())continue;
   const auto cost=bytes(prefix,cell)+bytes(other,cell);
   if(cost<parent&&parent-cost>result.saved){result.saved=parent-cost;result.a=prefix;result.b=other;}
  }
 }
 return result;
}
inline std::vector<Rect> partition(const std::vector<uint8_t>& masks,int columns,int rows,int cell){
 if(columns<1||rows<1||(uint64_t)columns*rows>125000||masks.size()!=(size_t)columns*rows||cell<6||cell>32)throw std::runtime_error("Invalid paint mask grid");
 Rect all;for(int y=0;y<rows;y++)for(int x=0;x<columns;x++)if(masks[(size_t)y*columns+x])all.include(x,y);
 if(all.empty())return {};
 std::vector<Split> nodes{bestSplit(masks,columns,all,cell)};
 // A new HWND must save meaningful surface space, not split every fur fleck.
 constexpr uint64_t MinimumSaving=256*1024;
 while(nodes.size()<MaxRegions){
  size_t best=0;for(size_t i=1;i<nodes.size();i++)if(nodes[i].saved>nodes[best].saved)best=i;
  if(nodes[best].saved<MinimumSaving)break;
  const auto selected=nodes[best];nodes[best]=bestSplit(masks,columns,selected.a,cell);
  nodes.push_back(bestSplit(masks,columns,selected.b,cell));
 }
 std::vector<Rect> result;for(const auto& node:nodes)result.push_back(node.box);
 return result;
}
}
