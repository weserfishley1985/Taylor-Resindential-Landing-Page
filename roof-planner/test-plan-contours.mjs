import assert from 'node:assert/strict';
import {detectElevationOpenings} from './dist/plan-contours.mjs';

function makeFacade(inkOnly=false){
 const width=400,height=120,data=new Uint8ClampedArray(width*height*4);
 const put=(x,y,rgba)=>data.set(rgba,4*(y*width+x));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)put(x,y,[246,246,246,255]);
 function opening(left,top,right,bottom){
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const edge=x===left||x===right-1||y===top||y===bottom-1;
   const v=edge?25:inkOnly?255:163+(x+2*y)%5;
   put(x,y,[v,v,v,255]);
  }
 }
 opening(20,50,50,120);opening(100,40,190,120);opening(280,20,360,50);
 // Colored markup and isolated glyph fragments should not become openings.
 for(let y=10;y<15;y++)for(let x=5;x<50;x++)put(x,y,[0,225,240,255]);
 if(!inkOnly)for(let y=42;y<119;y++)put(142,y,[40,40,40,255]);
 return {width,height,data};
}
const info={side:'South',span:40,height:12};
for(const inkOnly of [false,true]){
 const rows=detectElevationOpenings(makeFacade(inkOnly),info);
 assert.deepEqual(rows.map(r=>r.kind),['Door','Garage door','Window']);
 for(const [i,expected] of [[0,[2,3,7,0]],[1,[10,9,8,0]],[2,[28,8,3,7]]]){
  for(const [j,key] of ['offset','width','height','sill'].entries())assert.ok(Math.abs(rows[i][key]-expected[j])<.21);
  assert.equal(rows[i].side,'South');assert.ok(rows[i].box.width>0&&rows[i].box.height>0);
 }
}
const blank={width:8,height:8,data:new Uint8ClampedArray(256).fill(255)};
assert.equal(detectElevationOpenings(blank,info).length,0);
assert.throws(()=>detectElevationOpenings(blank,{...info,span:0}),/span/);
assert.throws(()=>detectElevationOpenings({...blank,width:20},info),/elevation/);
console.log('PASS: calibrated solid and line-only elevation openings, color markup, floor vs sill, blank and malformed crops');
