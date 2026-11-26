import {getPanelProfile} from './panel-catalog.mjs';
import {panelSection,roofPanelSurface,wallPanelSurface,triangulatePanelFace} from './panel-surfaces.mjs';
import {FT,planeData,project} from './geometry.mjs';
import {wallPanelLayout} from './wall-panels.mjs';
import {wallPoint,wallPanelSeams} from './walls.mjs';
import {roofTrimLayout} from './roof-trim.mjs';

// Compatibility preview for browsers where WebGL is disabled. It deliberately
// uses the same geographic plane data as the WebGL renderer, but is an SVG
// inspection view rather than a photorealistic renderer.
export function createViewer(host){
 const homeAngle=Math.PI+.58,homeTilt=.46;
 let state,summary,showPanels,drag,down,moved=false,focusMode=false,anchor=null,view={target:{x:0,y:0,z:0},radius:40,theta:homeAngle,phi:.9,zoom:1,tilt:homeTilt};
 const projected=(x,y,z)=>{const c=Math.cos(view.theta),s=Math.sin(view.theta),rx=x*c-z*s,depth=x*s+z*c;return {x:rx,y:-depth*view.tilt-y,depth}};
 const point=(x,y,z)=>{const p=projected(x,y,z);return [p.x,p.y]};
 const make=(tag,attrs={},text='')=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);node.textContent=text;return node};
 let cached=null;
 function geometry(){
  if(cached)return cached;
  const faces=summary.rows.map(row=>({row,data:planeData(row.face,state.origin)}));
  const walls=wallPanelLayout(state),winding=new Map();
  const parts=state.building?.parts||(state.building?.footprint?[state.building]:[]);
  for(const [index,part] of parts.entries()){
   const points=part.footprint.map(p=>project(p,state.origin));
   const signed=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y},0);
   points.forEach((_,i)=>winding.set((part.id||'building-'+index)+':'+i,signed<0?-1:1));
  }
  function sections(settings,surface){
   const profile=getPanelProfile(settings.profileId,surface),full=panelSection(profile,settings.width,settings.panStyle);
   // At building scale tiny pan folds occupy less than a pixel. Preserve the seam there,
   // and draw the full continuous face as soon as a camera can resolve the relief.
   const coarse=profile?.pans?panelSection({...profile,pans:['flat']},settings.width,'flat'):full;
   return {profile,full,coarse};
  }
  const trims=roofTrimLayout(state),wallTrim=new Map(),roofTrim=new Map();
  for(const member of trims.segments)for(const surface of member.surfaces){
   const id=surface.wallId||surface.faceId,owners=surface.wallId?wallTrim:roofTrim;
   if(!owners.has(id))owners.set(id,[]);
   owners.get(id).push({kind:member.kind,points:surface.points});
  }
  cached={faces,walls,winding,trims,wallTrim,roofTrim,roof:sections(state.settings,'roof'),wall:sections(walls.settings,'wall'),mesh:new Map()};
  return cached;
 }
 function update(nextState,nextSummary,nextPanels,reset=false){cached=null;state=nextState;summary=nextSummary;showPanels=nextPanels;redraw(reset);}
 function redraw(reset=false){if(reset){view.zoom=1;anchor=null;}const width=host.clientWidth||900,height=host.clientHeight||560;
  const frameWidth=width*.84,frameHeight=height*.73;
  const svg=make('svg',{viewBox:'0 0 '+width+' '+height,preserveAspectRatio:'xMidYMid meet',role:'img','aria-label':'Compatibility 3D roof preview'}),all=[];
  const model=geometry(),faces=model.faces;
  for(const {data} of faces)for(const p of data.points){all.push(point(p.x,0,-p.y),point(p.x,data.height(p),-p.y))}
  for(const part of state.building?.parts||(state.building?.footprint?[state.building]:[]))for(const geo of part.footprint){const p=project(geo,state.origin);all.push(point(p.x,0,-p.y),point(p.x,part.wallHeight*FT,-p.y))}
  for(const wall of model.walls.rows)for(const p of [wall.a,wall.b])all.push(point(p.x,0,-p.y),point(p.x,wall.height*FT,-p.y));
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),minX=Math.min(...xs,0),maxX=Math.max(...xs,1),minY=Math.min(...ys,0),maxY=Math.max(...ys,1),scale=Math.min(frameWidth/(maxX-minX||1),frameHeight/(maxY-minY||1))*view.zoom,focus=anchor?point(...anchor):[(minX+maxX)/2,(minY+maxY)/2],tx=width/2-focus[0]*scale,ty=height*.51-focus[1]*scale;
  const screen=p=>`${(p[0]*scale+tx).toFixed(2)},${(p[1]*scale+ty).toFixed(2)}`;
  const st=Math.sin(view.theta),ct=Math.cos(view.theta);
  const depth=(x,y,z)=>x*st+z*ct-y*view.tilt,jobs=[];
  function drawMesh(row,description,color,width,acrossX,acrossZ,build,runX=0,runY=1,runZ=0){
   if(!description.full.length)return false;
   const [px,py]=point(acrossX,0,acrossZ),[rx,ry]=point(runX,runY,runZ),run=Math.hypot(rx,ry);
   const perInch=(run>1e-7?Math.abs(px*ry-py*rx)/run:Math.hypot(px,py))*FT/12*scale;
   if(perInch*(description.profile.pitch||width)<1.5)return false;
   const section=perInch>=3?description.full:description.coarse;
   if(!model.mesh.has(row))model.mesh.set(row,new Map());
   const cache=model.mesh.get(row);
   if(!cache.has(section))cache.set(section,new Float32Array(build(section)));
   return formedFacets(cache.get(section),color,perInch<3);
  }
  function formedFacets(coords,color,overview){
   if(!coords.length)return false;
   const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),facets=[];
   for(let i=0;i<coords.length;i+=9){
    const ax=coords[i],ay=coords[i+1],az=coords[i+2],bx=coords[i+3],by=coords[i+4],bz=coords[i+5],cx=coords[i+6],cy=coords[i+7],cz=coords[i+8];
    const a=point(ax,ay,az),b=point(bx,by,bz),c=point(cx,cy,cz);
    if(Math.max(a[0],b[0],c[0])*scale+tx<0||Math.min(a[0],b[0],c[0])*scale+tx>width||Math.max(a[1],b[1],c[1])*scale+ty<0||Math.min(a[1],b[1],c[1])*scale+ty>height)continue;
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const size=Math.hypot(nx,ny,nz);if(size<1e-12)continue;
    const sign=(-nx*st+ny*view.tilt-nz*ct)>=0?1:-1;
    nx*=sign/size;ny*=sign/size;nz*=sign/size;
    const light=Math.max(0,-.62*nx+.70*ny-.35*nz);
    const shade=Math.round(24*(.64+.52*light));
    facets.push({shade,depth:depth(ax+bx+cx,ay+by+cy,az+bz+cz),path:'M'+screen(a)+'L'+screen(b)+'L'+screen(c)+'Z'});
   }
   // Keep SVG node counts bounded on whole-building views with subpixel folds.
   // Within a depth slice those folds share a path for each paint shade.
   if(overview&&facets.length>100){
    let near=Infinity,far=-Infinity;
    for(const face of facets){near=Math.min(near,face.depth);far=Math.max(far,face.depth);}
    const span=far-near||1;
    const layers=Array.from({length:24},()=>new Map());
    for(const face of facets){
     const layer=layers[Math.min(23,Math.floor((far-face.depth)*24/span))];
     layer.set(face.shade,(layer.get(face.shade)||'')+face.path);
    }
    for(const layer of layers)for(const [tone,d] of layer){
     svg.append(make('path',{d,fill:'rgb('+rgb.map(v=>Math.min(255,Math.round(v*tone/24))).join(',')+')','pointer-events':'none'}));
    }
    return true;
   }
   facets.sort((a,b)=>b.depth-a.depth);
   let shade=-1,path='';
   function flush(){if(path)svg.append(make('path',{d:path,fill:'rgb('+rgb.map(v=>Math.min(255,Math.round(v*shade/24))).join(',')+')','pointer-events':'none'}));}
   for(const tri of facets){if(tri.shade!==shade){flush();path='';shade=tri.shade;}path+=tri.path;}
   flush();return true;
  }
  svg.append(make('rect',{width,height,fill:'#0a2032'}));svg.append(make('text',{x:24,y:34,fill:'#c5e3e9','font-size':16,'font-family':'system-ui'},'3D compatibility view'));
  function drawTrim(surfaces){
   for(const {kind,points} of surfaces||[]){
    svg.append(make('polygon',{'data-building-trim':kind,'pointer-events':'none',
     points:points.map(v=>screen(point(v.x,v.z,-v.y))).join(' '),fill:model.trims.settings.color}));
   }
  }
  const wallLayout=model.walls;
  for(const row of wallLayout.rows){
   const heightFeet=row.cells.length?row.cells.reduce((v,c)=>Math.max(v,c.topLeft,c.topRight),0):row.height;
   const z=depth((row.a.x+row.b.x)/2,heightFeet*FT/2,-(row.a.y+row.b.y)/2);
   jobs.push({depth:z,draw:()=>{
   function drawCell(cell,panel){
    const corners=[[cell.left,cell.bottom],[cell.right,cell.bottom],[cell.right,cell.topRight],[cell.left,cell.topLeft]];
    const points=corners.map(([x,z])=>{const p=wallPoint(row,x,z);return screen(point(p.x,p.y,p.z))});
    const attrs={'data-wall-cell':'true','data-wall-id':row.id,points:points.join(' '),fill:wallLayout.settings.show?wallLayout.settings.color:'#6f8f9a'};
    if(panel)attrs['data-strip-center']=String((panel.startFeet+panel.endFeet)/2);
    svg.append(make('polygon',attrs));
   }
   if(wallLayout.settings.show){
    for(const panel of row.panels)for(const cell of panel.cells)drawCell(cell,panel);
    const dx=row.b.x-row.a.x,dz=row.a.y-row.b.y,span=Math.hypot(dx,dz)||1;
    const formed=drawMesh(row,model.wall,wallLayout.settings.color,wallLayout.settings.width,dx/span,dz/span,section=>wallPanelSurface(row,section,model.winding.get(row.id)||1));
    if(!formed)for(const seam of wallPanelSeams(row)){
     const pts=[seam.bottom,seam.top].map(z=>{const p=wallPoint(row,seam.station,z);return screen(point(p.x,p.y,p.z))});
     svg.append(make('polyline',{'data-wall-seam':'true',points:pts.join(' '),fill:'none',stroke:'#d2e8ee','stroke-width':1,'pointer-events':'none'}));
    }
   }else{for(const cell of row.cells)drawCell(cell,null);}

   for(const o of row.openings){const corners=[[o.offset,o.sill],[o.offset+o.width,o.sill],[o.offset+o.width,o.sill+o.height],[o.offset,o.sill+o.height],[o.offset,o.sill]].map(([x,z])=>{const p=wallPoint(row,x,z);return screen(point(p.x,p.y,p.z))});svg.append(make('polyline',{'data-opening':o.kind,'pointer-events':'none',points:corners.join(' '),fill:'none',stroke:o.kind==='Window'?'#78d6ed':'#edc383','stroke-width':2}))}
   drawTrim(model.wallTrim.get(row.id));
  }});}
  for(const {row,data} of faces){
   const shape=data.points.map(p=>projected(p.x,data.height(p),-p.y));
   const z=data.points.reduce((sum,p)=>sum+depth(p.x,data.height(p),-p.y),0)/Math.max(1,data.points.length);
   jobs.push({depth:z,draw:()=>{svg.append(make('polygon',{points:shape.map(p=>screen([p.x,p.y])).join(' '),'data-roof-id':row.face.id,fill:state.settings.color,stroke:'#d5f2ff','stroke-width':2}));const angle=row.face.bearing*Math.PI/180;
   const formed=showPanels&&row.panels.length&&drawMesh(row,model.roof,state.settings.color,state.settings.width,Math.cos(angle),Math.sin(angle),section=>roofPanelSurface(row,section,state.settings.width,triangulatePanelFace(row.uv)),Math.sin(angle),-row.face.pitch/12,-Math.cos(angle));
   if(showPanels&&!formed)for(const panel of row.panels)svg.append(make('polyline',{points:[...panel.polygon,panel.polygon[0]].map(p=>screen(point(p.x,data.height(p)+.03,-p.y))).join(' '),fill:'none',stroke:'#c5e3e9','stroke-width':.8,'pointer-events':'none'}));
   drawTrim(model.roofTrim.get(row.face.id));}
  });}
  jobs.sort((a,b)=>b.depth-a.depth);for(const job of jobs)job.draw();
  svg.addEventListener('click',event=>{
   if(moved)return;
   const cell=event.target.closest('[data-wall-id]'),id=cell?.getAttribute('data-wall-id'),row=wallLayout.rows.find(r=>r.id===id);
   const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
   const local=p.matrixTransform(svg.getScreenCTM().inverse());
   const projectedX=(local.x-tx)/scale, projectedY=(local.y-ty)/scale;
   let station;
   if(row){
    const ax=point(row.a.x,0,-row.a.y)[0],bx=point(row.b.x,0,-row.b.y)[0];
    station=(Math.abs(bx-ax)>1e-5?Math.max(0,Math.min(1,(projectedX-ax)/(bx-ax))):.5)*row.widthFeet;
   }
   if(focusMode){
    if(row){
     const base=wallPoint(row,station,0),y=point(base.x,0,base.z)[1]-projectedY;
     anchor=[base.x,Math.max(0,y),base.z];
    }else{
     const id=event.target.closest('[data-roof-id]')?.getAttribute('data-roof-id'),item=faces.find(x=>x.row.face.id===id);
     if(!item)return;
     const c=Math.cos(view.theta),s=Math.sin(view.theta),base={x:projectedX*c,y:projectedX*s};
     const one={x:base.x+s,y:base.y-c};
     const h=item.data.height(base),rise=item.data.height(one)-h;
     const depth=(-projectedY-h)/(view.tilt+rise);
     const center=item.data.points.reduce((sum,p)=>({x:sum.x+p.x/item.data.points.length,y:sum.y+p.y/item.data.points.length}),{x:0,y:0});
     const xy=Number.isFinite(depth)&&Math.abs(view.tilt+rise)>.025?{x:base.x+s*depth,y:base.y-c*depth}:center;
     anchor=[xy.x,item.data.height(xy),-xy.y];
    }
    view.zoom=Math.max(5,Math.min(80,frameWidth/scale/1.8*view.zoom));
    setFocus(false);redraw();
    host.dispatchEvent(new Event('panel-focus-used'));
    return;
   }
   if(row)document.dispatchEvent(new CustomEvent('wall-picked',{detail:{wallId:id,offset:station,stripCenter:cell.hasAttribute('data-strip-center')?Number(cell.getAttribute('data-strip-center')):null}}));
  });
  host.replaceChildren(svg);
 }
 if(typeof ResizeObserver==='function'){
  new ResizeObserver(()=>{if(state&&!host.hidden)redraw();}).observe(host);
 }
 host.style.touchAction='none';host.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};down={...drag};moved=false});host.addEventListener('pointermove',event=>{if(!drag||!state)return;if(!moved&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6)return;moved=true;view.theta+=(event.clientX-drag.x)*.012;view.tilt=Math.max(.08,Math.min(.7,view.tilt+(event.clientY-drag.y)*.002));drag={x:event.clientX,y:event.clientY};redraw()});host.addEventListener('pointerup',()=>drag=null);host.addEventListener('pointercancel',()=>drag=null);host.addEventListener('wheel',event=>{if(!state)return;event.preventDefault();zoomBy(Math.exp(event.deltaY*.001))},{passive:false});
 function setFocus(on){focusMode=Boolean(on);host.style.cursor=focusMode?'crosshair':'';}
 function resetCamera(){if(state){view.theta=homeAngle;view.tilt=homeTilt;redraw(true);}}
 function zoomBy(factor){if(!state)return;view.zoom=Math.max(.45,Math.min(80,view.zoom/factor));redraw();}
 function getViewState(){return {...view,target:anchor?{x:anchor[0],y:anchor[1],z:anchor[2]}:view.target};}
 function setViewState(saved){
  if(!saved)return;
  view={...view,...saved,target:{...view.target,...saved.target},zoom:Math.max(.45,Math.min(80,Number(saved.zoom)||1)),tilt:Math.max(.08,Math.min(.7,Number(saved.tilt)||.36))};
  anchor=view.zoom>1&&saved.zoom&&saved.target?[saved.target.x,saved.target.y,saved.target.z]:null;
  if(state)redraw();
 }
 function captureViews(){return []}
 return {update,getViewState,setViewState,captureViews,setFocus,resetCamera,zoomBy};
}
