import assert from 'node:assert/strict';
import {FT,gableHouseTemplate,unproject} from './dist/geometry.mjs';
import {wallPanelLayout} from './dist/wall-panels.mjs';

const origin={lat:38,lng:-121},geo=(x,y)=>unproject({x:x*FT,y:y*FT},origin);
const wall={id:'side',name:'Side',a:geo(0,0),b:geo(13,0),height:10};
const hole=(id,kind,offset,width,height,sill)=>({id,wallId:'side',kind,offset,width,height,sill});
const state={origin,walls:[wall],wallPanels:{width:36,maxLength:20,allowance:.25},wallOpenings:[
 hole('wnd','Window',.5,1.5,4,3),hole('entry','Door',4.5,3,7,0),
 hole('bay','Garage door',9,3,10,0),hole('vent','Window',12.25,.5,2,8)
]};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-4,'Expected '+expected+', got '+actual);
const area=pts=>Math.abs(pts.reduce((a,p,i)=>{const q=pts[(i+1)%pts.length];return a+p.x*q.y-p.y*q.x},0))/2;
function checkStrip(panel){
 const gross=panel.profilePoints.slice(1).reduce((a,p,i)=>{const prev=panel.profilePoints[i];return a+(p.x-prev.x)*(p.y+prev.y)/2},0);
 const material=panel.cells.reduce((a,c)=>a+144*(c.right-c.left)*(c.top-c.bottom),0);
 close(gross,material+panel.cutouts.reduce((a,c)=>a+area(c.points),0));
}
const first=wallPanelLayout(state).rows[0].panels;
assert.deepEqual(first.map(p=>p.stripNumber),[1,2,3,5]);
assert.ok(first.every(p=>!p.cutReview));assert.equal(first[3].id,'side:panel-5');close(first[3].installedWidthInches,12);
const inside=first[0].cutouts[0];assert.equal(inside.openingId,'wnd');assert.equal(inside.kind,'Window');
assert.equal(inside.cutType,'cutout');assert.deepEqual(inside.edges,[]);
close(inside.xInches,6);close(inside.yInches,36);close(inside.widthInches,18);close(inside.heightInches,48);
assert.deepEqual(first[1].cutouts[0].edges,['right','bottom']);assert.deepEqual(first[2].cutouts[0].edges,['left','bottom']);
assert.deepEqual(first[3].cutouts[0].edges,['top']);
for(const p of first){checkStrip(p);close(p.rawLengthInches,120.25);close(p.length,121/12)}
state.wallOpenings[2].height=8;
const garage=wallPanelLayout(state).rows[0].panels.find(p=>p.stripNumber===4);
assert.equal(garage.cutouts[0].kind,'Garage door');assert.deepEqual(garage.cutouts[0].edges,['left','right','bottom']);checkStrip(garage);

const gable=gableHouseTemplate({widthFeet:40,depthFeet:30,eaveHeight:10,pitch:6});
const faces=gable.faces.map((f,i)=>({...f,id:'f'+i,points:f.points.map(p=>unproject(p,origin))}));
const endState={origin,faces,building:{parts:[{id:'b',wallHeight:10,footprint:gable.footprint.map(p=>unproject(p,origin)),roofFaceIds:faces.map(f=>f.id)}]},
 wallPanels:{width:96,maxLength:25,allowance:0},wallOpenings:[{id:'gable-window',wallId:'b:1',kind:'Window',offset:14,width:2,sill:17,height:1}]};
const end=wallPanelLayout(endState).rows[1],panel=end.panels[1];
assert.ok(end.cutReview&&panel.cutReview);
assert.equal(panel.profilePoints.length,3);close(panel.profilePoints[1].x,84);close(panel.profilePoints[1].y,210);
const apex=panel.cutouts[0];close(area(apex.points),72);close(apex.heightInches,6);assert.ok(apex.edges.includes('top'));checkStrip(panel);
endState.settings={groupPanelLengths:true};
const grouped=wallPanelLayout(endState),after=grouped.rows[1].panels[1];
assert.deepEqual(after.profilePoints,panel.profilePoints);assert.deepEqual(after.cutouts,panel.cutouts);
for(const p of grouped.rows.flatMap(r=>r.panels))assert.ok(p.length*12+1e-6>=p.rawLengthInches);
close(grouped.orderArea,grouped.rows.flatMap(r=>r.panels).reduce((s,p)=>s+p.length*8,0));
console.log('PASS: strip IDs and empty gaps, lower-left cutout coordinates, partial coverage, notches, roof profile and clipped gable cutout area');
