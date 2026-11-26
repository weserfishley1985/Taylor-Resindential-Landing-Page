import * as THREE from './vendor/three.module.js';
import {wallPanelLayout} from './wall-panels.mjs';
import {wallPoint,wallPanelSeams} from './walls.mjs';
import {getPanelProfile} from './panel-catalog.mjs';
import {panelSection,roofPanelSurface,wallPanelSurface} from './panel-surfaces.mjs';
import {roofTrimLayout} from './roof-trim.mjs';
import {planeData,FT,project,junctionReport,vertexJunctionReport,planeEquation} from './geometry.mjs';
export function createViewer(host){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#0a2032');renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.01,100000);scene.fog=new THREE.Fog(0x0a2032,180,1200);scene.add(new THREE.HemisphereLight(0xd9f4ff,0x172838,2.15));const sun=new THREE.DirectionalLight(0xfff4df,3);sun.position.set(60,110,45);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-250;sun.shadow.camera.right=250;sun.shadow.camera.top=250;sun.shadow.camera.bottom=-250;scene.add(sun);
 let group=new THREE.Group();scene.add(group);let target=new THREE.Vector3(),radius=40,theta=.6,phi=.9,drag=null,focusMode=false,home=null;
 const minRadius=.35, maxRadius=10000;
 const boundRadius=value=>Math.max(minRadius,Math.min(maxRadius,value));
 function draw(force=false,width=0,height=0){if(host.hidden&&!force)return;const w=width||host.clientWidth||900,h=height||host.clientHeight||560;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.near=Math.max(.015,radius*.0005);camera.updateProjectionMatrix();camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(target);renderer.render(scene,camera)}
 renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;theta-=(e.clientX-drag.x)*.009;phi=Math.max(.06,Math.min(Math.PI/2-.025,phi+(e.clientY-drag.y)*.009));drag={x:e.clientX,y:e.clientY};draw()});renderer.domElement.addEventListener('pointerup',()=>drag=null);renderer.domElement.addEventListener('pointercancel',()=>drag=null);renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(e.deltaY*.001))},{passive:false});const resizeObserver=new ResizeObserver(()=>draw());resizeObserver.observe(host);
 function zoomBy(factor){radius=boundRadius(radius*factor);draw();}
 function setFocus(on){focusMode=Boolean(on);renderer.domElement.style.cursor=focusMode?'crosshair':'';}
 function resetCamera(){if(home)setViewState(home);}
 let pickStart=null;
 renderer.domElement.addEventListener('pointerdown',e=>pickStart={x:e.clientX,y:e.clientY});
 renderer.domElement.addEventListener('pointerup',e=>{
  if(!pickStart||Math.hypot(e.clientX-pickStart.x,e.clientY-pickStart.y)>6)return;
  const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const targets=group.children.filter(o=>o.isMesh&&(o.userData.roof||o.userData.wall));
  const hit=ray.intersectObjects(targets,false)[0];
  if(!hit)return;
  const row=hit.object.userData.wall;
  if(focusMode){
   let angle=theta, tilt=.52;
   if(row){
    const sign=hit.object.userData.outward||1, dx=row.b.x-row.a.x,dy=row.b.y-row.a.y;
    angle=Math.atan2(sign*dy,sign*dx);
    tilt=1.26;
   }
   const width=hit.object.userData.coverage||16;
   setViewState({target:hit.point,radius:Math.max(.8,width*.055),theta:angle,phi:tilt});
   setFocus(false);
   host.dispatchEvent(new Event('panel-focus-used'));
   return;
  }
  if(!row)return;
  const dx=row.b.x-row.a.x,dy=row.b.y-row.a.y;
  const t=Math.max(0,Math.min(1,((hit.point.x-row.a.x)*dx+(-hit.point.z-row.a.y)*dy)/(dx*dx+dy*dy)));
  document.dispatchEvent(new CustomEvent('wall-picked',{detail:{wallId:row.id,offset:t*row.widthFeet}}));
 });
 function clear(){group.traverse(x=>{x.geometry?.dispose();if(Array.isArray(x.material))x.material.forEach(m=>m.dispose());else x.material?.dispose()});scene.remove(group);group=new THREE.Group();scene.add(group)}
 function line(points,color,width=1){const g=new THREE.BufferGeometry().setFromPoints(points);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,linewidth:width}));group.add(l)}
 function marker(point,color,radius=.14){const dot=new THREE.Mesh(new THREE.SphereGeometry(radius,18,12),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.2,roughness:.5}));dot.position.copy(point);group.add(dot)}
 function mesh(points,data,color,offset=0){const contour=points.map(p=>new THREE.Vector2(p.x,p.y));const indices=THREE.ShapeUtils.triangulateShape(contour,[]).flat();const positions=points.flatMap(p=>[p.x,data.height(p)+offset,-p.y]);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const roof=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.48,roughness:.38,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));roof.castShadow=true;roof.receiveShadow=true;roof.userData.roof=true;group.add(roof)}
 function formedSurface(positions,color,userdata) {
  if(!positions.length)return false;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color,metalness:.18,roughness:.52,side:THREE.DoubleSide});
  const formed=new THREE.Mesh(geometry,material);
  formed.userData=userdata;
  formed.castShadow=true;formed.receiveShadow=true;
  group.add(formed);
  return true;
 }
 const seamKey=(a,b)=>[a,b].map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort().join('|');
 function fascia(points,data,shared){for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(shared.has(seamKey(a,b)))continue;const topA=data.height(a),topB=data.height(b),depth=.14,geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([a.x,topA,-a.y,b.x,topB,-b.y,b.x,topB-depth,-b.y,a.x,topA-depth,-a.y],3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();const side=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x203f50,metalness:.3,roughness:.55,side:THREE.DoubleSide}));side.castShadow=true;group.add(side)}}
 function update(state,summary,showPanels,reset){clear();
 const profile=showPanels?getPanelProfile(state.settings.profileId,'roof'):null;
 const roofSection=panelSection(profile,state.settings.width,state.settings.panStyle);
const faceData=new Map(),joints=junctionReport(state.faces,state.origin),vertexJoints=vertexJunctionReport(state.faces,state.origin),shared=new Set(joints.map(j=>seamKey(j.a,j.b)));for(const row of summary.rows){const data=planeData(row.face,state.origin);faceData.set(row.face.id,data);mesh(data.points,data,state.settings.color);if(!state.trim?.fascia)fascia(data.points,data,shared);const to3=(p,offset=0)=>new THREE.Vector3(p.x,data.height(p)+offset,-p.y);line([...data.points,data.points[0]].map(p=>to3(p,.015)),0xbcefff);const contour=row.uv.map(p=>new THREE.Vector2(p.x,p.y));
 const formed=showPanels && row.panels.length && roofSection.length &&
  formedSurface(roofPanelSurface(row,roofSection,state.settings.width,THREE.ShapeUtils.triangulateShape(contour,[])),state.settings.color,{roof:true,coverage:state.settings.width});
 if(showPanels&&!formed)for(const panel of row.panels){
  line([...panel.polygon,panel.polygon[0]].map(p=>to3(p,.035)),panel.oversize?0xffb960:0xc5e3e9);
 }
 // Vertical reference lines make the entered low-edge height visible.
 for(const p of data.points)line([new THREE.Vector3(p.x,0,-p.y),to3(p)],0x274a60);
 }
 const trims=roofTrimLayout(state),trimTriangles=[];
 for(const member of trims.segments)for(const {points} of member.surfaces){
  for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]])trimTriangles.push(p.x,p.z,-p.y);
 }
 formedSurface(trimTriangles,trims.settings.color,{trim:true});
 const cappedSeams=new Set(trims.segments.filter(member=>member.kind==='Ridge cap').map(member=>seamKey(member.a,member.b)));
 const wallLayout=wallPanelLayout(state);
 const wallProfile=wallLayout.settings.show?getPanelProfile(wallLayout.settings.profileId,'wall'):null;
 const wallSection=panelSection(wallProfile,wallLayout.settings.width,wallLayout.settings.panStyle);
 const exterior=new Map();
 const parts=state.building?.parts||(state.building?.footprint?[state.building]:[]);
 for(const [i,part] of parts.entries()){
  const points=part.footprint.map(p=>project(p,state.origin));
  const signed=points.reduce((sum,p,j)=>{const q=points[(j+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0);
  for(let j=0;j<points.length;j++)exterior.set(`${part.id||'building-'+i}:${j}`,signed<0?-1:1);
 }
 for(const row of wallLayout.rows){
 const outward=exterior.get(row.id)||1;
 const formed=wallSection.length && formedSurface(wallPanelSurface(row,wallSection,outward),wallLayout.settings.color,{wall:row,outward,coverage:wallLayout.settings.width});
 for(const cell of row.cells){const corners=[[cell.left,cell.bottom],[cell.right,cell.bottom],[cell.right,cell.topRight],[cell.left,cell.topLeft]].map(([x,z])=>wallPoint(row,x,z)),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(p=>[p.x,p.y,p.z]),3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();const wall=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:wallLayout.settings.show?wallLayout.settings.color:0x8ba4ad,roughness:.8,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));wall.userData={wall:row,outward,coverage:wallLayout.settings.width};wall.castShadow=true;wall.receiveShadow=true;group.add(wall)}
 if(wallLayout.settings.show&&!formed){
  for(const seam of wallPanelSeams(row)){
   const points=[seam.bottom,seam.top].map(z=>{const p=wallPoint(row,seam.station,z);return new THREE.Vector3(p.x,p.y,p.z)});
   line(points,0xd2e8ee);
  }
 }
 for(const o of row.openings){const pts=[[o.offset,o.sill],[o.offset+o.width,o.sill],[o.offset+o.width,o.sill+o.height],[o.offset,o.sill+o.height],[o.offset,o.sill]].map(([x,z])=>{const p=wallPoint(row,x,z);return new THREE.Vector3(p.x,p.y,p.z)});line(pts,o.kind==='Window'?0x78d6ed:0xedc383,2)}}
 // Validate each shared seam against both pitched plane equations. Conflicts
 // stay visible instead of being hidden by moving user-authored geometry.
 for(const joint of joints){if(joint.status==='aligned'&&cappedSeams.has(seamKey(joint.a,joint.b)))continue;const left=faceData.get(joint.left.face.id),right=faceData.get(joint.right.face.id),color=joint.status==='aligned'?0x58e3a5:joint.status==='offset'?0xffc44d:0xff5573,toAverage=p=>new THREE.Vector3(p.x,(left.height(p)+right.height(p))/2+.06,-p.y);line([toAverage(joint.a),toAverage(joint.b)],color,3);if(joint.status!=='aligned')for(const p of [joint.a,joint.b])line([new THREE.Vector3(p.x,left.height(p),-p.y),new THREE.Vector3(p.x,right.height(p),-p.y)],0xff5573,3)}
 for(const joint of vertexJoints)if(joint.status!=='aligned'){const heights=joint.faces.map(face=>planeEquation(face,state.origin).height(joint.point)),average=heights.reduce((sum,height)=>sum+height,0)/heights.length,center=new THREE.Vector3(joint.point.x,average+.08,-joint.point.y);marker(center,0xff5573,.18);for(const height of heights)line([new THREE.Vector3(joint.point.x,height,-joint.point.y),center],0xff5573,3)}
 const bounds=new THREE.Box3().setFromObject(group);const size=new THREE.Vector3();if(!bounds.isEmpty()){bounds.getSize(size);const center=bounds.getCenter(new THREE.Vector3());home={target:center,radius:fittedRadius(bounds,center,.6,.9),theta:.6,phi:.9};if(reset){target.copy(center);radius=fittedRadius(bounds,center,theta,phi);}}else{target.set(0,0,0);radius=30}
 const gridSize=Math.max(30,Math.ceil(Math.max(size.x,size.z)*1.6/10)*10),ground=new THREE.Mesh(new THREE.PlaneGeometry(gridSize,gridSize),new THREE.ShadowMaterial({color:0x020b12,opacity:.32}));ground.rotation.x=-Math.PI/2;ground.position.set(home?.target.x||0,-.025,home?.target.z||0);ground.receiveShadow=true;group.add(ground);const grid=new THREE.GridHelper(gridSize,Math.min(100,gridSize),0x35617a,0x18384f);grid.position.set(home?.target.x||0,0,home?.target.z||0);group.add(grid);draw();
 }
 function fittedRadius(bounds,center,angle,tilt){
  const aspect=(host.clientWidth||900)/(host.clientHeight||560),tan=Math.tan(camera.fov*Math.PI/360);
  const st=Math.sin(angle),ct=Math.cos(angle),sp=Math.sin(tilt),cp=Math.cos(tilt);
  let distance=1;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const dx=x-center.x,dy=y-center.y,dz=z-center.z,radial=dx*st+dz*ct;
   const across=Math.abs(dx*ct-dz*st),up=Math.abs(dy*sp-radial*cp),depth=radial*sp+dy*cp;
   distance=Math.max(distance,depth+1.22*Math.max(across/(tan*aspect),up/tan));
  }
  return boundRadius(distance);
 }
 function getViewState(){return {target:{x:target.x,y:target.y,z:target.z},radius,theta,phi}}
 function setViewState(saved){if(!saved)return;target.set(saved.target?.x||0,saved.target?.y||0,saved.target?.z||0);radius=boundRadius(Number(saved.radius)||radius);theta=Number.isFinite(Number(saved.theta))?Number(saved.theta):theta;phi=Math.max(.06,Math.min(Math.PI/2-.025,Number(saved.phi)||phi));draw()}
 function captureViews(){const current=getViewState(),presets=[['Front perspective',0,.92],['Rear perspective',Math.PI,.92],['Left-side perspective',-Math.PI/2,.92],['Right-side perspective',Math.PI/2,.92],['Isometric / top perspective',Math.PI/4,.55]],images=[];if(home){target.copy(home.target);radius=home.radius;}for(const [label,nextTheta,nextPhi]of presets){theta=nextTheta;phi=nextPhi;draw(true,900,560);images.push({label,data:renderer.domElement.toDataURL('image/jpeg',.88)})}setViewState(current);return images}
 function dispose(){resizeObserver.disconnect();clear();renderer.dispose();renderer.domElement.remove();}
 return {update,getViewState,setViewState,captureViews,setFocus,resetCamera,zoomBy,dispose};
}
