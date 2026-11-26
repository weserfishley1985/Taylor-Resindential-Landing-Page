import assert from 'node:assert/strict';
import {getPanelProfile,panChoices,PANEL_CATALOG,PANEL_FINISHES} from './dist/panel-catalog.mjs';
import {panelSection,roofPanelSurface,triangulatePanelFace,wallPanelSurface} from './dist/panel-surfaces.mjs';
import {area,FT,summarize,unproject} from './dist/geometry.mjs';
import {createProjectState,parseProject,snapshotProject} from './dist/project.mjs';
import {wallPanelLayout} from './dist/wall-panels.mjs';

assert.equal(new Set(PANEL_CATALOG.map(p=>p.id)).size,PANEL_CATALOG.length);
assert.equal(new Set(PANEL_FINISHES.map(x=>x.slice(0,2).join('/'))).size,PANEL_FINISHES.length);
for(const p of PANEL_CATALOG.filter(p=>p.shape))for(const width of p.widths){
 const section=panelSection(p,width);
 assert.equal(section[0][0],0);
 assert.equal(section.at(-1)[0],width);
 assert.ok(section.every(([x,z],i)=>Number.isFinite(x)&&Number.isFinite(z)&&z>=-1e-9&&z<=p.height+1e-9&&(!i||x>section[i-1][0]||x===section[i-1][0]&&z!==section[i-1][1])));
 assert.ok(section.some(([,z])=>Math.abs(z-p.height)<1e-7));
}
assert.equal(getPanelProfile('classic-7-8-corrugated-produced-in-spokane-roof','roof').widths[0],29.3125);
assert.equal(getPanelProfile('classic-7-8-corrugated-produced-in-spokane-roof','wall'),null);
const state=createProjectState();
const uv=[{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:3,y:5},{x:3,y:2},{x:2,y:2},{x:2,y:5},{x:0,y:5}];
const triangles=triangulatePanelFace(uv);
assert.equal(triangles.reduce((sum,t)=>sum+area(t.map(i=>uv[i])),0),area(uv));
state.faces=[{id:'north',name:'North',type:'Main roof',bearing:0,pitch:0,eave:10,points:uv.map(p=>unproject(p,state.origin)),edges:Array(8).fill('Eave')}];
Object.assign(state.settings,{profileId:'pbr',width:36,maxLength:45,color:'#3d454b'});
const summary=summarize(state.faces,state.origin,state.settings),row=summary.rows[0];
const geometry=roofPanelSurface(row,panelSection(getPanelProfile('pbr','roof'),36),36,triangulatePanelFace(row.uv));
assert.ok(geometry.length>0);
for(let i=0;i<geometry.length;i+=9){
 const x=(geometry[i]+geometry[i+3]+geometry[i+6])/3, y=-(geometry[i+2]+geometry[i+5]+geometry[i+8])/3;
 assert.ok(!(x>2+1e-5&&x<3-1e-5&&y>2+1e-5));
}
state.walls=[{id:'west',name:'West',a:unproject({x:0,y:0},state.origin),b:unproject({x:12*FT,y:0},state.origin),height:10}];
state.wallOpenings=[{id:'opening-1',wallId:'west',kind:'Window',offset:3,width:4,height:3,sill:3}];
state.wallPanels={profileId:'tuff-rib',width:36,maxLength:45,allowance:0,color:'#365447',colorName:'ArmorTech / Forest Green',show:true};
const restored=parseProject(snapshotProject(state,{camera:{target:{x:1,y:2,z:3},radius:.5,theta:.6,phi:.9}}));
assert.equal(restored.settings.profileId,'pbr');
assert.equal(restored.wallPanels.profileId,'tuff-rib');
assert.equal(restored.wallPanels.colorName,'ArmorTech / Forest Green');
assert.equal(restored.ui.camera.radius,.5);
const wall=wallPanelLayout(restored).rows[0],mesh=wallPanelSurface(wall,panelSection(getPanelProfile('tuff-rib','wall'),36));
assert.ok(mesh.length>0);
for(let i=0;i<mesh.length;i+=9){
 const x=(mesh[i]+mesh[i+3]+mesh[i+6])/3/FT,y=(mesh[i+1]+mesh[i+4]+mesh[i+7])/3/FT;
 assert.ok(!(x>3+1e-5&&x<7-1e-5&&y>3+1e-5&&y<6-1e-5));
}

const easy=getPanelProfile('easy-lock','wall'),stream=getPanelProfile('streamline','roof');
const allowed=(id,width,surface)=>panChoices(getPanelProfile(id,surface),width).map(p=>p.id);
assert.deepEqual(allowed('easy-lock',12,'wall'),['striated','accent','flat']);
assert.deepEqual(allowed('streamline',16,'roof'),['striated','accent']);
assert.deepEqual(allowed('loc-rib',16,'roof'),['accent']);
assert.deepEqual(allowed('board-batten',12,'wall'),['light-striated','flat']);
assert.deepEqual(allowed('pbr',36,'roof'),[]);
assert.deepEqual(allowed('easy-lock',36,'wall'),[]);
for(const p of PANEL_CATALOG.filter(p=>p.shape))for(const width of p.widths){
 for(const style of panChoices(p,width)){
  const section=panelSection(p,width,style.id);
  assert.ok(section.every(([x,z],i)=>x>=0&&x<=width&&z>=-1e-8&&z<=p.height+1e-8&&(!i||x>=section[i-1][0])),p.id+' '+style.id);
 }
}
for(const [width,count] of [[12,3],[16,4]]){
 const flat=panelSection(easy,width,'flat'),accent=panelSection(easy,width,'accent'),striated=panelSection(easy,width,'striated');
 assert.equal(accent.filter(([x,z],i)=>x>1&&z>0&&accent[i-1][1]===0).length,count);
 assert.equal(flat.filter(([x,z])=>x>1&&z!==0).length,0);
 assert.ok(striated.length>accent.length*2);
 assert.equal(striated[4][0]-striated[3][0],.375);
 assert.equal(striated[4][1],1);
}
const wave=panelSection(getPanelProfile('2-1-2-corrugated','wall'),24);
assert.equal(wave[0][1],wave.at(-1)[1]);
assert.equal(wave.filter(([,z])=>z===0).length,9);
const baseProject=snapshotProject(restored);
baseProject.settings.profileId=easy.id;baseProject.settings.width=16;baseProject.settings.panStyle='flat';
baseProject.wallPanels.profileId=easy.id;baseProject.wallPanels.width=12;baseProject.wallPanels.panStyle='accent';
const again=parseProject(baseProject);
assert.equal(again.settings.panStyle,'flat');
assert.equal(again.wallPanels.panStyle,'accent');
const legacy=structuredClone(baseProject);legacy.version=8;delete legacy.wallPanels.panStyle;delete legacy.settings.panStyle;
assert.equal(parseProject(legacy).wallPanels.panStyle,'flat');
legacy.settings.profileId=stream.id;
assert.equal(parseProject(legacy).settings.panStyle,'striated');
const wallA=wallPanelLayout(again),roofA=summarize(again.faces,again.origin,again.settings);
again.wallPanels.panStyle='striated';again.settings.panStyle='accent';
const wallB=wallPanelLayout(again),roofB=summarize(again.faces,again.origin,again.settings);
assert.deepEqual(wallA.rows[0].panels.map(p=>[p.length,p.cutouts]),wallB.rows[0].panels.map(p=>[p.length,p.cutouts]));
assert.deepEqual(roofA.rows[0].panels.map(p=>p.length),roofB.rows[0].panels.map(p=>p.length));
const upright=wallPanelSurface(wallB.rows[0],panelSection(easy,12,'flat'));
let foundFold=false;
for(let i=0;i<upright.length;i+=9){
 if(Math.abs(upright[i]-upright[i+3])<1e-7&&Math.abs(upright[i]-upright[i+6])<1e-7&&Math.max(upright[i+2],upright[i+5],upright[i+8])-Math.min(upright[i+2],upright[i+5],upright[i+8])>.001)foundFold=true;
}
assert.ok(foundFold,'vertical lock flanks are present in the installed wall mesh');
const unsupported=snapshotProject(again);unsupported.settings.profileId=stream.id;unsupported.settings.panStyle='flat';
assert.throws(()=>parseProject(unsupported),/Unsupported pan style/);
