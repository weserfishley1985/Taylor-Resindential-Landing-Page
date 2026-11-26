import {FT,project,unproject,distance,validPolygon,planeEquation,planeData,toUV,junctionReport,vertexJunctionReport} from './geometry.mjs';
import {getPanelProfile} from './panel-catalog.mjs';
import {getWalls} from './walls.mjs';
import {buildingTrimParts,roofEdgeBand} from './building-trim.mjs';
import {triangulatePanelFace} from './panel-surfaces.mjs';

export const trimDefaults={ridgeCap:false,casing:false,eave:false,rake:false,fascia:false,ridgeWing:6,casingWidth:3,eaveDepth:2,rakeDepth:4,rakeWing:3,fasciaDepth:6,stockLength:10,color:'#d6dce0'};
export const trimTypes=[['ridgeCap','Ridge cap'],['casing','Opening casing'],['eave','Eave trim'],['rake','Rake trim'],['fascia','Fascia']];
export const trimDimensions=[
 ['ridgeWing','Ridge cap wing (in)',1,24,'ridgeCap'],
 ['casingWidth','Casing face width (in)',0.5,12,'casing'],
 ['eaveDepth','Eave trim face height (in)',0.5,12,'eave'],
 ['rakeDepth','Rake trim face height (in)',0.5,18,'rake'],
 ['rakeWing','Rake trim roof leg (in)',0.5,18,'rake'],
 ['fasciaDepth','Fascia face height (in)',1,24,'fascia'],
 ['stockLength','Stock piece length (ft)',1,40,'']
];
export function readTrimSettings(raw={}) {
 const settings={...trimDefaults};
 for(const [key] of trimTypes) {
  if(raw[key]!==undefined && typeof raw[key]!=='boolean')throw Error('Invalid trim selection: '+key);
  settings[key]=raw[key]??trimDefaults[key];
 }
 for(const [key,label,min,max] of trimDimensions){
  const value=Number(raw[key]??trimDefaults[key]);
  if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+label.toLowerCase()+'. Enter '+min+' to '+max+'.');
  settings[key]=value;
 }
 if(/^#[a-f\d]{6}$/i.test(raw.color||''))settings.color=raw.color;
 return settings;
}

const same=(a,b)=>distance(a,b)<.001;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
function intersection(a,u,b,v){const det=cross(u,v);if(Math.abs(det)<1e-9)throw Error('This corner is too straight to offset safely.');const d={x:b.x-a.x,y:b.y-a.y},t=cross(d,v)/det;return {x:a.x+t*u.x,y:a.y+t*u.y}}
export function addRoofOverhang(faces,origin,faceId,edgeIndex,inches){
 const next=structuredClone(faces),face=next.find(f=>f.id===faceId),offset=Number(inches)/12*FT;
 if(!face||!['Eave','Rake'].includes(face.edges[edgeIndex])||!Number.isFinite(offset)||offset<=0||offset>4*FT)throw Error('Select an Eave or Rake and enter an added overhang from 0 to 48 inches.');
 const equations=new Map(next.map(f=>[f.id,planeEquation(f,origin)])),records=next.flatMap(f=>{const points=f.points.map(p=>project(p,origin)),signed=points.reduce((sum,p,i)=>sum+cross(p,points[(i+1)%points.length]),0);return points.map((a,i)=>{const b=points[(i+1)%points.length],len=distance(a,b),u={x:(b.x-a.x)/len,y:(b.y-a.y)/len};return {f,i,points,a,b,u,n:signed>0?{x:u.y,y:-u.x}:{x:-u.y,y:u.x}}})});
 const selected=records.find(r=>r.f.id===faceId&&r.i===edgeIndex),chain=[selected];
 if(records.some(r=>r!==selected&&((same(r.a,selected.a)&&same(r.b,selected.b))||(same(r.b,selected.a)&&same(r.a,selected.b)))))throw Error('Overhangs require an exterior roof edge, not a shared roof seam.');
 if(face.edges[edgeIndex]==='Rake'){let changed=true;while(changed){changed=false;for(const r of records){if(chain.includes(r)||r.f.edges[r.i]!=='Rake')continue;if(Math.abs(cross(r.u,selected.u))>1e-6||r.n.x*selected.n.x+r.n.y*selected.n.y<.999)continue;if(chain.some(c=>same(c.a,r.a)||same(c.a,r.b)||same(c.b,r.a)||same(c.b,r.b))){chain.push(r);changed=true}}}}
 const moves=[];for(const r of chain){const n=r.points.length,previous=r.points[(r.i+n-1)%n],after=r.points[(r.i+2)%n],a={x:r.a.x+r.n.x*offset,y:r.a.y+r.n.y*offset},b={x:r.b.x+r.n.x*offset,y:r.b.y+r.n.y*offset},newA=intersection(a,r.u,previous,{x:r.a.x-previous.x,y:r.a.y-previous.y}),newB=intersection(b,r.u,r.b,{x:after.x-r.b.x,y:after.y-r.b.y});for(const [old,p]of [[r.a,newA],[r.b,newB]]){if(distance(old,p)>offset*8)throw Error('This corner needs too large a movement; adjust it manually.');const found=moves.find(m=>same(m.old,old));if(found&&!same(found.p,p))throw Error('The rake corners have conflicting offsets.');if(!found)moves.push({old,p})}}
 for(const f of next){let changed=false;f.points=f.points.map(p=>{const move=moves.find(m=>same(m.old,project(p,origin)));if(!move)return p;changed=true;return unproject(move.p,origin)});if(!changed)continue;const points=f.points.map(p=>project(p,origin));if(!validPolygon(points))throw Error('The overhang would cross roof boundaries.');const low=points.reduce((a,b)=>toUV(a,f.bearing).y>toUV(b,f.bearing).y?a:b);f.eave=equations.get(f.id).height(low)/FT;if(f.eave<0||f.eave>200)throw Error('Overhang would move the roof outside the supported elevation range.')}
 const before=junctionReport(faces,origin),after=junctionReport(next,origin),key=j=>[j.left.face.id+':'+j.left.index,j.right.face.id+':'+j.right.index].sort().join('|'),bad=new Set(before.filter(j=>j.status!=='aligned').map(key)),vertexKey=j=>j.faces.map(f=>f.id).sort().join('|'),badVertices=new Set(vertexJunctionReport(faces,origin).filter(j=>j.status!=='aligned').map(vertexKey));if(after.some(j=>j.status!=='aligned'&&!bad.has(key(j)))||vertexJunctionReport(next,origin).some(j=>j.status!=='aligned'&&!badVertices.has(vertexKey(j))))throw Error('The overhang would create a pitched-plane junction conflict.');
 return next;
}
// An exterior roof edge may sit flush with the wall panels or beyond them at an overhang.
function wallClearance(a,b,walls,ribHeight) {
 const dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy);
 for(const wall of walls){
  const signedDistance=p=>((p.x-a.x)*dy-(p.y-a.y)*dx)/span;
  if(Math.max(Math.abs(signedDistance(wall.a)),Math.abs(signedDistance(wall.b)))>.005)continue;
  const station=p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/span;
  const range=[station(wall.a),station(wall.b)].sort((x,y)=>x-y);
  if(Math.min(range[1],span)-Math.max(range[0],0)>.005)return ribHeight+.004;
 }
 return .002;
}

function exteriorTrim(state,settings) {
 const members=[];
 if(!settings.eave&&!settings.fascia&&!settings.rake)return members;
 const inch=FT/12,edgeKey=(a,b)=>[a,b].map(p=>p.lat.toFixed(7)+','+p.lng.toFixed(7)).sort().join('|');
 const occurrences=new Map();
 for(const face of state.faces)face.points.forEach((p,i)=>{
  const key=edgeKey(p,face.points[(i+1)%face.points.length]);
  occurrences.set(key,(occurrences.get(key)||0)+1);
 });
 const walls=getWalls(state);
 const wallRib=(getPanelProfile(state.wallPanels?.profileId,'wall')?.height||0)*inch;
 const roofRib=(getPanelProfile(state.settings?.profileId,'roof')?.height||0)*inch;
 for(const face of state.faces){
  const data=planeData(face,state.origin),pts=data.points;
  const winding=Math.sign(pts.reduce((sum,p,i)=>sum+cross(p,pts[(i+1)%pts.length]),0));
  let triangles;
  for(let i=0;i<pts.length;i++){
   const type=face.edges[i],j=(i+1)%pts.length;
   if((type!=='Eave'&&type!=='Rake')||occurrences.get(edgeKey(face.points[i],face.points[j]))!==1)continue;
   const a=pts[i],b=pts[j],span=distance(a,b);
   if(span<1e-8)continue;
   const dx=(b.x-a.x)/span,dy=(b.y-a.y)/span,nx=dy*winding,ny=-dx*winding;
   const za=data.height(a),zb=data.height(b),length=Math.hypot(span,zb-za)/FT;
   const clearance=wallClearance(a,b,walls,wallRib);
   const p=(v,z,out)=>({x:v.x+nx*out,y:v.y+ny*out,z});
   const surf=points=>({faceId:face.id,points});
   const front=(out,top,drop)=>surf([p(a,za+top,out),p(b,zb+top,out),p(b,zb-drop,out),p(a,za-drop,out)]);
   const top=(out,lift)=>surf([p(a,za+lift,0),p(b,zb+lift,0),p(b,zb+lift,out),p(a,za+lift,out)]);
   const add=(kind,surfaces)=>members.push({kind,faceId:face.id,length,surfaces});
   if(settings.fascia)add('Fascia',[front(clearance,0,settings.fasciaDepth*inch),top(clearance,0)]);
   if(type==='Eave'&&settings.eave)add('Eave trim',[front(clearance+.004,.003,settings.eaveDepth*inch),top(clearance+.004,.003)]);
   if(type==='Rake'&&settings.rake){
    const lift=roofRib*Math.hypot(1,face.pitch/12)+.005;
    triangles??=triangulatePanelFace(pts);
    const legs=roofEdgeBand(data,triangles,a,b,-nx,-ny,settings.rakeWing*inch,lift,face.id);
    add('Rake trim',[...legs,top(clearance+.004,lift),front(clearance+.004,lift,settings.rakeDepth*inch-lift)]);
   }
  }
 }
 return members;
}

export function roofTrimLayout(state) {
 const settings={...trimDefaults,...state.trim};
 const extra=buildingTrimParts(state,settings);
 const segments=[...exteriorTrim(state,settings),...extra.parts];
 const totals=trimTypes.filter(([key])=>settings[key]).map(([,kind])=>({kind,length:0,pieces:0,runs:0}));
 const byKind=new Map(totals.map(row=>[row.kind,row]));
 for(const member of segments){
  const row=byKind.get(member.kind);
  member.pieces=Math.max(1,Math.ceil(member.length/settings.stockLength-1e-7));
  row.length+=member.length;row.pieces+=member.pieces;row.runs++;
 }
 return {settings,segments,totals,warnings:extra.warnings,eave:byKind.get('Eave trim')?.length||0,
  eavePieces:byKind.get('Eave trim')?.pieces||0,fascia:byKind.get('Fascia')?.length||0,fasciaPieces:byKind.get('Fascia')?.pieces||0};
}
