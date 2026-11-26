import {trimTypes,trimDimensions,readTrimSettings,roofTrimLayout} from './roof-trim.mjs';
export function setupRoofTrimControls({getState,currentEdge,applyOverhang,checkpoint,render,showDialog,viewTrim}){
 const $=id=>document.getElementById(id),button=document.createElement('button');button.id='addRoofOverhang';button.className='full';button.textContent='Add eave / rake overhang';$('edgeEditor').append(button);
 button.onclick=()=>{const edge=currentEdge();if(!edge)return;showDialog('Add roof overhang','<p class="source">Adds horizontal distance to the selected exterior Eave or Rake, preserving the pitched roof surface and wall positions. Connected collinear rake edges extend together.</p><label>Additional overhang (inches)<input id="overhangInches" type="number" min="0.125" max="48" step="0.125" value="12"></label><button id="applyRoofOverhang" class="primary full">Extend selected roof edge</button><p id="overhangFeedback" role="status"></p>');$('applyRoofOverhang').onclick=()=>{try{applyOverhang(edge,+$('overhangInches').value);$('dialog').close()}catch(error){$('overhangFeedback').textContent=error.message}}};
 const section=document.createElement('section');
 section.className='report-controls';
 section.innerHTML='<h2>Building trim</h2><button id="roofTrimSetup" class="full">Choose trim &amp; quantities</button>';
 $('panelSettings').after(section);
 const types={
  ridgeCap:'Ridge caps on adjoining roof planes',casing:'Casing around doors, garage doors and windows',
  eave:'Eave trim',rake:'Rake trim',fascia:'Fascia on eaves and rakes'
 };
 const ids={ridgeCap:'enableRidgeCap',casing:'enableCasing',eave:'enableEaveTrim',rake:'enableRakeTrim',fascia:'enableFasciaTrim'};
 function open(){
  const current=readTrimSettings(getState().trim||{});
  const choices=trimTypes.map(([key])=>'<label class="check"><input type="checkbox" id="'+ids[key]+'"> '+types[key]+'</label>').join('');
  const sizes=trimDimensions.map(([key,label,min,max])=>'<label>'+label+'<input type="number" id="trim-'+key+'" min="'+min+'" max="'+max+'" step="any" inputmode="decimal"></label>').join('');
  showDialog('Building trim','<div id="trimForm"><fieldset class="trim-options"><legend>Apply to this building</legend>'+choices+'<button type="button" id="selectAllTrim">Select all trim</button></fieldset>'+
    '<div class="form-grid">'+sizes+'<label>Trim color<input id="trimColor" type="color"></label></div>'+
    '<h3>Material quantities</h3><div id="trimTotals" aria-live="polite"></div>'+
    '<p class="source">Casing uses two jambs and a head, plus a sill on windows. Heads and sills span both jambs. Stock rounds up for each run. Allow separately for laps and field cuts.</p>'+
    '<button id="applyRoofTrim" class="primary full">Apply trim &amp; view in 3D</button></div>');
  for(const [key] of trimTypes)$(ids[key]).checked=current[key];
  for(const [key] of trimDimensions)$('trim-'+key).value=current[key];
  $('trimColor').value=current.color;
  const form=$('trimForm'),totals=$('trimTotals');
  function values(){
   const raw={...current,color:$('trimColor').value};
   for(const [key] of trimTypes)raw[key]=$(ids[key]).checked;
   for(const [key,,,,option] of trimDimensions){
    const input=$('trim-'+key);
    input.disabled=Boolean(option&&!raw[option]);
    if(!input.disabled)raw[key]=input.value;
   }
   return readTrimSettings(raw);
  }
  function update(){
   try{
    const draft=values(),layout=roofTrimLayout({...getState(),trim:draft});
    totals.replaceChildren();
    if(layout.totals.length){
     const table=document.createElement('table');
     const header=table.createTHead().insertRow();
     for(const label of ['Trim','Linear ft','Stock pieces']){const cell=document.createElement('th');cell.textContent=label;header.append(cell);}
     const body=table.createTBody();
     for(const row of layout.totals){
      const tr=body.insertRow();
      for(const value of [row.kind,row.length.toFixed(2),String(row.pieces)])tr.insertCell().textContent=value;
     }
     totals.append(table);
    }else totals.textContent='Select the trim you want to apply.';
    if(layout.warnings.length){
     const notes=document.createElement('details'),title=document.createElement('summary');
     title.textContent=layout.warnings.length+' trim locations need review';notes.append(title);
     for(const message of layout.warnings){const p=document.createElement('p');p.textContent=message;notes.append(p);}
     totals.append(notes);
    }
    $('applyRoofTrim').disabled=false;
    return draft;
   }catch(error){totals.textContent=error.message;$('applyRoofTrim').disabled=true;return null;}
  }
  $('selectAllTrim').onclick=()=>{
   for(const [key] of trimTypes)$(ids[key]).checked=true;
   update();
  };
  form.addEventListener('input',update);update();
  $('applyRoofTrim').onclick=()=>{
   const draft=update();if(!draft)return;
   checkpoint();getState().trim=draft;$('dialog').close();render();viewTrim();
  };
 }
 $('roofTrimSetup').onclick=open;
 $('trim3d').onclick=open;
}
