import assert from 'node:assert/strict';
import {previewWorkshop} from './dist/preview-workshop.mjs';
import {roofTrimLayout,trimDefaults} from './dist/roof-trim.mjs';
import {parseProject,snapshotProject,PROJECT_VERSION} from './dist/project.mjs';
import {buildReportHtml} from './dist/report.mjs';
import {summarize} from './dist/geometry.mjs';

const state=previewWorkshop(),layout=roofTrimLayout(state);
const row=(t,kind)=>t.totals.find(r=>r.kind===kind);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5);
assert.equal(layout.warnings.length,0);
for(const [kind,runs,feet,pieces] of [
 ['Ridge cap',1,32,4],['Opening casing',10,61,11],['Eave trim',2,64,8],
 ['Rake trim',4,48*Math.sqrt(1.25),8],['Fascia',6,64+48*Math.sqrt(1.25),16]
]){
 const part=row(layout,kind);assert.equal(part.runs,runs);close(part.length,feet);assert.equal(part.pieces,pieces);
}
const cap=layout.segments.find(p=>p.kind==='Ridge cap');
assert.deepEqual([...new Set(cap.surfaces.map(s=>s.faceId))].sort(),state.faces.map(f=>f.id).sort());
for(const part of layout.segments)for(const surface of part.surfaces){
 assert.ok(surface.points.length>=3);
 assert.ok(surface.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
}
const casing=layout.segments.filter(s=>s.kind==='Opening casing');
assert.equal(casing.filter(s=>s.detail.endsWith('Sill')).length,1);
const changed=structuredClone(state);changed.wallOpenings.find(o=>o.kind==='Window').width+=1;
close(row(roofTrimLayout(changed),'Opening casing').length,63);
changed.faces[0].eave+=2;
assert.equal(row(roofTrimLayout(changed),'Ridge cap').runs,0);
assert.ok(roofTrimLayout(changed).warnings.some(message=>message.includes('roof heights')));
changed.wallOpenings[0].offset=0;
assert.ok(roofTrimLayout(changed).warnings.some(message=>message.includes('casing clearance')));
const legacy=snapshotProject(state);
legacy.version=9;legacy.trim={eave:true,fascia:true,color:'#445566',stockLength:12};
const restored=parseProject(legacy);
assert.equal(restored.version,PROJECT_VERSION);assert.equal(restored.trim.ridgeCap,false);
assert.equal(restored.trim.casing,false);assert.equal(restored.trim.rake,false);assert.equal(restored.trim.fascia,true);
const blank=roofTrimLayout({...state,trim:trimDefaults});
assert.equal(blank.segments.length,0);
const tuned={...state.trim,casingWidth:4,ridgeWing:7,rakeWing:4,stockLength:12,color:'#653d2f'};
assert.deepEqual(parseProject(snapshotProject({...state,trim:tuned})).trim,tuned);
assert.throws(()=>parseProject({...snapshotProject(state),trim:{casingWidth:0}}),/casing/);
const summary=summarize(state.faces,state.origin,state.settings);
const report=buildReportHtml({state,summary,edgeTotals:{Ridge:32},cutGroups:[],reportType:'material'});
assert.match(report,/Building trim quantities/);
assert.match(report,/<td>Opening casing<\/td><td>10<\/td><td>61\.00<\/td><td>11<\/td>/);
assert.doesNotMatch(buildReportHtml({state,summary,edgeTotals:{},cutGroups:[],reportType:'quote'}),/Building trim quantities/);
