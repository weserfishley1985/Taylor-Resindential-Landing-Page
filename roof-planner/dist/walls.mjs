import {FT,project,distance,planeData} from './geometry.mjs';

// Return piecewise straight wall tops at the actual intersections with the
// linked roof surfaces. Coordinates along a wall and its heights are in feet.
function roofWallProfile(wall, faces) {
 const dx=(wall.b.x-wall.a.x)/(wall.widthFeet*FT), dy=(wall.b.y-wall.a.y)/(wall.widthFeet*FT);
 const pt=x=>({x:wall.a.x+x*FT*dx,y:wall.a.y+x*FT*dy});
 const eps=1e-6, breaks=[0,wall.widthFeet], spans=[];
 for(const face of faces){
  const points=face.points.map(p=>({x:((p.x-wall.a.x)*dx+(p.y-wall.a.y)*dy)/FT,y:((p.y-wall.a.y)*dx-(p.x-wall.a.x)*dy)/FT}));
  const crossings=[];
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length];
   const ay=Math.abs(a.y)<eps?0:a.y,by=Math.abs(b.y)<eps?0:b.y;
   // A wall coinciding with the exterior roof boundary still meets the roof.
   if(!ay&&!by&&Math.abs(a.x-b.x)>eps)spans.push({lo:Math.min(a.x,b.x),hi:Math.max(a.x,b.x),face});
   if((ay>0)!==(by>0))crossings.push(a.x+(b.x-a.x)*ay/(ay-by));
  }
  crossings.sort((a,b)=>a-b);
  for(let i=1;i<crossings.length;i+=2)if(crossings[i]-crossings[i-1]>eps)spans.push({lo:crossings[i-1],hi:crossings[i],face});
 }
 for(const {lo,hi} of spans)for(const x of [lo,hi])if(x>eps&&x<wall.widthFeet-eps)breaks.push(x);
 breaks.sort((a,b)=>a-b);
 const xs=breaks.filter((x,i)=>!i||x-breaks[i-1]>eps),segments=[];
 let needsReview=false;
 for(let i=1;i<xs.length;i++){
  const left=xs[i-1],right=xs[i],mid=(left+right)/2;
  const hits=[...new Set(spans.filter(s=>mid>s.lo&&mid<s.hi).map(s=>s.face))];
  let topLeft=wall.height,topRight=wall.height;
  if(hits.length&&hits.every(f=>Math.abs(f.height(pt(left))-hits[0].height(pt(left)))<1e-5&&Math.abs(f.height(pt(right))-hits[0].height(pt(right)))<1e-5)){
   topLeft=hits[0].height(pt(left))/FT;topRight=hits[0].height(pt(right))/FT;
  }else needsReview=true;
  if(segments.length&&Math.abs(topLeft-segments.at(-1).topRight)>.001)needsReview=true;
  segments.push({left,right,topLeft,topRight});
 }
 return {segments,needsReview};
}

export function getWalls(state){
 const walls=[],roofData=new Map(),byId=new Map((state.faces||[]).map(f=>[f.id,f]));
 const parts=state.building?.parts||(state.building?.footprint?[state.building]:[]);
 for(const [i,part] of parts.entries()){
  let roofs;
  if(Array.isArray(part.roofFaceIds))roofs=part.roofFaceIds.filter(id=>byId.has(id)).map(id=>{
   if(!roofData.has(id))roofData.set(id,planeData(byId.get(id),state.origin));
   return roofData.get(id);
  });
  const footprint=part.footprint;
  const rectangle=footprint.length===4 && footprint[0].lng<footprint[1].lng && footprint[1].lat<footprint[2].lat &&
   Math.abs(footprint[0].lat-footprint[1].lat)<1e-10 && Math.abs(footprint[2].lat-footprint[3].lat)<1e-10 &&
   Math.abs(footprint[0].lng-footprint[3].lng)<1e-10 && Math.abs(footprint[1].lng-footprint[2].lng)<1e-10;
  const elevations=['South','East','North','West'];
  for(let edge=0;edge<footprint.length;edge++){
   const wallName=rectangle?elevations[edge]+' wall':'wall '+(edge+1);
   walls.push({id:`${part.id||'building-'+i}:${edge}`,name:`${part.name||'Main house'} / ${wallName}`,
    a:footprint[edge],b:footprint[(edge+1)%footprint.length],height:part.wallHeight,roofs});
  }
 }
 walls.push(...(state.walls||[]));
 return walls.map(({roofs,...wall})=>{
  const a=project(wall.a,state.origin),b=project(wall.b,state.origin);
  const result={...wall,a,b,widthFeet:distance(a,b)/FT,openings:(state.wallOpenings||[]).filter(o=>o.wallId===wall.id)};
  if(roofs&&result.widthFeet>0)result.profile=roofWallProfile(result,roofs);
  return result;
 });
}
function wallSpans(wall){
 return wall.profile?.segments||[{left:0,right:wall.widthFeet,topLeft:wall.height,topRight:wall.height}];
}
function topAt(segment,x){
 return segment.topLeft+(segment.topRight-segment.topLeft)*(x-segment.left)/(segment.right-segment.left);
}
export function wallBlankHeight(wall,start,end){
 let peak=0;
 for(const seg of wallSpans(wall)){
  const left=Math.max(start,seg.left),right=Math.min(end,seg.right);
  if(right>left)peak=Math.max(peak,topAt(seg,left),topAt(seg,right));
 }
 return peak;
}
export function validateOpening(wall,opening,others=[]){
 const {offset,width,height,sill}=opening,end=offset+width;
 if(![offset,width,height,sill].every(Number.isFinite)||offset<0||width<=0||height<=0||sill<0||end>wall.widthFeet+1e-6||wallSpans(wall).some(seg=>{
  const left=Math.max(seg.left,offset),right=Math.min(seg.right,end);
  return right>left&&sill+height>Math.min(topAt(seg,left),topAt(seg,right))+1e-6;
 }))throw Error('The opening must fit within the wall. Check its offset, width, height, and sill height.');
 if(others.some(o=>o.wallId===wall.id&&offset<o.offset+o.width-1e-6&&end>o.offset+1e-6&&sill<o.sill+o.height-1e-6&&sill+height>o.sill+1e-6))throw Error('This opening overlaps another door or window.');
}
// Each cell has a horizontal bottom and two top corner heights. Split at
// roof kinks, opening jambs and roof/opening crossings for exact integration.
export function wallCells(wall,start=0,end=wall.widthFeet){
 const cells=[];
 for(const seg of wallSpans(wall)){
  const lo=Math.max(seg.left,start),hi=Math.min(seg.right,end);if(hi-lo<1e-8)continue;
  const holes=wall.openings.filter(o=>o.offset<hi&&o.offset+o.width>lo).sort((a,b)=>a.sill-b.sill);
  const breaks=new Set([lo,hi]);
  for(const o of holes){
   for(const x of [o.offset,o.offset+o.width])if(x>lo&&x<hi)breaks.add(x);
   if(Math.abs(seg.topRight-seg.topLeft)>1e-8)for(const z of [o.sill,o.sill+o.height]){
    const x=seg.left+(z-seg.topLeft)*(seg.right-seg.left)/(seg.topRight-seg.topLeft);
    if(x>lo&&x<hi&&x>o.offset&&x<o.offset+o.width)breaks.add(x);
   }
  }
  const xs=[...breaks].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++){
   const left=xs[i-1],right=xs[i],mid=(left+right)/2;
   const h0=topAt(seg,left),h1=topAt(seg,right);
   const add=(bottom,cap)=>{
    const topLeft=Math.max(bottom,Math.min(h0,cap)),topRight=Math.max(bottom,Math.min(h1,cap));
    if(Math.max(topLeft,topRight)-bottom>1e-8)cells.push({left,right,bottom,top:(topLeft+topRight)/2,topLeft,topRight});
   };
   let bottom=0;
   for(const o of holes)if(mid>o.offset&&mid<o.offset+o.width){add(bottom,o.sill);bottom=Math.max(bottom,o.sill+o.height)}
   add(bottom,Infinity);
  }
 }
 return cells;
}
export function wallPoint(wall,x,z){const t=x/wall.widthFeet;return {x:wall.a.x+(wall.b.x-wall.a.x)*t,y:z*FT,z:-(wall.a.y+(wall.b.y-wall.a.y)*t)}}

/** Visible installed panel edges on a wall, measured in feet from the wall start and floor. */
export function wallPanelSeams(row) {
 const seams=new Map();
 for(const panel of row.panels){
  for(const cell of panel.cells){
   for(const [station,top] of [[cell.left,cell.topLeft],[cell.right,cell.topRight]]){
    if(Math.abs(station-panel.startFeet)>1e-7 && Math.abs(station-panel.endFeet)>1e-7)continue;
    if(top-cell.bottom<=1e-7)continue;
    const key=Math.round(station*1e7);
    if(!seams.has(key))seams.set(key,{station,spans:[]});
    seams.get(key).spans.push([cell.bottom,top]);
   }
  }
 }
 const lines=[];
 for(const {station,spans} of seams.values()){
  spans.sort((a,b)=>a[0]-b[0]);
  let [bottom,top]=spans[0];
  for(const [nextBottom,nextTop] of spans.slice(1)){
   if(nextBottom<=top+1e-7)top=Math.max(top,nextTop);
   else{lines.push({station,bottom,top});bottom=nextBottom;top=nextTop;}
  }
  lines.push({station,bottom,top});
 }
 return lines;
}
