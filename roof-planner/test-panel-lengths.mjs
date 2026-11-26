import assert from 'node:assert/strict';
import {standardizePanelLengths} from './dist/panel-lengths.mjs';
import {FT, unproject, panelLayout, summarize} from './dist/geometry.mjs';
import {createProjectState} from './dist/project.mjs';
import {quoteTotals} from './dist/report.mjs';

const panels = lengths => lengths.map((rawLengthInches, i) => ({index:i, rawLengthInches}));
const cuts = rows => rows.map(p => Math.round(p.length*12));
const limits = {enabled:true, maxLengthFeet:20};
const unordered = panels([121.3, 119.8, 120.5]);
standardizePanelLengths(unordered, limits);
assert.deepEqual(cuts(unordered), [122, 121, 121]); // 121.3 does not chain via 120.5.
assert.deepEqual(unordered.map(p=>p.index), [0,1,2]);
assert.deepEqual(unordered.map(p=>p.rawLengthInches), [121.3,119.8,120.5]);
standardizePanelLengths(unordered, {enabled:false, maxLengthFeet:20});
assert.deepEqual(cuts(unordered), [122,120,121]);

const boundary = panels([120.02,121.02]);
standardizePanelLengths(boundary, limits);
assert.deepEqual(cuts(boundary), [122,122]);
const outside = panels([120.02,121.02001]);
standardizePanelLengths(outside, limits);
assert.deepEqual(cuts(outside), [121,122]);
const stock = panels([119.8,120,120.01,120.91]);
standardizePanelLengths(stock, {enabled:true, maxLengthFeet:10});
assert.deepEqual(cuts(stock), [120,120,121,121]);
assert.deepEqual(stock.map(p=>p.oversize), [false,false,true,true]);
for (const p of stock) assert.ok(p.length*12 >= p.rawLengthInches);
const minute = panels([120.000000001]);
standardizePanelLengths(minute, limits);
assert.deepEqual(cuts(minute), [121]); // The helper does not round down a supplied requirement.

const state = createProjectState();
const origin = {lat:0, lng:0};
const geo = (xInches, yInches) => unproject({x:xInches/12*FT, y:yInches/12*FT}, origin);
const face = {
  id:'slope', name:'Tapered test roof', bearing:0, pitch:0, eave:10, edges:[],
  points:[geo(0,0),geo(36,0),geo(36,121.2),geo(0,119.1)]
};
const basic = {...state.settings, groupPanelLengths:false, width:12, allowance:.05, maxLength:20};
const grouped = {...basic, groupPanelLengths:true};
const ordinary = panelLayout(face, origin, basic);
const common = panelLayout(face, origin, grouped);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} vs ${b}`);
const required = [119.85,120.55,121.25];
common.forEach((p,i)=>near(p.rawLengthInches,required[i]));
assert.deepEqual(cuts(ordinary), [120,121,122]);
assert.deepEqual(cuts(common), [121,121,122]);
assert.deepEqual(common.map(p=>p.polygon), ordinary.map(p=>p.polygon));
assert.deepEqual(common.map(p=>p.coverage), ordinary.map(p=>p.coverage));
const first = summarize([face],origin,basic), second = summarize([face],origin,grouped);
near(second.orderArea-first.orderArea,1/12);
near(second.surface, first.surface);
state.quote.materialPricePerSqFt=6;
near(quoteTotals(state,second,{}).total - quoteTotals(state,first,{}).total,.5);

const rectangle = (id,height) => ({
  ...face,id,points:[geo(0,0),geo(12,0),geo(12,height),geo(0,height)]
});
const separate = summarize([rectangle('short',119.7),rectangle('long',120.2)],origin,grouped);
assert.deepEqual(separate.rows.map(row=>cuts(row.panels)), [[120],[121]]);
console.log('PASS: per-surface grouping of raw blanks, exact one-inch boundary, stock limits, grouped roof cut lengths, unchanged footprints, ordered area and pricing');
