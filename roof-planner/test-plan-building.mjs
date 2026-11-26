import assert from 'node:assert/strict';
import {buildPlanProject} from './dist/plan-building.mjs';
import {createProjectState, parseProject, snapshotProject} from './dist/project.mjs';
import {FT, planeData, summarize, unproject} from './dist/geometry.mjs';
import {getWalls} from './dist/walls.mjs';
import {wallPanelLayout} from './dist/wall-panels.mjs';

// Synthetic geometry; no customer plan data.
const center = {lat:44, lng:-122};
const initial = createProjectState();
initial.materials.gauge = '24 ga';
initial.quote.number = 'Test-001';
initial.panelOverrides = [{faceId:'original', panel:1}];
const original = JSON.stringify(initial);
let seq = 0;
const id = () => 'fixture-' + (++seq);
const review = {
  name:'Fixture', width:40, depth:20, roof:'gable', ridge:'EW', wallHeight:12, pitch:6,
  openings:[
    {kind:'Garage door', side:'South', offset:3, width:10, height:8, sill:0},
    {kind:'Door', side:'East', offset:2, width:3, height:7, sill:0},
    {kind:'Window', side:'North', offset:6, width:4, height:3, sill:4}
  ]
};
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-5, `${a} differs from ${b}`);
for (const ridge of ['EW', 'NS']) {
  const model = buildPlanProject(initial, {...review, ridge}, center, id);
  const walls = getWalls(model);
  near(walls[0].widthFeet, 40);
  near(walls[1].widthFeet, 20);
  assert.deepEqual(walls.slice(0,3).map(w => w.openings[0].kind), ['Garage door', 'Door', 'Window']);
  assert.ok(walls[0].a.x < walls[0].b.x && walls[2].a.x > walls[2].b.x);
  const totals = summarize(model.faces, model.origin, model.settings);
  near(totals.flat, 800);
  near(totals.surface, 800*Math.hypot(1,.5));
  const runAcrossGable = ridge === 'EW' ? review.depth : review.width;
  const gableInfill = runAcrossGable * runAcrossGable / 2 * review.pitch / 12;
  near(wallPanelLayout(model).area, 120*12 + gableInfill - 80 - 21 - 12);
  assert.deepEqual(model.building.parts[0].roofFaceIds, model.faces.map(f => f.id));
  const ridgeHeight = ridge === 'EW' ? 17 : 22;
  for (const face of model.faces) {
    const plane = planeData(face, model.origin);
    for (let i=0; i<4; i++) {
      if (face.edges[i] === 'Ridge') {
        near(plane.height(plane.points[i])/FT, ridgeHeight);
        near(plane.height(plane.points[(i+1)%4])/FT, ridgeHeight);
      }
    }
  }
  assert.equal(model.materials.gauge, '24 ga');
  assert.equal(model.quote.number, 'Test-001');
  assert.deepEqual(model.panelOverrides, initial.panelOverrides);
  assert.deepEqual(parseProject(JSON.stringify(snapshotProject(model))), model);
}
for (const [i, downslope] of ['South', 'East', 'North', 'West'].entries()) {
  const model = buildPlanProject(initial, {...review, roof:'shed', downslope}, center, id);
  assert.equal(model.faces.length, 1);
  const face = model.faces[0];
  assert.equal(face.edges[i], 'Eave');
  const data = planeData(face, model.origin);
  near(data.height(data.points[i])/FT, 12);
  near(data.height(data.points[(i+1)%4])/FT, 12);
  near(data.height(data.points[(i+2)%4])/FT, 12 + .5*(i%2 === 0 ? 20 : 40));
}
const flat = buildPlanProject(initial, {...review, roof:'flat', pitch:0}, center, id);
near(summarize(flat.faces, flat.origin, flat.settings).surface, 800);
const prior = buildPlanProject(initial, review, center, id);
// Construct an existing legacy single-footprint project with an opening.
prior.building = {kind:'gable', footprint:prior.building.parts[0].footprint, wallHeight:12};
prior.wallOpenings = [{...prior.wallOpenings[0], wallId:'building-0:0'}];
prior.walls.push({id:'previous-wall', name:'Return', a:unproject({x:60,y:0}, center), b:unproject({x:60,y:8}, center), height:8});
const before = JSON.stringify(prior);
const appended = buildPlanProject(prior, review, unproject({x:40*FT,y:0},center), id);
assert.equal(appended.faces.length, 4);
assert.equal(appended.building.parts.length, 2);
assert.equal(getWalls(appended).find(w => w.id === 'building-0:0').openings[0].kind, 'Garage door');
assert.deepEqual(appended.walls, prior.walls);
assert.deepEqual(appended.faces.slice(0,2), prior.faces);
assert.throws(() => buildPlanProject(prior,review,center,id), /overlaps an existing roof/);
assert.throws(() => buildPlanProject(initial,{...review,openings:[review.openings[0],review.openings[0]]},center,id), /overlaps another/);
assert.throws(() => buildPlanProject(initial,{...review,openings:[{...review.openings[0],offset:39}]},center,id), /must fit/);
assert.throws(() => buildPlanProject(initial,{...review,width:null},center,id), /width/);
assert.throws(() => buildPlanProject(initial,{...review,roof:'flat'},center,id), /zero pitch/);
assert.equal(JSON.stringify(prior), before);
assert.equal(JSON.stringify(initial), original);
console.log('PASS: reviewed building generation, all roof orientations, native wall openings, takeoffs, save/open, cumulative imports and unchanged undo snapshots');
