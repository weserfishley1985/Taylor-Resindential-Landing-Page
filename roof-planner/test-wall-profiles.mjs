import assert from 'node:assert/strict';
import {gableHouseTemplate,unproject} from './dist/geometry.mjs';
import {getWalls,validateOpening} from './dist/walls.mjs';
import {wallPanelLayout} from './dist/wall-panels.mjs';

const origin={lat:38,lng:-121},geo=p=>unproject(p,origin);
const gable=gableHouseTemplate({widthFeet:40,depthFeet:30,pitch:6,eaveHeight:10});
const faces=gable.faces.map((f,i)=>({...f,id:'slope-'+i,points:f.points.map(geo)}));
const part={id:'measure',wallHeight:10,footprint:gable.footprint.map(geo),roofFaceIds:faces.map(f=>f.id)};
const state={origin,faces,building:{parts:[part]},wallPanels:{width:36,maxLength:15},wallOpenings:[]};
const close=(v,e)=>assert.ok(Math.abs(v-e)<1e-5,'Expected '+e+', got '+v);

let layout=wallPanelLayout(state);
close(layout.area,1625);
assert.equal(layout.oversize,8);
assert.ok(layout.rows.every(r=>!r.profile.needsReview));
let end=layout.rows[1];
assert.equal(end.panels.length,10);
close(end.panels[0].length,11.5);
close(end.panels[4].length,17.5);
close(end.panels[9].length,11.5);
const blankArea=layout.rows.flatMap(r=>r.panels).reduce((n,p)=>n+p.length*3,0);
close(layout.orderArea,blankArea);
const highWindow={wallId:end.id,offset:13,width:4,sill:10,height:3};
validateOpening(end,highWindow);
assert.throws(()=>validateOpening(end,{...highWindow,offset:1}),/fit/);
state.wallOpenings=[highWindow];
close(wallPanelLayout(state).area,1613);

state.wallOpenings=[];
state.faces=[{...faces[0],id:'shed',bearing:0,points:part.footprint}];part.roofFaceIds=['shed'];
layout=wallPanelLayout(state);
close(layout.area,2450);
close(layout.rows[0].panels[0].length,25);
close(layout.rows[2].panels[0].length,10);
assert.equal(layout.oversize,layout.rows.flatMap(r=>r.panels).filter(p=>p.length>15).length);
assert.ok(getWalls(state).every(w=>!w.profile.needsReview));

part.roofFaceIds=['missing'];
layout=wallPanelLayout(state);
close(layout.area,1400);
assert.ok(layout.rows.every(r=>r.profile.needsReview));
delete part.roofFaceIds;
layout=wallPanelLayout(state);
close(layout.area,1400);
assert.ok(layout.rows.every(r=>!r.profile));
console.log('PASS: linked gable and shed infill, high openings, conservative strip blanks, missing slopes and legacy walls');
