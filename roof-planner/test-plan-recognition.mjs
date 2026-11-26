import assert from 'node:assert/strict';
import {dimensionFeet,recognizePlan} from './dist/plan-recognition.mjs';

function page(number,rows) {
  return {number,lines:rows.map((text,i)=>({text,x:12,y:i*14,height:10}))};
}

assert.equal(dimensionFeet('28′ 2″'),28+2/12);
assert.equal(dimensionFeet('3\'-6 1/2"'),3+6.5/12);
assert.equal(dimensionFeet('80 inches'),80/12);
assert.equal(dimensionFeet('3 ft 6½ in'),3+6.5/12);
assert.equal(dimensionFeet('4'),null);
assert.equal(dimensionFeet('1/0"'),null);

const drawing=recognizePlan([
  page(1,['Building width','42′','Building depth 30 ft','Eave height 12\'','Gable roof','Ridge runs E-W','Roof pitch 4/12']),
  page(2,['South Elevation','GD1 Garage door 12\'W × 10\'H offset 7\' threshold 0\'','W1 offset 23\' sill 3\'','D1 Door 36" x 80" from wall start 32\' threshold 0\'']),
  page(3,['Window schedule','W1 Window 4\'-0" x 3\'-6"'])
]);
assert.deepEqual(drawing.values,{width:42,depth:30,wallHeight:12,roofType:'gable',ridge:'EW',pitch:4});
assert.equal(drawing.elevations[0].side,'South');
assert.ok(drawing.sources.width.includes('Sheet 1'));
assert.equal(drawing.openings.length,3);
const [garage,window,door]=drawing.openings;
assert.equal(garage.kind,'Garage door');
assert.equal(garage.width,12);
assert.equal(garage.sill,0);
assert.equal(window.kind,'Window');
assert.equal(window.width,4);
assert.equal(window.height,3.5);
assert.equal(window.offset,23);
assert.ok(window.source.includes('Sheet 3'));
assert.equal(door.height,80/12);
assert.equal(door.side,'South');

const conflicts=recognizePlan([page(1,['Building width 40 ft','Building width 42 ft','East Elevation','North Elevation','W2 Window 4\' x 3\' grid offset 7\'','40\'','24\'','12','1','Building depth 20\' 3'])]);
assert.equal(conflicts.values.width,undefined);
assert.equal(conflicts.values.depth,undefined);
assert.equal(conflicts.values.pitch,undefined);
assert.equal(conflicts.openings[0].offset,'');
assert.equal(conflicts.openings[0].side,'');
assert.ok(conflicts.notes.some(note=>note.includes('conflicting')));
const conflictingTag=recognizePlan([page(1,["South Elevation","W1 Window 4' x 3' offset 2'"]),page(2,["Window schedule","W1 Window 5' x 3'"])]);
assert.equal(conflictingTag.openings[0].width,'');
assert.equal(conflictingTag.openings[0].height,3);
const marked=recognizePlan([{number:4,lines:[],annotations:[{type:'Line',text:''},{type:'FreeText',text:'Review threshold location'}]}]);
assert.deepEqual(marked.openings,[]);
assert.ok(marked.notes.some(note=>note.includes('threshold location')));
assert.ok(marked.notes.some(note=>note.includes('no readable text')));
console.log('Plan dimension and opening recognition checks passed.');
