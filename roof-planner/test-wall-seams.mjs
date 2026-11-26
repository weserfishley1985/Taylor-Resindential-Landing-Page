import assert from 'node:assert/strict';
import {wallPanelSeams} from './dist/walls.mjs';
const cell=(left,right,bottom,top)=>({left,right,bottom,topLeft:top,topRight:top});
const row={panels:[
 {startFeet:0,endFeet:3,cells:[cell(0,1,0,10),cell(1,3,0,3),cell(1,3,7,10)]},
 {startFeet:3,endFeet:6,cells:[cell(3,5,0,3),cell(3,5,7,10),cell(5,6,0,10)]}
]};
const lines=wallPanelSeams(row);
assert.deepEqual(lines.filter(s=>s.station===3),[{station:3,bottom:0,top:3},{station:3,bottom:7,top:10}]);
assert.equal(lines.some(s=>s.station===1||s.station===5),false);
