import {createProjectState} from './project.mjs';
import {gableHouseTemplate,unproject} from './geometry.mjs';

// Generic geometry for the shared viewer. Imported project data goes through the normal loader.
export function previewWorkshop(){
 const state=createProjectState(),name='Sample workshop',id='sample-workshop';
 const roof=gableHouseTemplate({widthFeet:32,depthFeet:24,pitch:6,eaveHeight:10,name});
 const toGeo=p=>unproject(p,state.origin);
 state.faces=roof.faces.map((face,i)=>({...face,id:'sample-roof-'+i,points:face.points.map(toGeo)}));
 state.building={kind:'multi-gable',parts:[{id,name,footprint:roof.footprint.map(toGeo),wallHeight:roof.wallHeight,roofFaceIds:state.faces.map(f=>f.id)}]};
 state.wallOpenings=[
  {id:'sample-garage',wallId:id+':1',kind:'Garage door',offset:7,width:10,height:8,sill:0},
  {id:'sample-window',wallId:id+':0',kind:'Window',offset:5,width:5,height:3,sill:4},
  {id:'sample-door',wallId:id+':0',kind:'Door',offset:23,width:3,height:7,sill:0}
 ];
 Object.assign(state.settings,{profileId:'easy-lock',panStyle:'striated',width:16,maxLength:35,color:'#34483b'});
 Object.assign(state.materials,{panelType:'Easy-Lock™',gauge:'24 ga',colorName:'ArmorTech / Pine Green'});
 state.wallPanels={show:true,profileId:'easy-lock',panStyle:'accent',width:12,maxLength:35,allowance:0,color:'#c6b89b',colorName:'ArmorTech / Light Stone'};
 state.trim={...state.trim,eave:true,fascia:true,rake:true,ridgeCap:true,casing:true};
 state.quote.projectName=name;
 Object.assign(state.ui,{step:5,view:'three',showPanels:true,selectedFaceId:state.faces[0].id});
 return state;
}
