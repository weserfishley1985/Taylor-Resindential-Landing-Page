import {wallCells,getWalls,wallBlankHeight,validateOpening} from './walls.mjs';
import {standardizePanelLengths,measuredPanelInches} from './panel-lengths.mjs';
export const wallPanelDefaults={show:false,width:36,maxLength:20,allowance:0,color:'#82949e'};
const INCH_TOLERANCE=1e-6;

function addPoint(points,x,y){
 const previous=points[points.length-1];
 if(!previous||Math.abs(x-previous.x)>INCH_TOLERANCE||Math.abs(y-previous.y)>INCH_TOLERANCE)points.push({x,y});
}
function topProfile(wall,start,end){
 const points=[],segments=wall.profile?.segments;
 if(!segments)return [{x:0,y:wall.height*12},{x:(end-start)*12,y:wall.height*12}];
 for(const seg of segments){
  const lo=Math.max(start,seg.left),hi=Math.min(end,seg.right);
  if(hi<=lo)continue;
  const slope=(seg.topRight-seg.topLeft)/(seg.right-seg.left);
  for(const x of [lo,hi])addPoint(points,(x-start)*12,(seg.topLeft+(x-seg.left)*slope)*12);
 }
 return points;
}

// Clip one rectangular opening to a strip and its installed roof line.
// An edited slope can cross the opening's head or sill between roof vertices.
function openingCuts(opening,start,installedWidthInches,profile){
 const left=Math.max(0,(opening.offset-start)*12),right=Math.min(installedWidthInches,(opening.offset+opening.width-start)*12);
 const sill=Math.max(0,opening.sill*12),head=(opening.sill+opening.height)*12;
 if(right-left<=INCH_TOLERANCE||head-sill<=INCH_TOLERANCE)return [];
 const pieces=[];
 let piece=null;
 for(let i=1;i<profile.length;i++){
  const a=profile[i-1],b=profile[i];
  if(b.x-a.x<=INCH_TOLERANCE)continue;
  const lo=Math.max(left,a.x),hi=Math.min(right,b.x);
  if(hi-lo<=INCH_TOLERANCE)continue;
  const slope=(b.y-a.y)/(b.x-a.x),z=x=>a.y+(x-a.x)*slope;
  const xs=[lo,hi];
  if(Math.abs(slope)>1e-12)for(const level of [sill,head]){
   const x=a.x+(level-a.y)/slope;
   if(x>lo+INCH_TOLERANCE&&x<hi-INCH_TOLERANCE)xs.push(x);
  }
  xs.sort((u,v)=>u-v);
  for(let k=1;k<xs.length;k++){
   const x0=xs[k-1],x1=xs[k],z0=z(x0),z1=z(x1);
   if((z0+z1)/2<=sill+INCH_TOLERANCE){piece=null;continue}
   const h0=Math.max(sill,Math.min(z0,head)),h1=Math.max(sill,Math.min(z1,head));
   const last=piece?.top.at(-1);
   if(!last||Math.abs(last.x-x0)>INCH_TOLERANCE||Math.abs(last.y-h0)>INCH_TOLERANCE||h0<=sill+INCH_TOLERANCE){
    piece={top:[],touchesRoof:false};pieces.push(piece);
   }
   addPoint(piece.top,x0,h0);addPoint(piece.top,x1,h1);
   if(Math.min(z0,z1)<=head+INCH_TOLERANCE)piece.touchesRoof=true;
  }
 }
 return pieces.map(({top,touchesRoof})=>{
  const x=top[0].x,right=top[top.length-1].x,edges=[];
  if(x<=INCH_TOLERANCE)edges.push('left');
  if(right>=installedWidthInches-INCH_TOLERANCE)edges.push('right');
  if(sill<=INCH_TOLERANCE)edges.push('bottom');
  if(touchesRoof)edges.push('top');
  const points=[];
  addPoint(points,x,sill);addPoint(points,right,sill);
  for(let i=top.length-1;i>=0;i--)addPoint(points,top[i].x,top[i].y);
  if(points.length>1&&Math.abs(points.at(-1).x-x)<=INCH_TOLERANCE&&Math.abs(points.at(-1).y-sill)<=INCH_TOLERANCE)points.pop();
  return {openingId:opening.id,kind:opening.kind,cutType:edges.length?'notch':'cutout',edges,
   xInches:x,yInches:sill,widthInches:right-x,heightInches:Math.max(...top.map(p=>p.y))-sill,points};
 });
}

export function wallPanelLayout(state){
 const settings={...wallPanelDefaults,...state.wallPanels},rows=[];
 for(const [index,wall] of getWalls(state).entries()){
  const {a,b,widthFeet}=wall;
  if(widthFeet<=0||wallBlankHeight(wall,0,widthFeet)<=0)continue;
  const unfit=new Set();
  for(const o of wall.openings){
   try{validateOpening(wall,o)}catch{unfit.add(o)}
  }
  const profileNeedsReview=Boolean(wall.profile?.needsReview);
  const coverage=settings.width/12,total=Math.ceil(widthFeet/coverage-1e-7),panels=[];
  if(total>12000)throw Error('Wall is too long for the selected coverage.');
  const at=x=>({x:a.x+(b.x-a.x)*x/widthFeet,y:a.y+(b.y-a.y)*x/widthFeet});
  for(let i=0;i<total;i++){
   const start=i*coverage,end=Math.min(widthFeet,(i+1)*coverage),cells=wallCells(wall,start,end);
   if(!cells.length)continue;
   const overlapping=wall.openings.filter(o=>o.offset<end&&o.offset+o.width>start);
   const profilePoints=topProfile(wall,start,end),installedWidthInches=(end-start)*12;
   const peakInches=profilePoints.reduce((max,p)=>Math.max(max,p.y),0),height=peakInches/12;
   const rawLengthInches=measuredPanelInches(peakInches+settings.allowance,1e-7);
   const cutouts=overlapping.flatMap(o=>openingCuts(o,start,installedWidthInches,profilePoints));
   panels.push({id:`${wall.id}:panel-${i+1}`,stripNumber:i+1,startFeet:start,endFeet:end,installedWidthInches,
    rawLengthInches,profilePoints,cutouts,cutReview:profileNeedsReview||overlapping.some(o=>unfit.has(o)),a:at(start),b:at(end),height,cells});
  }
  standardizePanelLengths(panels,{enabled:state.settings?.groupPanelLengths===true,maxLengthFeet:settings.maxLength});
  const cells=wallCells(wall),area=cells.reduce((sum,c)=>sum+(c.right-c.left)*(c.top-c.bottom),0);
  rows.push({...wall,edge:index+1,cutReview:profileNeedsReview||unfit.size>0,panels,count:panels.length,length:panels.reduce((n,p)=>Math.max(n,p.length),0),area,cells});
 }
 return {settings,rows,count:rows.reduce((n,r)=>n+r.count,0),area:rows.reduce((n,r)=>n+r.area,0),
  orderArea:rows.reduce((n,r)=>n+r.panels.reduce((sum,p)=>sum+p.length*settings.width/12,0),0),
  oversize:rows.reduce((n,r)=>n+r.panels.filter(p=>p.oversize).length,0)};
}
