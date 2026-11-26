import assert from 'node:assert/strict';
import {printCutSheets,wallCutsCsv} from './dist/wall-cut-sheet.mjs';

const state={address:'=1+2',settings:{groupPanelLengths:true},quote:{projectName:'=SUM(2,3)'},customer:{name:'Owner <img src=x>'}};
const layout={settings:{width:36,allowance:1.5,maxLength:20}};
const p={id:'wall-X:panel-3',stripNumber:3,startFeet:6,endFeet:8,installedWidthInches:24,rawLengthInches:136.5,length:138/12,oversize:false,
  profilePoints:[{x:0,y:120},{x:12,y:135},{x:24,y:126}],
  cutouts:[
    {openingId:'D1',kind:'Door',cutType:'notch',edges:['left','bottom'],xInches:0,yInches:0,widthInches:4,heightInches:84,points:[{x:0,y:0},{x:4,y:0},{x:4,y:84},{x:0,y:84}]},
    {openingId:'W1',kind:'Window',cutType:'cutout',edges:[],xInches:8,yInches:44,widthInches:6,heightInches:35,points:[{x:8,y:44},{x:14,y:44},{x:14,y:79},{x:8,y:79}]},
    {openingId:'G1',kind:'Garage door',cutType:'notch',edges:['right','bottom','top'],xInches:20,yInches:0,widthInches:4,heightInches:129,points:[{x:20,y:0},{x:24,y:0},{x:24,y:126},{x:20,y:129}]}
  ]};
const second={...p,id:'wall-X:panel-4',stripNumber:4,length:138/12,cutouts:[],profilePoints:[{x:0,y:126},{x:24,y:133}],cutReview:true};
const row={name:'East <b>wall</b>',cutReview:true,panels:[p,second]};
const html=printCutSheets(state,layout,row,row.panels);
assert.ok(html.includes('East &lt;b&gt;wall&lt;/b&gt;'));
assert.ok(!html.includes('<img src=x>'));
assert.ok(html.includes('Owner &lt;img src=x&gt;'));
assert.ok(html.includes('Strip 3') && html.includes('Strip 4'));
assert.ok(html.includes('138″</td><td>2'));
assert.ok(html.includes('136.5″'));
assert.ok(html.includes('120″ left') && html.includes('Right 126″'));
assert.ok(html.includes('Window · cutout') && html.includes('Door · notch') && html.includes('Garage door · notch'));
assert.ok(html.includes('(12, 135)') && html.includes('(20, 129)'));
assert.ok(html.includes('Provisional cut sheet'));
assert.ok(html.includes('Length grouping enabled'));
const csv=wallCutsCsv(state,layout,row);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes(`"'=SUM(2,3)"`));
assert.ok(csv.includes('"Opening vertex"') && csv.includes('"Top vertex"') && csv.includes('"Garage door"'));
assert.equal(csv.split('\r\n').filter(l=>l.startsWith('"Opening vertex"')).length,12);
assert.equal(csv.split('\r\n').filter(l=>l.startsWith('"Panel"')).length,2);
const single=wallCutsCsv(state,layout,row,[second]);
assert.ok(!single.includes('wall-X:panel-3'));
assert.ok(single.includes('wall-X:panel-4'));
console.log('Wall cut sheet drawing, packet, CSV and escaping checks passed.');
