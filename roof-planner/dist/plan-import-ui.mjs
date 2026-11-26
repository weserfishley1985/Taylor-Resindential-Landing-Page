import {readPlanPdf} from './plan-reader.mjs';
import {recognizePlan} from './plan-recognition.mjs';
import {detectElevationOpenings} from './plan-contours.mjs';

const kinds=['Door','Window','Garage door'];
const sides=['South','East','North','West'];
const startCorners={South:'southwest',East:'southeast',North:'northeast',West:'northwest'};
const numericFields=['offset','width','height','sill'];
function el(tag,text,cls) {
  const element=document.createElement(tag);
  if(text!==undefined) element.textContent=text;
  if(cls) element.className=cls;
  return element;
}
function button(text,click) {
  const b=el('button',text);
  b.type='button';
  b.addEventListener('click',click);
  return b;
}
function field(container,title,type,options=[]) {
  const label=el('label',title);
  const input=el(options.length?'select':'input');
  if(options.length) {
    for(const [value,text] of [['','Choose…'],...options.map(option=>Array.isArray(option)?option:[option,option])]) {
      const opt=el('option',text); opt.value=value; input.append(opt);
    }
  } else {
    input.type=type;
    if(type==='number') {input.step='any';input.min='0';input.inputMode='decimal';}
  }
  label.append(input);
  container.append(label);
  return input;
}

export function setupPlanImport({onBuild,canStart,toast,findReviewed,routeFile,onOpenExample}) {
  const anchor=document.querySelector('#addPart');
  if(!anchor || document.querySelector('#importBuildingPlan')) return;
  const openButton=button('Import building plans',()=>{if(canStart?.()!==false) dialog.showModal();});
  openButton.id='importBuildingPlan';
  anchor.after(openButton);
  const style=el('style',".pi-dialog{box-sizing:border-box;width:min(1120px,96vw);max-width:96vw;max-height:92vh;padding:0;overflow:auto;background:#10283c;color:#edf5fb;border:1px solid #47718c;border-radius:12px}\n.pi-dialog [hidden]{display:none!important}.pi-dialog::backdrop{background:#061321bd}.pi-dialog h2,.pi-dialog h3{margin:0;color:#f4fbff}\n.pi-dialog>header{position:static;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:#0d2234;height:auto;min-height:0;border-bottom:1px solid #335369}\n.pi-body{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:20px;padding:18px}\n.pi-body section{min-width:0}.pi-body section>*,.pi-body details>*{margin:0 0 12px}\n.pi-dialog label{display:block;margin:0;color:#c9dfec;font-size:13px;line-height:1.4}\n.pi-dialog button,.pi-dialog select,.pi-dialog input{font:inherit;box-sizing:border-box}\n.pi-dialog input:not([type=checkbox]),.pi-dialog select{margin-top:3px;padding:7px;min-height:38px;width:100%;color:#f0f8ff;background:#112738;border:1px solid #527082;border-radius:5px}\n.pi-dialog button,.pi-dialog summary{cursor:pointer}.pi-dialog button{min-height:38px;white-space:normal}\n.pi-dialog button:disabled{opacity:.55;cursor:default}\n.pi-dialog :focus-visible{outline:3px solid #5be3ff;outline-offset:2px}\n.pi-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pi-opening-fields{grid-template-columns:repeat(3,minmax(0,1fr))}\n.pi-help,.pi-ref,.pi-status,.pi-error{line-height:1.4;overflow-wrap:anywhere}.pi-help,.pi-ref{font-size:12px;color:#b6cddc}\n.pi-ref{color:#a0def2}.pi-status{color:#a9f0e5}.pi-error{color:#ffd1ab}\n.pi-dialog ul{padding-left:19px}.pi-dialog li{font-size:13px;margin:5px 0}\n.pi-dialog summary{font-weight:650;color:#a9edff;padding:6px 0}.pi-actions{display:flex;gap:6px;flex-wrap:wrap}\n.pi-scroll{max-width:100%;overflow:auto;margin:6px 0}\n.pi-sheet{width:100%;position:relative;line-height:0;background:#fff}\n.pi-large .pi-sheet{width:1100px}.pi-sheet canvas{width:100%;height:auto;display:block;max-width:none}\n.pi-sheet svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}\n.pi-rows{display:grid;gap:8px}.pi-rows fieldset{margin:0;min-width:0;padding:10px;border:1px solid #39596f;border-radius:6px}\n.pi-dialog .pi-use{display:inline-flex;gap:5px;align-items:center}.pi-dialog .pi-check{display:flex;gap:8px;align-items:flex-start;padding:10px 0}\n.pi-dialog input[type=checkbox]{width:18px;height:18px;flex-shrink:0;accent-color:#47cbf0}\n@media(max-width:760px){.pi-body{grid-template-columns:minmax(0,1fr);padding:12px}.pi-dialog{max-height:94dvh}.pi-dialog>header{padding:10px}.pi-dialog button{min-height:44px}}\n@media(max-width:410px){.pi-opening-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}");document.head.append(style);
  const dialog=el('dialog',undefined,'pi-dialog');
  dialog.setAttribute('aria-labelledby','pi-title');
  const head=el('header'),heading=el('h2','Import building plans');heading.id='pi-title';
  head.append(heading,button('Close',()=>dialog.close()));
  const body=el('div',undefined,'pi-body'), source=el('section'), review=el('section');
  const file=field(source,'Plan file','file');
  file.accept='.pdf,image/png,image/jpeg,image/webp';
  source.append(el('p','Choose a PDF, PNG, JPEG or WebP. The drawing is read in your browser. PDF reading requires an internet connection for the reader software.','pi-help'));
  const status=el('p',undefined,'pi-status');status.setAttribute('role','status');source.append(status);
  let savedExample=null;
  const openExample=button('Open saved 3D model',async()=>{
    if(!savedExample)return;
    try{await onOpenExample(savedExample);}
    catch(error){setStatus('The saved model could not be opened. '+error.message);}
  });
  source.append(openExample);
  const preview=el('div'), sheetList=field(preview,'Sheet','text');
  const pagePicker=el('select');sheetList.replaceWith(pagePicker);
  const surface=el('div',undefined,'pi-sheet'), instructions=el('p',undefined,'pi-help');
  const svgNS='http://www.w3.org/2000/svg';
  const overlay=document.createElementNS(svgNS,'svg');
  overlay.setAttribute('aria-hidden','true');overlay.setAttribute('preserveAspectRatio','none');
  surface.tabIndex=0; surface.setAttribute('aria-label','Elevation preview. During calibration use arrow keys and Enter to place a point.');
  preview.append(surface,instructions); source.append(preview);
  const zoom=button('Enlarge preview',()=>{ const enlarged=source.classList.toggle('pi-large');zoom.textContent=enlarged?'Fit preview':'Enlarge preview'; });
  const scroll=el('div',undefined,'pi-scroll');surface.replaceWith(scroll);scroll.append(surface);preview.insertBefore(zoom,scroll);
  const calibrate=el('details');calibrate.append(el('summary','Find openings on an elevation'));
  calibrate.append(el('p','Use a straight-on exterior elevation. Mark its lower-left wall corner at the floor, then its upper-right wall corner at low-eave height. The wall should fill this rectangle from side to side.','pi-help'));
  const calibrationFields=el('div',undefined,'pi-fields');
  const sideField=field(calibrationFields,'Exterior wall','text',sides);
  const spanField=field(calibrationFields,'Wall span (ft)','number');
  const heightField=field(calibrationFields,'Floor to low eave (ft)','number');
  calibrate.append(calibrationFields);
  const calibrationButtons=el('div',undefined,'pi-actions');
  const pick=button('Mark wall corners',startCalibration),stopPick=button('Cancel marks',cancelCalibration),detect=button('Find openings',detectOpenings);
  calibrationButtons.append(pick,stopPick,detect);calibrate.append(calibrationButtons);preview.append(calibrate);
  const evidence=el('details'),evidenceList=el('ul');evidence.append(el('summary','Drawing notes and references'),evidenceList);source.append(evidence);
  review.append(el('h3','Building measurements'));
  const measurements=el('div',undefined,'pi-fields');review.append(measurements);
  const inputs={
    name:field(measurements,'Building name','text'),
    width:field(measurements,'East–west width (ft)','number'),
    depth:field(measurements,'North–south depth (ft)','number'),
    wallHeight:field(measurements,'Low-eave wall height (ft)','number'),
    roof:field(measurements,'Roof form','text',[['gable','Gable'],['shed','Single slope'],['flat','Flat']]),
    pitch:field(measurements,'Pitch (rise per 12)','number'),
    ridge:field(measurements,'Gable ridge direction','text',[['EW','East–west'],['NS','North–south']]),
    downslope:field(measurements,'Single-slope direction','text',sides)
  };
  const destination=field(review,'Project destination','text',[
    ['append','Add at the current map center'],['new','Start a new project (Undo restores the current project)']
  ]);
  destination.value='append';
  inputs.name.maxLength=46;
  review.append(el('h3','Openings'),el('p','Select the openings to build. Offsets are measured along each wall from its start corner to the first jamb. All dimensions are feet.','pi-help'));
  const rowsArea=el('div',undefined,'pi-rows'), add=button('Add opening',()=>{appendOpening({kind:'Door'});reviewed.checked=false;});
  const confirmLabel=el('label',undefined,'pi-check'),reviewed=el('input');reviewed.type='checkbox';confirmLabel.append(reviewed,document.createTextNode('I checked the building dimensions, roof form, wall offsets and selected openings against the drawing.'));
  const build=button('Add building to project',commit),formError=el('p',undefined,'pi-error');build.classList.add('primary');formError.setAttribute('role','alert');
  review.append(rowsArea,add,confirmLabel,el('p','The building will be added at the current map center.','pi-help'),formError,build);
  body.append(source,review);dialog.append(head,body);document.body.append(dialog);

  let activeFile=null;
  let generation=0,previewVersion=0,controller=null,doc=null,image=null,imageUrl='',pageNumber=1;
  let rows=[],notes=[],canvas=null,corners=[],picking=false,cursor=null,reviewReady=false,matched=false,rectangles=[];
  function setStatus(message){status.textContent=message;}
  function setProgress(message,token){if(token===generation)setStatus(message);}
  function clearPreview() {
    ++previewVersion;canvas=null;surface.replaceChildren(overlay);corners=[];cursor=null;picking=false;drawOverlay();
  }
  function releaseSource() {
    ++generation;
    controller?.abort();controller=null;
    if(doc) Promise.resolve(doc.destroy()).catch(()=>{});
    doc=null;image=null;
    if(imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl='';rectangles=[];clearPreview();
  }
  function reset() {
    releaseSource();activeFile=null;savedExample=null;openExample.hidden=true;rows=[];notes=[];rowsArea.replaceChildren();evidenceList.replaceChildren();pagePicker.replaceChildren();
    for(const input of Object.values(inputs)) {input.value='';input.title='';}
    sideField.value='';spanField.value='';heightField.value='';pageNumber=1;reviewReady=false;matched=false;
    source.classList.remove('pi-large');zoom.textContent='Enlarge preview';
    formError.textContent='';reviewed.checked=false;review.hidden=true;preview.hidden=true;evidence.hidden=true;calibrate.open=false;
    evidence.open=false;setStatus('');syncControls();
  }
  function listNotes(list) {
    evidenceList.replaceChildren(...list.map(note=>el('li',String(note))));
    evidence.hidden=!list.length;
  }
  function roofFields() {
    inputs.ridge.parentElement.hidden=inputs.roof.value!=='gable';inputs.downslope.parentElement.hidden=inputs.roof.value!=='shed';
    if(inputs.roof.value==='flat') inputs.pitch.value='0';
    inputs.pitch.readOnly=inputs.roof.value==='flat';
  }
  function populate(result,filename) {
    destination.value=result.newProject?'new':'append';
    rows=[];rowsArea.replaceChildren();
    const values=result.values||result;
    for(const [key,input] of Object.entries(inputs)) {
      input.value=(key==='roof' ? (values.roof??values.roofType) : values[key])??'';
    }
    inputs.name.value=(values.name||filename.replace(/\.[^.]+$/,'')).slice(0,46);
    const references=[];
    for(const [key,src] of Object.entries(result.sources||{})) {
      const input=inputs[key==='roofType'?'roof':key];
      if(input) input.title=String(src);
      references.push(String(src));
    }
    notes=[...new Set([...(result.notes||[]),...references])];
    listNotes([...new Set([...notes,...references])]);
    for(const row of (result.openings||[]).slice(0,200)) appendOpening(row);
    roofFields();reviewed.checked=false;review.hidden=false;reviewReady=true;syncControls();
  }
  async function selectFile(input,kind) {
    reset();if(!input)return;
    activeFile=input;
    const token=generation;controller=new AbortController();
    const alive=()=>token===generation;
    try {
      if(input.size<1 || input.size>64*1024*1024) throw Error('Select a drawing between 1 byte and 64 MB.');
      const isPdf=kind==='pdf';
      setStatus('Reading the drawing…');
      let reviewedPlan=null;
      if(isPdf && findReviewed){try{reviewedPlan=await findReviewed(input);}catch{ /* Standard sheet review remains available. */ }}
      if(!alive())return;
      matched=Boolean(reviewedPlan);
      let summary='';
      if(matched){
        populate(reviewedPlan.review,input.name);
        savedExample=reviewedPlan.project;
        openExample.hidden=!savedExample || !onOpenExample;
        summary='Reviewed drawing recognized. Building measurements and '+rows.length+' openings are ready to check.';
        setStatus(summary);
      }
      let recovered=null;
      if(isPdf) {
        try {
          const loaded=await readPlanPdf(input,{signal:controller.signal,onProgress:(p,n)=>setProgress((matched?summary+' ':'')+'Reading sheet '+p+' of '+n+'…',token)});
          if(!alive()){await loaded.destroy();return;}
          doc=loaded;if(!matched)recovered=recognizePlan(doc.pages);
        } catch(err) {
          if(!alive())return;
          if(!reviewedPlan)throw err;
          setStatus(summary+' The sheet preview is unavailable. '+err.message);
        }
      } else {
        imageUrl=URL.createObjectURL(input.slice(0,input.size,'image/'+kind));
        const img=new Image();img.src=imageUrl;
        await img.decode();if(!alive())return;
        if(img.naturalWidth*img.naturalHeight>80000000) throw Error('This image is too large. Export an elevation sheet below 80 megapixels.');
        image=img;
      }
      if(!matched){
        const result=recovered||{notes:['Review the dimensions and calibrate a straight-on elevation to locate openings.'],openings:[]};
        populate(result,input.name);
      }
      const count=doc?.pages.length||(image?1:0);
      for(let i=1;i<=count;i++){const opt=el('option',isPdf?'Sheet '+i:'Image');opt.value=String(i);pagePicker.append(opt);}
      pagePicker.value='1';preview.hidden=!count;
      if(count) await showSheet(1);
      if(!alive())return;
      if(count && canvas) setStatus(matched?summary:'Drawing ready. Check each proposed measurement and opening.');
    } catch(err) {
      if(!alive())return;
      reset();file.value='';setStatus(err.message||'The drawing could not be opened.');
    }
  }
  async function showSheet(number) {
    pageNumber=number;clearPreview();const version=previewVersion;
    const target=el('canvas');instructions.textContent='';
    try{
      if(doc)await doc.renderPage(number,target);
      else if(image){const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));target.width=Math.max(1,Math.round(image.naturalWidth*scale));target.height=Math.max(1,Math.round(image.naturalHeight*scale));target.getContext('2d').drawImage(image,0,0,target.width,target.height);}
      else return;
      if(version!==previewVersion)return;
      canvas=target;surface.replaceChildren(canvas,overlay);overlay.setAttribute('viewBox','0 0 '+canvas.width+' '+canvas.height);
      drawOverlay();syncControls();
    }catch(err){if(version===previewVersion)setStatus('The sheet preview could not render. '+err.message);}
  }
  function appendOpening(row) {
    if(rows.length>=200){formError.textContent='Up to 200 openings can be reviewed at once.';return;}
    const box=el('fieldset'),title=el('legend'),used=el('input');used.type='checkbox';used.checked=true;
    const rowNumber=el('span','Opening '+(rows.length+1)+' · ');title.append(rowNumber);
    const toggle=el('label',undefined,'pi-use');toggle.append(used,document.createTextNode('Include'));title.append(toggle);box.append(title);
    const fields=el('div',undefined,'pi-fields pi-opening-fields'), rowInputs={};
    rowInputs.kind=field(fields,'Opening','text',kinds);rowInputs.side=field(fields,'Wall','text',sides);
    for(const key of numericFields) rowInputs[key]=field(fields,key==='offset'?'Offset (ft)':key[0].toUpperCase()+key.slice(1)+' (ft)','number');
    for(const [key,input] of Object.entries(rowInputs)) input.value=row[key]??'';
    const from=el('p',undefined,'pi-help');
    const entry={used,inputs:rowInputs,box,rowNumber,source:String(row.source||row.tag||'')};
    function showSide(){const corner=startCorners[rowInputs.side.value];from.textContent=corner?'Offset from the '+corner+' wall corner.':'Choose the exterior wall to set the offset origin.';}
    rowInputs.side.addEventListener('change',showSide);showSide();box.append(fields,from);
    if(row.source||row.tag)box.append(el('p',[row.tag,row.source].filter(Boolean).join(' · '),'pi-ref'));
    const remove=button('Remove opening',()=>{rows=rows.filter(r=>r!==entry);box.remove();rows.forEach((r,i)=>r.rowNumber.textContent='Opening '+(i+1)+' · ');reviewed.checked=false;drawOverlay();});
    box.append(remove);rows.push(entry);rowsArea.append(box);
    return entry;
  }
  function syncControls() {
    pick.disabled=!canvas || !sideField.value;stopPick.disabled=!picking && !corners.length;
    detect.disabled=!canvas || corners.length!==2 || !sideField.value || !(Number(spanField.value)>0 && Number(heightField.value)>0);
    build.disabled=!reviewReady;
  }
  function cancelCalibration(){picking=false;corners=[];cursor=null;instructions.textContent='';drawOverlay();syncControls();}
  function startCalibration(){
    if(!canvas||!sideField.value)return;
    picking=true;corners=[];cursor={x:Math.round(canvas.width/2),y:Math.round(canvas.height/2)};
    instructions.textContent='Mark the lower-left wall corner at floor level. Use arrow keys and Enter for keyboard placement.';surface.focus();drawOverlay();syncControls();
  }
  function mark(point) {
    if(!picking || !canvas)return;
    if(corners.length===1 && (point.x-corners[0].x<15 || corners[0].y-point.y<15)){instructions.textContent='Choose the upper-right corner above and to the right of the floor corner.';return;}
    corners.push(point);cursor=point;
    if(corners.length===2){picking=false;instructions.textContent='Check the rectangle, wall span and eave height, then find the openings.';}
    else instructions.textContent='Mark the upper-right wall corner at low-eave height.';
    drawOverlay();syncControls();
  }
  function svgShape(type,attrs) {
    const s=document.createElementNS(svgNS,type);
    for(const [k,v] of Object.entries(attrs))s.setAttribute(k,v);
    overlay.append(s);return s;
  }
  function drawOverlay() {
    overlay.replaceChildren();if(!canvas)return;
    const scale=canvas.width/(surface.clientWidth||600);
    const rect=(x,y,w,h,color)=>svgShape('rect',{x,y,width:w,height:h,stroke:color,fill:'none','stroke-width':2*scale});
    for(const item of rectangles) {
      const number=rows.indexOf(item.entry)+1;
      if(!number || !item.entry.used.checked || item.page!==pageNumber)continue;
      const b=item.box;rect(b.x,b.y,b.width,b.height,'#ffad21');
      const t=svgShape('text',{x:b.x+2*scale,y:b.y+13*scale,fill:'#151515',stroke:'white','stroke-width':3*scale,'paint-order':'stroke','font-size':14*scale,'font-weight':'bold'});t.textContent=number;
    }
    if(corners.length===2)rect(corners[0].x,corners[1].y,corners[1].x-corners[0].x,corners[0].y-corners[1].y,'#0097b2');
    for(const c of [...corners,...(picking&&cursor?[cursor]:[])])svgShape('circle',{cx:c.x,cy:c.y,r:4*scale,fill:'#ffad21',stroke:'#10161b','stroke-width':2*scale});
  }
  async function detectOpenings() {
    if(!canvas || corners.length!==2)return;
    try{
      const side=sideField.value,span=Number(spanField.value),height=Number(heightField.value);
      if(!sides.includes(side)||!(span>0&&span<=1000&&height>0&&height<=200))throw Error('Enter a wall span up to 1,000 ft and an eave height up to 200 ft.');
      const x=corners[0].x,y=corners[1].y;
      const width=corners[1].x-x,heightPx=corners[0].y-y,version=previewVersion;
      let base=canvas;
      if(doc && doc.pages[pageNumber-1]?.annotations?.length){
        base=el('canvas'); detect.disabled=true;
        await doc.renderPage(pageNumber,base,{markup:false});
        if(version!==previewVersion || !corners.length || x!==corners[0].x || y!==corners[1]?.y || side!==sideField.value || span!==Number(spanField.value) || height!==Number(heightField.value))return;
      }
      const pixels=base.getContext('2d').getImageData(x,y,width,heightPx);
      const found=detectElevationOpenings(pixels,{side,span,height});
      if(!found.length){instructions.textContent='No rectangular openings were found. Check the marks or add an opening manually.';return;}
      let added=0,duplicates=0;
      for(const opening of found){
        const tolerance=Math.max(0.16,3*span/pixels.width);
        const same=rows.find(r=>r.inputs.side.value===side && r.inputs.offset.value!=='' && r.inputs.width.value!=='' && Math.abs(Number(r.inputs.offset.value)-opening.offset)<=tolerance && Math.abs(Number(r.inputs.width.value)-opening.width)<=tolerance && r.inputs.sill.value!=='' && Math.abs(Number(r.inputs.sill.value)-opening.sill)<=Math.max(tolerance,0.3));
        const absolute={...opening.box,x:opening.box.x+x,y:opening.box.y+y};
        if(same){duplicates++;if(!rectangles.some(item=>item.entry===same&&item.page===pageNumber))rectangles.push({entry:same,box:absolute,page:pageNumber});continue;}
        const item={...opening,source:'Sheet '+pageNumber+' · calibrated '+side.toLowerCase()+' elevation'};
        for(const key of numericFields)item[key]=Math.round(item[key]*1000)/1000;
        const entry=appendOpening(item);
        if(!entry)break;
        rectangles.push({entry,box:absolute,page:pageNumber});added++;
      }
      reviewed.checked=false;drawOverlay();instructions.textContent=added+' new opening candidates. '+duplicates+' already in the list. Check the sizes and positions.';
    }catch(err){instructions.textContent=err.message||'Openings could not be measured from this view.';}finally{syncControls();}
  }
  function commit(){
    if(!dialog.open || !reviewReady || !activeFile)return;
    formError.textContent='';
    try{
      if(!reviewed.checked)throw Error('Check the dimensions and openings, then select the review checkbox.');
      const result={newProject:destination.value==='new',fileName:activeFile.name,notes:[...notes],openings:[]};
      for(const [key,input] of Object.entries(inputs)) {
        if(input.type==='number' && !input.value.trim())throw Error('Enter '+input.parentElement.firstChild.textContent+'.');
        result[key]=input.type==='number'?Number(input.value):input.value.trim();
      }
      if(!result.name||!result.roof||result.roof==='gable'&&!result.ridge||result.roof==='shed'&&!result.downslope)throw Error('Complete the building name, roof form and roof direction.');
      for(const [index,row] of rows.entries()){
        if(!row.used.checked)continue;
        const record={};
        for(const [key,input] of Object.entries(row.inputs)){
          if(input.value==='')throw Error('Opening '+(index+1)+' needs '+key+'. Enter it or deselect this opening.');
          record[key]=input.type==='number'?Number(input.value):input.value;
        }
        if(row.source)record.source=row.source;
        result.openings.push(record);
      }
      onBuild(result);dialog.close();
    }catch(err){formError.textContent=err.message||'The building could not be added.';}
  }
  function selectSide(){
    const key=['North','South'].includes(sideField.value)?'width':'depth';
    spanField.value=inputs[key].value;heightField.value=inputs.wallHeight.value;
    cancelCalibration();
  }
  sideField.addEventListener('change',selectSide);
  calibrationFields.addEventListener('input',syncControls);inputs.roof.addEventListener('change',roofFields);
  file.addEventListener('change',()=>{const selected=file.files[0];file.value='';if(selected)void routeFile(selected);});
  pagePicker.addEventListener('change',()=>showSheet(Number(pagePicker.value)));
  surface.addEventListener('click',event=>{
    if(!canvas||!picking)return;
    const b=canvas.getBoundingClientRect();
    mark({x:Math.max(0,Math.min(canvas.width,Math.round((event.clientX-b.left)*canvas.width/b.width))),y:Math.max(0,Math.min(canvas.height,Math.round((event.clientY-b.top)*canvas.height/b.height)))});
  });
  surface.addEventListener('keydown',event=>{
    if(!picking||!cursor)return;
    const step=event.shiftKey?10:1;
    if(event.key==='Enter'){event.preventDefault();mark({...cursor});return;}
    const delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
    if(delta){event.preventDefault();cursor={x:Math.max(0,Math.min(canvas.width,cursor.x+delta[0])),y:Math.max(0,Math.min(canvas.height,cursor.y+delta[1]))};drawOverlay();}
  });
  review.addEventListener('input',event=>{if(event.target!==reviewed){reviewed.checked=false;formError.textContent='';drawOverlay();}});
  dialog.addEventListener('close',()=>{if(dialog.open)return;reset();file.value='';openButton.focus();});
  reset();
  return {
    beginSelection(){
      if(!dialog.open)return ()=>true;
      reset();setStatus('Checking selected file…');
      const token=generation;
      return ()=>dialog.open && generation===token;
    },
    openFile(input,kind){
      if(canStart?.()===false)return;
      if(!dialog.open)dialog.showModal();
      return selectFile(input,kind);
    },
    close(){if(dialog.open)dialog.close();else reset();},
    reportFileError(message){if(!dialog.open)return false;setStatus(message);return true;}
  };
}
