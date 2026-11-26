import {getPanelProfile,selectedPan} from './panel-catalog.mjs';
import {project,validPolygon} from './geometry.mjs';
import {wallPanelDefaults} from './wall-panels.mjs';
import {getWalls,validateOpening} from './walls.mjs';
import {trimDefaults,readTrimSettings} from './roof-trim.mjs';

export const PROJECT_VERSION=10;
export const EDGE_TYPES=['Unlabeled','Ridge','Hip','Valley','Rake','Eave','Flashing'];
export const REPORT_EDGE_TYPES=['Ridge','Hip','Valley','Rake','Eave'];
const FACE_TYPES=['Main roof','Dormer','Porch','Garage'];
const cleanText=(value,max=300)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const finite=(value,min,max,name)=>{const number=Number(value);if(!Number.isFinite(number)||number<min||number>max)throw Error(`Invalid ${name}`);return number};
const id=(value,prefix,index,used)=>{let next=cleanText(value,100);if(!next||used.has(next))next=`${prefix}-${index+1}-${Math.random().toString(36).slice(2,10)}`;used.add(next);return next};

export function createProjectState(){
 return {version:PROJECT_VERSION,trim:{...trimDefaults},address:'',origin:{lat:44.9385,lng:-123.0303},outlines:[],faces:[],building:null,walls:[],wallOpenings:[],settings:{groupPanelLengths:true,width:16,maxLength:32,allowance:0,color:'#477785',autoSnap:true,snapTolerance:6,gridSnap:true},materials:{panelType:'Standing seam',gauge:'26 ga',colorName:'Slate blue'},customer:{name:'',company:'',phone:'',email:''},quote:{projectName:'',number:'',date:new Date().toISOString().slice(0,10),validUntil:'',taxRate:0,materialPricePerSqFt:0,trimPrices:{Ridge:0,Hip:0,Valley:0,Rake:0,Eave:0},accessories:[],notes:''},panelOverrides:[],ui:{step:1,view:'map',showPanels:false,selectedFaceId:null,selectedOutlineId:null,selectedEdge:null,map:null,camera:null}};
}

export function snapshotProject(state,ui={}){
 const copy=structuredClone(state);
 copy.version=PROJECT_VERSION;
 copy.ui={...createProjectState().ui,...copy.ui,...structuredClone(ui)};
 return copy;
}

export function parseProject(input){
 const raw=typeof input==='string'?JSON.parse(input):structuredClone(input);
 if(!raw||![2,3,4,5,6,7,8,9,10].includes(raw.version)||!Array.isArray(raw.faces))throw Error('Unsupported or missing project-file version');
 if(raw.faces.length>100)throw Error('Project has too many roof planes');
 const origin={lat:finite(raw.origin?.lat,-85,85,'project latitude'),lng:finite(raw.origin?.lng,-180,180,'project longitude')};
 const validatePoints=(points,label)=>{
  if(!Array.isArray(points)||points.length<3||points.length>300)throw Error(`${label} has an invalid number of points`);
  const clean=points.map((point,index)=>({lat:finite(point?.lat,-85,85,`${label} point ${index+1} latitude`),lng:finite(point?.lng,-180,180,`${label} point ${index+1} longitude`)}));
  if(!validPolygon(clean.map(point=>project(point,origin))))throw Error(`${label} crosses itself or is too small`);
  return clean;
 };
 const used=new Set();
 const faces=raw.faces.map((face,index)=>{
  const points=validatePoints(face.points,`Roof plane ${index+1}`);
  return {id:id(face.id,'plane',index,used),name:cleanText(face.name||`Plane ${index+1}`,60)||`Plane ${index+1}`,type:FACE_TYPES.includes(face.type)?face.type:'Main roof',pitch:finite(face.pitch,0,24,`plane ${index+1} pitch`),bearing:finite(face.bearing,0,359,`plane ${index+1} direction`),eave:finite(face.eave,0,200,`plane ${index+1} low-edge height`),points,edges:points.map((_,edgeIndex)=>EDGE_TYPES.includes(face.edges?.[edgeIndex])?face.edges[edgeIndex]:'Unlabeled')};
 });
 const rawOutlines=raw.version>=3&&Array.isArray(raw.outlines)?raw.outlines:[];
 if(rawOutlines.length>20)throw Error('Project has too many outlines');
 const outlines=rawOutlines.map((outline,index)=>({id:id(outline.id,'outline',index,used),name:cleanText(outline.name||`Roof outline ${index+1}`,60)||`Roof outline ${index+1}`,points:validatePoints(outline.points,`Roof outline ${index+1}`)}));
 const defaults=createProjectState(),settings=raw.settings||{};
 if (raw.version >= 8 && settings.groupPanelLengths !== undefined && typeof settings.groupPanelLengths !== 'boolean') throw Error('Invalid panel length grouping setting');
 const cleanSettings={groupPanelLengths:raw.version>=8 && settings.groupPanelLengths===true,width:finite(settings.width,1,120,'panel coverage width'),maxLength:finite(settings.maxLength,1,200,'maximum panel length'),allowance:finite(settings.allowance,0,48,'panel allowance'),color:/^#[a-f\d]{6}$/i.test(settings.color||'')?settings.color:defaults.settings.color,autoSnap:settings.autoSnap!==false,snapTolerance:finite(settings.snapTolerance??6,.5,24,'junction snap tolerance'),gridSnap:settings.gridSnap!==false};
 const roofProfile=getPanelProfile(settings.profileId,'roof');
 if(roofProfile?.widths?.includes(cleanSettings.width)){
  cleanSettings.profileId=roofProfile.id;
  const savedPan=raw.version<9?(roofProfile.pans?.includes('flat')?'flat':undefined):settings.panStyle;
  const pan=selectedPan(roofProfile,cleanSettings.width,savedPan);
  if(raw.version>=9&&savedPan!=null&&pan?.id!==savedPan)throw Error('Unsupported pan style for '+roofProfile.name);
  if(pan)cleanSettings.panStyle=pan.id;
 }
 const materials={panelType:cleanText(raw.materials?.panelType||'Standing seam',80)||'Standing seam',gauge:cleanText(raw.materials?.gauge||'26 ga',30)||'26 ga',colorName:cleanText(raw.materials?.colorName||'Custom color',60)||'Custom color'};
 const customer={name:cleanText(raw.customer?.name,100),company:cleanText(raw.customer?.company,100),phone:cleanText(raw.customer?.phone,50),email:cleanText(raw.customer?.email,120)};
 const sourceQuote=raw.quote||{},trimPrices={};for(const type of REPORT_EDGE_TYPES)trimPrices[type]=finite(sourceQuote.trimPrices?.[type]??0,0,10000,`${type.toLowerCase()} price`);
 const accessories=Array.isArray(sourceQuote.accessories)?sourceQuote.accessories.slice(0,100).map((item,index)=>({description:cleanText(item?.description||`Additional item ${index+1}`,120),quantity:finite(item?.quantity??0,0,100000,`additional item ${index+1} quantity`),unitPrice:finite(item?.unitPrice??0,0,1000000,`additional item ${index+1} price`)})).filter(item=>item.description&&item.quantity>0):[];
 const quote={projectName:cleanText(sourceQuote.projectName,120),number:cleanText(sourceQuote.number,50),date:cleanText(sourceQuote.date,20),validUntil:cleanText(sourceQuote.validUntil,20),taxRate:finite(sourceQuote.taxRate??0,0,100,'tax rate'),materialPricePerSqFt:finite(sourceQuote.materialPricePerSqFt??0,0,10000,'panel material price'),trimPrices,accessories,notes:cleanText(sourceQuote.notes,5000)};
 const sourceUi=raw.ui||{},views=['map','plan','three'],mapView=sourceUi.map||raw.view||null;
 const mapState=mapView?.center&&Number.isFinite(Number(mapView.center.lat))&&Number.isFinite(Number(mapView.center.lng))?{center:{lat:finite(mapView.center.lat,-85,85,'map latitude'),lng:finite(mapView.center.lng,-180,180,'map longitude')},zoom:finite(mapView.zoom??18,3,23,'map zoom')}:null;
 const selectedFaceId=faces.some(face=>face.id===sourceUi.selectedFaceId)?sourceUi.selectedFaceId:null,selectedOutlineId=outlines.some(outline=>outline.id===sourceUi.selectedOutlineId)?sourceUi.selectedOutlineId:null;
 const camera=sourceUi.camera&&['target','radius','theta','phi'].every(key=>key==='target'||Number.isFinite(Number(sourceUi.camera[key])))?{target:{x:finite(sourceUi.camera.target?.x,-100000,100000,'camera target x'),y:finite(sourceUi.camera.target?.y,-100000,100000,'camera target y'),z:finite(sourceUi.camera.target?.z,-100000,100000,'camera target z')},radius:finite(sourceUi.camera.radius,.35,10000,'camera radius'),theta:finite(sourceUi.camera.theta,-1000,1000,'camera angle'),phi:finite(sourceUi.camera.phi,.01,Math.PI/2,'camera elevation')}:null;
 const ui={step:Math.round(finite(sourceUi.step??1,1,5,'workflow step')),view:views.includes(sourceUi.view)?sourceUi.view:'map',showPanels:Boolean(sourceUi.showPanels),selectedFaceId,selectedOutlineId,selectedEdge:cleanText(sourceUi.selectedEdge,200)||null,map:mapState,camera};
 let building=null;
 if(raw.building?.parts){
  if(!Array.isArray(raw.building.parts)||raw.building.parts.length>50)throw Error('Too many building sections');
  const faceIds=new Set(faces.map(face=>face.id));
  building={kind:'multi-gable',parts:raw.building.parts.map((part,index)=>{
   const section={id:cleanText(part.id,100)||`section-${index}`,name:cleanText(part.name,80)||'Building section',wallHeight:finite(part.wallHeight,0,200,'wall height'),footprint:validatePoints(part.footprint,'Section footprint')};
   if(raw.version>=7 && part.roofFaceIds!==undefined){
    const ids=part.roofFaceIds;
    if(!Array.isArray(ids)||ids.length>64||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id.length||id.length>100))throw Error('Invalid roof links for building section');
    // A user may have deleted a roof plane since import. Keep the section
    // linked (including []) so missing wall coverage can be reported.
    section.roofFaceIds=ids.filter(id=>faceIds.has(id));
   }
   if (raw.version >= 7 && part.planSource) {
    const ref = part.planSource;
    if (!Array.isArray(ref.notes) || ref.notes.length > 60 || !Array.isArray(ref.openings) || ref.openings.length > 200) throw Error('Invalid drawing references');
    section.planSource = {
     file:cleanText(ref.file,160), notes:ref.notes.map(note=>cleanText(note,500)),
     openings:ref.openings.map(row=>({id:cleanText(row.id,100),detail:cleanText(row.detail,240)}))
    };
   }
   return section;
  })};
 }
 else if(raw.building?.footprint)building={kind:'gable',wallHeight:finite(raw.building.wallHeight,0,200,'wall height'),footprint:validatePoints(raw.building.footprint,'House footprint')};
 if(camera && Number.isFinite(sourceUi.camera.zoom) && Number.isFinite(sourceUi.camera.tilt)){
  camera.zoom=finite(sourceUi.camera.zoom,.45,80,'compatibility zoom');
  camera.tilt=finite(sourceUi.camera.tilt,.08,.7,'compatibility tilt');
 }
 const sourceWall=raw.wallPanels||wallPanelDefaults,wallPanels={show:Boolean(sourceWall.show),width:finite(sourceWall.width??36,1,120,'wall panel coverage'),maxLength:finite(sourceWall.maxLength??20,1,200,'wall panel maximum length'),allowance:finite(sourceWall.allowance??0,0,48,'wall panel allowance'),color:/^#[a-f\d]{6}$/i.test(sourceWall.color||'')?sourceWall.color:wallPanelDefaults.color};
 const point=p=>({lat:finite(p?.lat,-85,85,'wall latitude'),lng:finite(p?.lng,-180,180,'wall longitude')});
 if(raw.walls!==undefined&&(!Array.isArray(raw.walls)||raw.walls.length>100))throw Error('Invalid standalone walls');
 const wallIds=new Set(),walls=(raw.walls||[]).map((wall,i)=>({id:id(wall.id,'wall',i,wallIds),name:cleanText(wall.name,80)||'Wall',height:finite(wall.height,1,200,'wall height'),a:point(wall.a),b:point(wall.b)}));
 if(raw.wallOpenings!==undefined&&(!Array.isArray(raw.wallOpenings)||raw.wallOpenings.length>200))throw Error('Invalid wall openings');
 const wallOpenings=[],allWalls=getWalls({building,walls,origin,faces});
 for(const wall of allWalls.filter(w=>walls.some(x=>x.id===w.id)))if(wall.widthFeet<.99||wall.widthFeet>500.01)throw Error('Invalid standalone wall length');
 for(const o of raw.wallOpenings||[]){const wall=allWalls.find(w=>w.id===o.wallId);if(!wall)throw Error('Opening references a missing wall');const opening={id:cleanText(o.id,100)||'opening-'+wallOpenings.length,wallId:wall.id,kind:o.kind==='Window'?'Window':o.kind==='Garage door'?'Garage door':'Door',offset:finite(o.offset,0,10000,'opening offset'),width:finite(o.width,.01,500,'opening width'),height:finite(o.height,.01,200,'opening height'),sill:finite(o.sill,0,200,'opening sill')};validateOpening(wall,opening,wallOpenings);wallOpenings.push(opening)}
 const trim=readTrimSettings(raw.trim||{});
 const wallProfile=getPanelProfile(sourceWall.profileId,'wall');
 if(wallProfile?.widths?.includes(wallPanels.width)){
  wallPanels.profileId=wallProfile.id;
  const savedPan=raw.version<9?(wallProfile.pans?.includes('flat')?'flat':undefined):sourceWall.panStyle;
  const pan=selectedPan(wallProfile,wallPanels.width,savedPan);
  if(raw.version>=9&&savedPan!=null&&pan?.id!==savedPan)throw Error('Unsupported pan style for '+wallProfile.name);
  if(pan)wallPanels.panStyle=pan.id;
 }
 if(sourceWall.colorName)wallPanels.colorName=cleanText(sourceWall.colorName,60);
 return {trim,walls,wallOpenings,wallPanels,version:PROJECT_VERSION,address:cleanText(raw.address,300),origin,outlines,faces,building,settings:cleanSettings,materials,customer,quote,panelOverrides:Array.isArray(raw.panelOverrides)?structuredClone(raw.panelOverrides.slice(0,500)):[],ui};
}
