import {getPanelProfile,selectedPan} from './panel-catalog.mjs';
import {wallPanelDefaults,wallPanelLayout} from './wall-panels.mjs';
import {showWallCutSheets} from './wall-cut-sheet.mjs';
export function setupWallPanelControls({getState,checkpoint,render,showDialog,viewPanels}){
 const section=document.createElement('section');section.className='report-controls';
 section.innerHTML='<h2>Wall panels</h2><p class="source">Vertical panels on building sections and standalone walls.</p><button id="wallPanelSetup" class="full">Wall panel settings &amp; quantities</button><label class="check"><input id="wallPanelsVisible" type="checkbox">Show wall panels in 3D</label><button id="wallPanelSheets" class="full">Wall panel cut sheets</button>';
 document.querySelector('#panelSettings').after(section);
 const visible=section.querySelector('#wallPanelsVisible');
 const sync=()=>{visible.checked=Boolean(getState().wallPanels?.show)};
 function openPanel(wallId,offsetFeet){
  const state=getState();
  try{showWallCutSheets({state,layout:wallPanelLayout(state),showDialog,wallId,offsetFeet});}
  catch(error){showDialog('Wall panel cut sheets','<p id="wallCutError" role="alert"></p>');document.querySelector('#wallCutError').textContent=error.message;}
 }
 section.querySelector('#wallPanelSheets').onclick=()=>openPanel();
 visible.onchange=()=>{checkpoint();getState().wallPanels={...wallPanelDefaults,...getState().wallPanels,show:visible.checked};render();sync()};
 sync();
 document.querySelector('#wallPanelSetup').onclick=()=>{
  const state=getState(),s={...wallPanelDefaults,...state.wallPanels};
  showDialog('Wall panels','<div class="form-grid"><label>Effective coverage (in)<input id="wallCoverage" type="number" min="1" max="120" step="0.125" value="'+s.width+'"></label><label>Maximum length (ft)<input id="wallMax" type="number" min="1" max="200" value="'+s.maxLength+'"></label><label>Total end allowance (in)<input id="wallAllowance" type="number" min="0" max="48" value="'+s.allowance+'"></label><label>Wall panel color<input id="wallColor" type="color" value="'+s.color+'"></label></div><button id="applyWallPanels" class="primary full">Apply wall panels &amp; view in 3D</button><p class="source">Net wall area deducts measured doors and windows. Each blank reaches the highest roof point in its strip on roof-linked sections. The order uses full-height blanks with field cutouts around openings. Other walls use the entered wall height. Shared interior walls are included.</p><div id="wallCuts"></div>');
  const cuts=()=>{const layout=wallPanelLayout(getState()),box=document.querySelector('#wallCuts');box.replaceChildren();const note=document.createElement('p');note.textContent=`${layout.count} wall panels · ${layout.area.toFixed(1)} sq ft wall area · ${layout.orderArea.toFixed(1)} sq ft ordered blanks${layout.oversize?' · '+layout.oversize+' OVER MAXIMUM LENGTH':''}`;box.append(note);for(const row of layout.rows.filter(r=>r.cutReview)){const warning=document.createElement('p');warning.textContent=row.name+' needs review. Check its roof profile and opening heights before ordering.';box.append(warning)}const table=document.createElement('table');const head=table.createTHead().insertRow();for(const title of ['Section / wall','Qty','Length (ft)','Check'])head.appendChild(document.createElement('th')).textContent=title;box.append(table);const body=table.createTBody();for(const row of layout.rows){const lengths=new Map();for(const panel of row.panels)lengths.set(panel.length,(lengths.get(panel.length)||0)+1);for(const [length,count] of [...lengths].sort((a,b)=>a[0]-b[0])){const tr=body.insertRow();for(const value of [row.name,count,length.toFixed(3),length>layout.settings.maxLength?'Over maximum':'Within limit'])tr.insertCell().textContent=value}}};
  document.querySelector('#applyWallPanels').onclick=()=>{const width=+document.querySelector('#wallCoverage').value,maxLength=+document.querySelector('#wallMax').value,allowance=+document.querySelector('#wallAllowance').value;if(![width,maxLength,allowance].every(Number.isFinite)||width<1||width>120||maxLength<1||maxLength>200||allowance<0||allowance>48){document.querySelector('#wallCuts').textContent='Check coverage, maximum length, and allowance limits.';return}checkpoint();const current=getState().wallPanels;
  const profile=getPanelProfile(current?.profileId,'wall'),color=document.querySelector('#wallColor').value;
  const profileId=profile?.widths.includes(width)?profile.id:'';
  getState().wallPanels={...current,profileId,panStyle:profileId?selectedPan(profile,width,current?.panStyle)?.id:undefined,width,maxLength,allowance,color,colorName:color===current?.color?current.colorName:'Custom color',show:true};render();sync();if(viewPanels){document.querySelector('#dialog').close();viewPanels()}else cuts()};cuts();
 };
 return {openPanel,sync};
}
