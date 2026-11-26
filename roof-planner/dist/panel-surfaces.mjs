import {selectedPan} from './panel-catalog.mjs';
import {FT, area, axes, clipX, fromUV} from './geometry.mjs';
import {wallPoint} from './walls.mjs';

const INCH = FT / 12;
const EPS = 1e-7;
const MAX_COORDINATES = 1350000;

// The seams and pan treatments describe the exposed installed face. Published coverage,
// height, cap dimensions and available rib counts are retained. Undimensioned roll and
// relief bends are visual approximations and never enter the material takeoff.
function finishedPan(profile,width,pan) {
 const height=profile.height, cap=profile.cap??.375;
 const clearance=profile.id==='easy-lock'?.22:.15;
 const left=.10, crown=left+.045, side=crown+cap, foot=side+clearance;
 let section=[[0,0],[left,0],[left,height*.75],[crown,height],[side,height],[side+.035,height*.94],[foot,0]];
 const start=foot+.16, end=width-.22, span=end-start;
 const flush=profile.id.startsWith('smoothwall');
 const batten=profile.id==='board-batten'||profile.id.startsWith('t-panel');
 if(batten)section=[[0,0],[left,0],[left,height],[left+cap,height],[foot,0]];
 if(flush)section=[[0,0],[left,0],[foot,height],[foot+.06,height]];
 if(span<=0)return [...section,[width,0]];
 const panStart=section.length;
 if(pan.id==='striated'||pan.id==='light-striated'){
  // Shallow continuous rolling across the pan; leave a clear margin at both seams.
  const relief=pan.id==='light-striated'?.026:.045, ribs=Math.max(2,Math.round(span/.82));
  section.push([start,0]);
  for(let i=1;i<=ribs*6;i++){
   const phase=i%6;
   section.push([start+span*i/(ribs*6),relief*(1-Math.cos(Math.PI*phase/3))/2]);
  }
 }else if(pan.id==='accent'||pan.id==='accent-2'||pan.id==='pencil'){
  const count=pan.count||2, half=pan.id==='pencil'?.095:.24;
  for(let i=1;i<=count;i++){
   const center=start+span*i/(count+1);
   section.push([center-half,0],[center-half*.28,.072],[center+half*.28,.072],[center+half,0]);
  }
 }else if(pan.id==='single-v'||pan.id==='double-v'){
  const count=pan.id==='double-v'?2:1;
  section.push([start,.06]);
  for(let i=1;i<=count;i++){
   const center=start+span*i/(count+1);
   section.push([center-.09,.06],[center,0],[center+.09,.06]);
  }
  section.push([end,.06]);
 }
 if(flush){
  for(let i=panStart;i<section.length;i++){
   const point=section[i];
   point[1]=pan.id.endsWith('-v')?height-.06+point[1]:height-point[1];
  }
  section.push([width-.06,height],[width,0]);
 }else section.push([width,0]);
 return section;
}

// The section runs across installed coverage. Heights represent the exposed metal face.
export function panelSection(profile, width, panStyle) {
 if (!profile?.shape || !Number.isFinite(width) || width <= 0) return [];
 const {shape, height, pitch, cap, base, secondary, points} = profile;
 const pan=selectedPan(profile,width,panStyle);
 if(pan)return finishedPan(profile,width,pan);
 if (points) return points.map(([x,z])=>[x*width,z*height]);
 if (shape==='flat') return [[0,0],[width,0]];
 if (shape==='wave') {
  const repeats=Math.max(1,Math.round(width/pitch));
  // Nominal installed cover rounds several fractional pitches to the nearest fraction.
  // Sampling whole waves at both lap stations keeps consecutive installed sheets continuous.
  const stations=repeats*24;
  return Array.from({length:stations+1},(_,i)=>[i*width/stations,height*(1+Math.cos(2*Math.PI*(i%24)/24))/2]);
 }
 const spacing=pitch||width;
 const crest=cap??(shape==='seam'?.375:shape==='v'?.02:spacing*.16);
 const foot=base??(shape==='seam'?crest+.12:shape==='v'?spacing*.3:spacing*.36);
 const candidates=[];
 for(let x=0;x<=width+spacing;x+=spacing){
  candidates.push([x-foot/2,0],[x-crest/2,height],[x+crest/2,height],[x+foot/2,0]);
  if(secondary && x<width) {
   for(const fraction of secondary.stations) {
    const center=x+spacing*fraction;
    candidates.push([center-secondary.base/2,0],[center,secondary.height],[center+secondary.base/2,0]);
   }
  }
 }
 // The partial edge keeps the elevation of the surrounding profile at its cut.
 candidates.sort((a,b)=>a[0]-b[0]);
 const inRange=[];
 for(let i=1;i<candidates.length;i++){
  const [left,low]=candidates[i-1], [right,high]=candidates[i];
  const x0=Math.max(0,left),x1=Math.min(width,right);
  if(x1-x0<=EPS)continue;
  const at=x=>low+(high-low)*(x-left)/(right-left);
  if(!inRange.length)inRange.push([x0,at(x0)]);
  inRange.push([x1,at(x1)]);
 }
 return inRange;
}

function uprightFold(out,poly,station,lower,upper,toWorld) {
 const runs=[];
 for(let j=0;j<poly.length;j++){
  const a=poly[j],b=poly[(j+1)%poly.length];
  if(Math.abs(a.x-station)<=EPS)runs.push(a.y);
  if((a.x<station-EPS&&b.x>station+EPS)||(b.x<station-EPS&&a.x>station+EPS)){
   runs.push(a.y+(b.y-a.y)*(station-a.x)/(b.x-a.x));
  }
 }
 if(runs.length<2)return;
 const near=Math.min(...runs),far=Math.max(...runs);
 if(far-near<=EPS)return;
 const point=(y,z)=>toWorld({x:station,y},z*INCH);
 const a=point(near,lower),b=point(near,upper),c=point(far,upper),d=point(far,lower);
 out.push(...a,...b,...c,...a,...c,...d);
}

function appendProfile(out, poly, section, start, unit, toWorld) {
 if (!poly.length) return;
 const low=Math.min(...poly.map(p=>p.x)), high=Math.max(...poly.map(p=>p.x));
 for(let i=1;i<section.length;i++){
  const [x0,z0]=section[i-1],[x1,z1]=section[i];
  const left=start+x0*unit,right=start+x1*unit;
  if(Math.abs(right-left)<=EPS){
   // At a shared triangle or cell boundary only one side owns the fold.
   const inside=left>=low-EPS&&left<high-EPS;
   const finalFold=i===section.length-1;
   if((finalFold?left>low+EPS&&left<=high+EPS:inside)&&Math.abs(z0-z1)>EPS)uprightFold(out,poly,left,z0,z1,toWorld);
   continue;
  }
  if(right<=low+EPS || left>=high-EPS)continue;
  const band=clipX(clipX(poly,left,true),right,false);
  if(band.length<3 || area(band)<EPS)continue;
  const vertices=band.map(p=>toWorld(p,(z0+(z1-z0)*(p.x-left)/(right-left))*INCH));
  for(let j=1;j<vertices.length-1;j++)out.push(...vertices[0],...vertices[j],...vertices[j+1]);
 }
}

// Clip original plan triangles against the installed panel grid. Each band is convex,
// including on roofs where one cut strip covers disconnected areas.
export function roofPanelSurface(row, section, width, triangles) {
 const out=[],bearing=row.face.bearing, across=Math.min(...row.uv.map(p=>p.x));
 const perPanel=width*INCH;
 const pitch=row.face.pitch/12, downslope=axes(bearing).v, factor=1/Math.hypot(1,pitch);
 const normal=[downslope.x*pitch*factor,factor,-downslope.y*pitch*factor];
 const toWorld=(uv,depth)=>{
  const p=fromUV(uv,bearing),lift=depth+.0015;
  return [p.x+normal[0]*lift,row.height(p)+normal[1]*lift,-p.y+normal[2]*lift];
 };
 for(const indices of triangles){
  const triangle=indices.map(i=>row.uv[i]), low=Math.min(...triangle.map(p=>p.x)), high=Math.max(...triangle.map(p=>p.x));
  const first=Math.max(0,Math.floor((low-across)/perPanel)), last=Math.ceil((high-across)/perPanel-EPS);
  for(let i=first;i<last;i++){
   const station=across+i*perPanel;
   appendProfile(out,triangle,section,station,INCH,toWorld);
   if(out.length>MAX_COORDINATES)return [];
  }
 }
 return out;
}

export function wallPanelSurface(row, section, outward=1) {
 const out=[],span=row.widthFeet*FT;
 if(span<=0)return out;
 const nx=outward*(row.b.y-row.a.y)/span,nz=outward*(row.b.x-row.a.x)/span;
 const toWorld=(p,depth)=>{
  const position=wallPoint(row,p.x,p.y),lift=depth+.0015;
  return [position.x+nx*lift,position.y,position.z+nz*lift];
 };
 for(const panel of row.panels)for(const cell of panel.cells){
  const polygon=[
   {x:cell.left,y:cell.bottom},{x:cell.right,y:cell.bottom},
   {x:cell.right,y:cell.topRight},{x:cell.left,y:cell.topLeft}
  ];
  appendProfile(out,polygon,section,panel.startFeet,1/12,toWorld);
  if(out.length>MAX_COORDINATES)return [];
 }
 return out;
}

export function triangulatePanelFace(points) {
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const signed=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0);
 const order=points.map((_,i)=>i);
 if(signed<0)order.reverse();
 const triangles=[];
 while(order.length>3){
  let found=false;
  for(let i=0;i<order.length;i++){
   const a=order[(i+order.length-1)%order.length], b=order[i],c=order[(i+1)%order.length];
   const p=points[a],q=points[b],r=points[c],bend=cross(p,q,r);
   if(Math.abs(bend)<=1e-10){order.splice(i,1);found=true;break;}
   if(bend<0)continue;
   if(order.some(j=>j!==a&&j!==b&&j!==c&&cross(p,q,points[j])>=-1e-10&&cross(q,r,points[j])>=-1e-10&&cross(r,p,points[j])>=-1e-10))continue;
   triangles.push([a,b,c]);order.splice(i,1);found=true;break;
  }
  if(!found)return [];
 }
 if(order.length===3)triangles.push(order);
 return triangles;
}
