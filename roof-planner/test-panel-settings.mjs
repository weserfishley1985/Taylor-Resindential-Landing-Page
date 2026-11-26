import assert from 'node:assert/strict';
import {createProjectState, parseProject, snapshotProject, PROJECT_VERSION} from './dist/project.mjs';
const fresh=createProjectState();
assert.equal(fresh.settings.groupPanelLengths,true);
for(const value of [false,true]){
  fresh.settings.groupPanelLengths=value;
  const saved=snapshotProject(fresh);
  assert.equal(saved.version,PROJECT_VERSION);
  assert.equal(parseProject(saved).settings.groupPanelLengths,value);
}
const old=snapshotProject(fresh);
old.version=7;
delete old.settings.groupPanelLengths;
assert.equal(parseProject(old).settings.groupPanelLengths,false);
const invalid=snapshotProject(fresh);
invalid.settings.groupPanelLengths='yes';
assert.throws(()=>parseProject(invalid),/grouping/);
