import assert from 'node:assert/strict';
import {createProjectState, parseProject, snapshotProject} from './dist/project.mjs';
import {buildPlanProject} from './dist/plan-building.mjs';
const original=createProjectState();
const review={name:'Test',width:24,depth:30,wallHeight:12,pitch:3,roof:'gable',ridge:'NS',
  fileName:'elevations.pdf',notes:['Check the east sheet.'],openings:[
    {kind:'Garage door',side:'East',width:10,height:9,sill:0,offset:2,source:'Sheet 2, east elevation.'}]};
let sequence=0;
const model=buildPlanProject(original,review,original.origin,()=>String(++sequence));
const restored=parseProject(snapshotProject(model));
const source=restored.building.parts[0].planSource;
assert.equal(source.file,review.fileName);
assert.deepEqual(source.notes,review.notes);
assert.equal(source.openings[0].id,restored.wallOpenings[0].id);
assert.equal(source.openings[0].detail,review.openings[0].source);
assert.equal(original.building,null);
