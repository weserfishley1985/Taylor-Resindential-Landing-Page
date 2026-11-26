import {FT, area, clipX, distance, planeData} from './geometry.mjs';
import {getWalls, validateOpening} from './walls.mjs';
import {getPanelProfile} from './panel-catalog.mjs';
import {panelSection, triangulatePanelFace} from './panel-surfaces.mjs';

const inch=FT/12;
const vertexKey=p=>p.lat.toFixed(7)+','+p.lng.toFixed(7);
const swap=p=>({x:p.y,y:p.x});
const range=(poly,lo,hi)=>clipX(clipX(poly,lo,true),hi,false);
function panelLift(settings,surface){
 const profile=getPanelProfile(settings?.profileId,surface);
 const section=profile?panelSection(profile,settings.width,settings.panStyle):[];
 return .004+inch*section.reduce((highest,p)=>Math.max(highest,p[1]),0);
}
function winding(points){
 const a=points[0];
 return Math.sign(points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];
  return sum+(p.x-a.x)*(q.y-a.y)-(q.x-a.x)*(p.y-a.y);
 },0));
}
// Clip a band to its roof face. Width is measured perpendicular to the 3D run, on the slope.
export function roofEdgeBand(data,triangles,a,b,nx,ny,width,lift,faceId){
 const len=distance(a,b),tx=(b.x-a.x)/len,ty=(b.y-a.y)/len;
 const rise=(dx,dy)=>data.height({x:a.x+dx,y:a.y+dy})-data.height(a);
 const gt=rise(tx,ty),gn=rise(nx,ny);
 const skew=gt*gn/(1+gt*gt),span=width*Math.sqrt((1+gt*gt)/(1+gt*gt+gn*gn));
 const local=data.points.map(v=>{
  const x=v.x-a.x,y=v.y-a.y,t=x*nx+y*ny;
  return {x:x*tx+y*ty+skew*t,y:t};
 });
 const surfaces=[];
 for(const tri of triangles){
  const strip=range(range(tri.map(i=>local[i]),0,len).map(swap),0,span);
  if(strip.length<3||area(strip)<1e-10)continue;
  const points=strip.map(({x:t,y:s})=>{
   const u=s-skew*t,x=a.x+tx*u+nx*t,y=a.y+ty*u+ny*t;
   return {x,y,z:data.height({x,y})+lift};
  });
  surfaces.push({faceId,points});
 }
 return surfaces;
}
function ridgeWing(owner,a,b,wing,lift){
 const {data,index,face}=owner,p=data.points[index],q=data.points[(index+1)%data.points.length];
 const edge=distance(p,q),sign=winding(data.points);
 const nx=-sign*(q.y-p.y)/edge,ny=sign*(q.x-p.x)/edge;
 if(data.height({x:a.x+nx,y:a.y+ny})-data.height(a)>=-1e-8)return null;
 const surfaces=roofEdgeBand(data,triangulatePanelFace(data.points),a,b,nx,ny,wing,lift,face.id);
 return {nx,ny,surfaces};
}
function addCaps(state,settings,parts,warnings){
 const seams=new Map();
 for(const face of state.faces){
  const data=planeData(face,state.origin);
  face.points.forEach((p,index)=>{
   const key=[vertexKey(p),vertexKey(face.points[(index+1)%face.points.length])].sort().join('|');
   if(!seams.has(key))seams.set(key,[]);
   seams.get(key).push({face,index,data,type:face.edges[index]});
  });
 }
 const clearance=panelLift(state.settings,'roof');
 for(const owners of seams.values()){
  if(!owners.some(o=>o.type==='Ridge'))continue;
  const detail=owners.map(o=>o.face.name+' edge '+(o.index+1)).join(' / ');
  if(owners.length!==2||owners.some(o=>o.type!=='Ridge'&&o.type!=='Unlabeled')){
   warnings.push(detail+' needs two adjoining ridge sides.');continue;
  }
  const [u,v]=owners,a=u.data.points[u.index],b=u.data.points[(u.index+1)%u.data.points.length];
  if([a,b].some(p=>Math.abs(u.data.height(p)-v.data.height(p))>.001)){
   warnings.push(detail+' has different roof heights. Solve the ridge before adding its cap.');continue;
  }
  const lift=clearance*Math.max(...owners.map(o=>Math.hypot(1,o.face.pitch/12)));
  const wings=owners.map(owner=>ridgeWing(owner,a,b,settings.ridgeWing*inch,lift));
  if(wings.some(w=>!w?.surfaces.length)||wings[0].nx*wings[1].nx+wings[0].ny*wings[1].ny>-.999){
   warnings.push(detail+' needs two opposing roof planes sloping away from the ridge.');continue;
  }
  parts.push({kind:'Ridge cap',detail,a,b,faceIds:owners.map(o=>o.face.id),
   length:Math.hypot(distance(a,b),u.data.height(a)-u.data.height(b))/FT,surfaces:wings.flatMap(w=>w.surfaces)});
 }
}
function addCasing(state,settings,parts,warnings){
 const casing=settings.casingWidth/12,clearance=panelLift(state.wallPanels,'wall'),orientation=new Map();
 const buildings=state.building?.parts||(state.building?.footprint?[state.building]:[]);
 buildings.forEach((part,i)=>{
  const sign=winding(part.footprint.map(p=>({x:p.lng,y:p.lat})));
  part.footprint.forEach((_,j)=>orientation.set((part.id||'building-'+i)+':'+j,sign));
 });
 for(const wall of getWalls(state)){
  const len=wall.widthFeet*FT,ux=(wall.b.x-wall.a.x)/len,uy=(wall.b.y-wall.a.y)/len,sign=orientation.get(wall.id)||1;
  const point=(station,height)=>({x:wall.a.x+ux*station*FT+sign*uy*clearance,y:wall.a.y+uy*station*FT-sign*ux*clearance,z:height*FT});
  const frames=wall.openings.map(o=>({wallId:wall.id,offset:o.offset-casing,width:o.width+2*casing,
   sill:o.sill-(o.kind==='Window'?casing:0),height:o.height+casing*(o.kind==='Window'?2:1)}));
  wall.openings.forEach((o,i)=>{
   const name=wall.name+' / '+o.kind+' at '+Number(o.offset.toFixed(2))+' ft';
   try{validateOpening(wall,frames[i],frames.filter((_,j)=>i!==j));}
   catch{warnings.push(name+' needs more casing clearance to the wall boundary or an adjoining opening.');return;}
   const left=o.offset,right=left+o.width,bottom=o.sill,top=bottom+o.height;
   function add(label,x0,x1,z0,z1,length){
    const points=[point(x0,z0),point(x1,z0),point(x1,z1),point(x0,z1)];
    parts.push({kind:'Opening casing',detail:name+' · '+label,wallId:wall.id,openingId:o.id,length,surfaces:[{wallId:wall.id,points}]});
   }
   add('Left jamb',left-casing,left,bottom,top,o.height);
   add('Right jamb',right,right+casing,bottom,top,o.height);
   add('Head',left-casing,right+casing,top,top+casing,o.width+2*casing);
   if(o.kind==='Window')add('Sill',left-casing,right+casing,bottom-casing,bottom,o.width+2*casing);
  });
 }
}
export function buildingTrimParts(state,settings){
 const parts=[],warnings=[];
 if(settings.ridgeCap)addCaps(state,settings,parts,warnings);
 if(settings.casing)addCasing(state,settings,parts,warnings);
 return {parts,warnings};
}
