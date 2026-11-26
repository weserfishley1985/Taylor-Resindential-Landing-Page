const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const measure = value => Number.isFinite(value) ? String(Number(value.toFixed(3))) : '—';
const inches = value => measure(value)+'″';
const feet = value => measure(value)+' ft';
const blankInches = panel => Math.round(panel.length*12);
const profileText = points => points.map(point => '('+measure(point.x)+', '+measure(point.y)+')').join(' → ');
const sheetNumber = number => 'Strip '+number;
const batchSize = 40;
const basis = 'Dimensions are inches from the installed lower-left corner. The wall start is shown on the left. X increases toward the wall end. Y increases upward. Verify opening locations, hems, laps and end allowances in the field before cutting.';
const css = `
.wall-sheet{font:14px/1.45 system-ui,sans-serif}.wall-sheet [hidden]{display:none!important}.wall-sheet h2,.wall-sheet h3,.wall-sheet h4{margin:.65em 0 .3em}.wall-sheet p{margin:.45em 0}
.wall-sheet .ws-actions{display:flex;flex-wrap:wrap;align-items:end;gap:8px;margin:12px 0}.wall-sheet label{display:grid;gap:4px;min-width:0}
.wall-sheet input,.wall-sheet select,.wall-sheet button{max-width:100%}.wall-sheet input[type=number]{width:90px}.wall-sheet .ws-wall{width:100%}
.wall-sheet .ws-actions button,.wall-sheet .ws-actions select,.wall-sheet .ws-actions input{min-height:40px}.wall-sheet .ws-status{color:#ffd38d}.wall-sheet .ws-ref{font-size:11px;overflow-wrap:anywhere}
.wall-sheet .ws-data{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;margin:8px 0}.wall-sheet .ws-data>div{padding:4px 0;border-bottom:1px solid #8da1b455}
.wall-sheet .ws-data dt{font-size:12px}.wall-sheet .ws-data dd{font-weight:650;margin:0}.wall-sheet .ws-figure{display:block;width:100%;height:auto;border:1px solid #c4d2db;border-radius:6px;background:#fff}
.wall-sheet .ws-cut{border:1px solid #8da1b477;padding:8px 10px;margin:8px 0;border-radius:5px}.wall-sheet .ws-wide{overflow:auto}.wall-sheet table{border-collapse:collapse;width:100%}.wall-sheet th,.wall-sheet td{text-align:left;padding:5px 8px;border-bottom:1px solid #aebac1}.wall-sheet .ws-note{font-size:12px}.wall-sheet button:focus-visible,.wall-sheet input:focus-visible,.wall-sheet select:focus-visible{outline:3px solid #43b7ef;outline-offset:2px}
@media(max-width:600px){.wall-sheet .ws-actions button{min-height:44px}.wall-sheet .ws-data{gap:4px 8px}}
`;

function sourceNotes(state,row) {
 const part=state.building?.parts?.find(part=>row.id?.slice(0,row.id.lastIndexOf(':'))===part.id);
 return part?.planSource?.notes || [];
}

function orderBasis(state,settings) {
  return (state.settings?.groupPanelLengths?'Length grouping enabled. Required blanks within 1″ on this wall can share an order length. ':'Length grouping off. ')+'Maximum order length '+feet(settings.maxLength)+'.';
}

function blankGroups(panels) {
  const byLength=new Map();
  for(const panel of panels){
    const length=blankInches(panel);
    byLength.set(length,(byLength.get(length)||0)+1);
  }
  return [...byLength].sort((a,b)=>a[0]-b[0]);
}

function panelDrawing(panel,settings) {
  const width=panel.installedWidthInches;
  const orderWidth=settings.width, orderLength=blankInches(panel);
  const profile=panel.profilePoints;
  const plotWidth=320,plotHeight=280,scale=Math.min(plotWidth/Math.max(orderWidth,width),plotHeight/profile.reduce((bound,p)=>Math.max(bound,p.y),orderLength));
  const left=(540-orderWidth*scale)/2, bottom=315;
  const x=v=>(left+v*scale).toFixed(3), y=v=>(bottom-v*scale).toFixed(3);
  const path=points=>points.map((p,i)=>(i?'L':'M')+x(p.x)+' '+y(p.y)).join(' ')+'Z';
  const outline=[{x:0,y:0},{x:width,y:0},...profile.slice().reverse()];
  const root=path(outline);
  let shapes='<rect x="'+x(0)+'" y="'+y(orderLength)+'" width="'+(orderWidth*scale).toFixed(3)+'" height="'+(orderLength*scale).toFixed(3)+'" fill="#f4f7f9" stroke="#677881" stroke-dasharray="4 3"/>';
  shapes+='<path d="'+root+'" fill="#bad9de" stroke="#17475b" stroke-width="1.6"/>';
  panel.cutouts.forEach((cut,index)=>{
    const color=cut.kind==='Window'?'#176487':cut.kind==='Garage door'?'#9a4d11':'#704b85';
    const cx=cut.points.reduce((sum,p)=>sum+p.x,0)/cut.points.length;
    const cy=cut.points.reduce((sum,p)=>sum+p.y,0)/cut.points.length;
    shapes+='<path d="'+path(cut.points)+'" fill="#fff" stroke="'+color+'" stroke-width="1.4"/>';
    shapes+='<text x="'+x(cx)+'" y="'+y(cy)+'" font-size="11" text-anchor="middle" dominant-baseline="central" fill="'+color+'" paint-order="stroke" stroke="#fff" stroke-width="2">'+(index+1)+'</text>';
  });
  const line=(x1,y1,x2,y2)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#425c68"/>';
  const text=(tx,ty,s,anchor)=>'<text x="'+tx+'" y="'+ty+'" text-anchor="'+anchor+'" font-size="12" fill="#1c3542">'+xml(s)+'</text>';
  const leftTop=profile[0].y,rightTop=profile.at(-1).y;
  shapes+=line(x(0),bottom+12,x(width),bottom+12)+line(x(0),bottom+8,x(0),bottom+16)+line(x(width),bottom+8,x(width),bottom+16);
  shapes+=text(x(width/2),bottom+33,'Installed width '+inches(width),'middle');
  shapes+=text(Number(x(0))-8,Number(y(leftTop))+3,inches(leftTop)+' left','end')+text(Number(x(width))+8,Number(y(rightTop))+3,'Right '+inches(rightTop),'start');
  shapes+='<circle cx="'+x(0)+'" cy="'+y(0)+'" r="3" fill="#153b4e"/>';
  return '<svg class="ws-figure" role="img" aria-label="'+xml(sheetNumber(panel.stripNumber)+' exterior face, fitted top profile and '+panel.cutouts.length+' opening cuts')+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 360"><rect width="540" height="360" fill="white"/>'+shapes+'</svg>';
}

function panelDetails(row,panel,settings) {
  const top=panel.profilePoints;
  const data=[
    ['Order blank',inches(blankInches(panel))+' long × '+inches(settings.width)+' coverage'],
    ['Installed strip width',inches(panel.installedWidthInches)],
    ['Strip starts from wall start',feet(panel.startFeet)],
    ['Strip ends from wall start',feet(panel.endFeet)],
    ['Left fitted height',inches(top[0].y)],
    ['Right fitted height',inches(top.at(-1).y)],
    ['Required length including allowance',inches(panel.rawLengthInches)],
    ['Total end allowance',inches(settings.allowance)]
  ];
  const stats='<dl class="ws-data">'+data.map(([label,value])=>'<div><dt>'+xml(label)+'</dt><dd>'+xml(value)+'</dd></div>').join('')+'</dl>';
  const warnings=[];
  if(panel.oversize)warnings.push('Over maximum panel length of '+feet(settings.maxLength)+'. Review before ordering.');
  if(row.profile?.needsReview)warnings.push('Roof coverage on this wall is incomplete or conflicting. Check the fitted top in the building model.');
  if((panel.cutReview||row.cutReview) && !row.profile?.needsReview)warnings.push('Provisional cut sheet. Check opening limits and the wall profile in the building before cutting.');
  const cuts=panel.cutouts.map((cut,index)=>{
    const right=Math.max(0,panel.installedWidthInches-cut.xInches-cut.widthInches);
    const edges=cut.edges.length?' · touches '+cut.edges.join(', '):'';
    return '<section class="ws-cut"><strong>'+xml((index+1)+'. '+cut.kind+' · '+cut.cutType+edges)+'</strong><p>From left '+inches(cut.xInches)+' · from right '+inches(right)+' · sill '+inches(cut.yInches)+' · head '+inches(cut.yInches+cut.heightInches)+'</p><p>Cut bounds '+inches(cut.widthInches)+' × '+inches(cut.heightInches)+'</p><p class="ws-note">Cut vertices (X, Y) in inches '+xml(profileText(cut.points))+'</p><p class="ws-ref">Opening ID '+xml(cut.openingId)+'</p></section>';
  }).join('');
  return '<article><h3>'+xml(row.name)+' · '+sheetNumber(panel.stripNumber)+'</h3><p class="ws-ref">Panel ID '+xml(panel.id)+'</p>'+
    warnings.map(w=>'<p><strong>'+xml(w)+'</strong></p>').join('')+stats+panelDrawing(panel,settings)+
    '<p class="ws-note">The filled shape is the installed face. The dashed rectangle uses ordered length and effective coverage. Physical side laps and seams are outside these dimensions.</p>'+
    '<h4>Fitted top</h4><p>Top vertices (X, Y) in inches, left to right '+xml(profileText(top))+'</p>'+
    '<h4>Opening cuts · '+panel.cutouts.length+'</h4>'+(cuts||'<p>Full face without openings.</p>')+'</article>';
}

function csvCell(value) {
  if(typeof value==='number')return Number.isFinite(value)?String(Number(value.toFixed(5))):'';
  const s=String(value??'');
  const safe=/^[\t\r\n]|^\s*[=+\-@]/.test(s)?"'"+s:s;
  return '"'+safe.replace(/"/g,'""')+'"';
}

export function wallCutsCsv(state,layout,row,panels=row.panels) {
  const headings=['Record','Project','Wall','Panel ID','Strip','Quantity','Order blank (in)','Width coverage (in)','Installed width (in)','Wall start (ft)','Wall end (ft)','Required incl allowance (in)','End allowance (in)','Over maximum','Opening ID','Opening kind','Cut type','Touched edges','Polygon vertex','X from left (in)','Y from bottom (in)','Bounds width (in)','Bounds height (in)','Right clearance (in)','Head from bottom (in)','Notes'];
  const project=state.quote?.projectName||state.address||'Roof Planner';
  const lines=[headings];
  const record=(name,fields={})=>{
    const values={'Record':name,'Project':project,'Wall':row.name,...fields};
    lines.push(headings.map(h=>values[h]??''));
  };
  record('Basis',{'Notes':basis+' '+orderBasis(state,layout.settings)+((row.profile?.needsReview||row.cutReview)?' Provisional cuts; verify wall profile and openings.':'')});
  for(const note of sourceNotes(state,row))record('Drawing note',{'Notes':note});
  for(const [length,count] of blankGroups(panels))record('Order group',{'Quantity':count,'Order blank (in)':length,'Width coverage (in)':layout.settings.width});
  for(const p of panels){
    const id={'Panel ID':p.id,'Strip':p.stripNumber};
    record('Panel',{...id,'Quantity':1,'Order blank (in)':blankInches(p),'Width coverage (in)':layout.settings.width,'Installed width (in)':p.installedWidthInches,'Wall start (ft)':p.startFeet,'Wall end (ft)':p.endFeet,'Required incl allowance (in)':p.rawLengthInches,'End allowance (in)':layout.settings.allowance,'Over maximum':p.oversize?'Yes':'No'});
    p.profilePoints.forEach((v,i)=>record('Top vertex',{...id,'Polygon vertex':i+1,'X from left (in)':v.x,'Y from bottom (in)':v.y}));
    for(const cut of p.cutouts){
      const opening={...id,'Opening ID':cut.openingId,'Opening kind':cut.kind,'Cut type':cut.cutType,'Touched edges':cut.edges.join(' + ')};
      record('Opening bounds',{...opening,'X from left (in)':cut.xInches,'Y from bottom (in)':cut.yInches,'Bounds width (in)':cut.widthInches,'Bounds height (in)':cut.heightInches,'Right clearance (in)':Math.max(0,p.installedWidthInches-cut.xInches-cut.widthInches),'Head from bottom (in)':cut.yInches+cut.heightInches});
      cut.points.forEach((v,i)=>record('Opening vertex',{...opening,'Polygon vertex':i+1,'X from left (in)':v.x,'Y from bottom (in)':v.y}));
    }
  }
  return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

export function printCutSheets(state,layout,row,panels) {
  const title=(state.quote?.projectName||'Taylor Metal roof project')+' · '+row.name+' wall cut sheets';
  const notes=sourceNotes(state,row);
  const drawingNotes=notes.length?'<details open><summary>Drawing references for review</summary><ul>'+notes.map(note=>'<li>'+xml(note)+'</li>').join('')+'</ul></details>':'';
  const context=[state.customer?.name,state.address].filter(Boolean).map(xml).join(' · ');
  const groups=blankGroups(panels).map(([len,count])=>'<tr><td>'+inches(len)+'</td><td>'+count+'</td></tr>').join('');
  const info=xml(row.name)+' · '+panels.length+' panels · '+inches(layout.settings.width)+' effective coverage · '+inches(layout.settings.allowance)+' total end allowance. '+orderBasis(state,layout.settings);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+xml(title)+'</title><style>'+css+
    'body{color:#172e3b;margin:0 auto;max-width:740px;padding:20px}.wall-sheet .ws-figure{max-height:290px}main>section{break-before:page;page-break-before:always}p,li{orphans:3;widows:3}.ws-cut,.ws-data>div,svg{break-inside:avoid}.ws-cut{break-inside:auto}@page{margin:0.5in}@media print{body{padding:0;font-size:10pt}.wall-sheet{font-size:10pt}.wall-sheet .ws-figure{max-height:2.55in;print-color-adjust:exact}.ws-cut{font-size:9pt}.wall-sheet h3,.wall-sheet h4{break-after:avoid}}</style></head><body class="wall-sheet"><header><p>Taylor Metal Roof Planner</p><h1>Wall panel cut sheets</h1><h2>'+xml(title)+'</h2><p>'+context+'</p><p>'+info+'</p><p>'+xml(basis)+'</p>'+drawingNotes+'<table><thead><tr><th>Order length in this packet</th><th>Qty</th></tr></thead><tbody>'+groups+'</tbody></table></header><main>'+
    panels.map(p=>'<section><p>'+xml(state.quote?.projectName||'Taylor Metal Roof Planner')+' · wall panel cut sheet</p>'+panelDetails(row,p,layout.settings)+'<p class="ws-note">'+xml(basis)+'</p></section>').join('')+'</main></body></html>';
}
function downloadCutFile(text,type,name) {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export function showWallCutSheets({state,layout,showDialog,wallId,offsetFeet}) {
  showDialog('Wall panel cut sheets','<div id="wallCutSheetView" class="wall-sheet"></div>');
  const box=document.querySelector('#wallCutSheetView');
  if(!box)return;
  const style=document.createElement('style');style.textContent=css;box.append(style);
  if(!layout.rows.length){
    const empty=document.createElement('p');empty.textContent='Add a wall or building section to generate wall cut sheets.';box.append(empty);return;
  }
  function element(tag,text) {const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;}
  function button(label,click) {const b=element('button',label);b.type='button';b.addEventListener('click',click);return b;}
  function control(label,input){const node=element('label',label);node.append(input);return node;}
  const wallSelect=element('select');wallSelect.className='ws-wall';
  layout.rows.forEach((row,index)=>{
    const option=element('option',row.name+' · '+row.count+' panels');option.value=String(index);wallSelect.append(option);
  });
  const status=element('p');status.className='ws-status';status.setAttribute('role','status');
  const orderSummary=element('details'),summaryTitle=element('summary','Order lengths for this wall'),summaryBody=element('div');
  summaryBody.className='ws-wide';orderSummary.append(summaryTitle,summaryBody);
  const navigation=element('div');navigation.className='ws-actions';
  const prev=button('Previous strip',()=>selectPanel(panelIndex-1)),next=button('Next strip',()=>selectPanel(panelIndex+1));
  const strip=element('input');strip.type='number';strip.min='1';strip.step='1';strip.inputMode='numeric';
  function goToStrip() {
    const value=Number(strip.value);
    const index=row.panels.findIndex(panel=>panel.stripNumber===value);
    if(index>=0)selectPanel(index);
    else status.textContent='There is no installed strip '+strip.value+' on this wall. Use Previous strip or Next strip.';
  }
  const go=button('Go',goToStrip);
  strip.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();goToStrip();}});
  navigation.append(prev,control('Strip number',strip),go,next);
  const basisNote=element('p',basis+' '+orderBasis(state,layout.settings));basisNote.className='ws-note';
  const panelContent=element('div');
  const exports=element('div'),batch=element('select');exports.className='ws-actions';
  const printOne=button('Print this strip',()=>printOrSave([row.panels[panelIndex]],true));
  const printBatch=button('Print packet',()=>printOrSave(packet(),true));
  const saveBatch=button('Download printable packet',()=>printOrSave(packet(),false));
  const csvButton=button('Download wall CSV',()=>downloadCsv(row.panels));
  const packetCsv=button('Download packet CSV',()=>downloadCsv(packet()));
  exports.append(printOne,control('Wall print packet',batch),printBatch,saveBatch,csvButton,packetCsv);
  box.append(control('Wall',wallSelect),status,orderSummary,navigation,basisNote,panelContent,exports);
  let row,panelIndex=0;
  const safeName=value=>String(value).normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70).replace(/^-+|-+$/g,'')||'wall';
  const packet=()=>row.panels.slice(Number(batch.value)*batchSize,(Number(batch.value)+1)*batchSize);
  function currentName(panels){
    return safeName(state.quote?.projectName||'Roof-Planner')+'-'+safeName(row.name)+'-strips-'+panels[0].stripNumber+'-'+panels.at(-1).stripNumber;
  }
  function downloadCsv(panels){
    if(!panels.length)return;
    let lines=0;
    for(const panel of panels){
      lines+=1+panel.profilePoints.length+panel.cutouts.reduce((count,cut)=>count+cut.points.length+1,0);
      if(lines>120000){
        status.textContent='This wall has over 120,000 cut records. Choose a wall print packet and download its CSV.';return;
      }
    }
    downloadCutFile(wallCutsCsv(state,layout,row,panels),'text/csv;charset=utf-8',currentName(panels)+'.csv');
    status.textContent='CSV prepared for '+panels.length+' panels on '+row.name+'.';
  }
  function printOrSave(panels,print) {
    if(!panels.length)return;
    const html=printCutSheets(state,layout,row,panels);
    if(!print){
      downloadCutFile(html,'text/html;charset=utf-8',currentName(panels)+'.html');
      status.textContent='Printable packet downloaded. Open it to print or save a PDF.';return;
    }
    const printWindow=window.open('','_blank');
    if(!printWindow){status.textContent='The print window was blocked. Download the printable packet to print or save a PDF.';return;}
    printWindow.opener=null;
    printWindow.document.open();printWindow.document.write(html);printWindow.document.close();printWindow.focus();
    printWindow.setTimeout(()=>printWindow.print(),150);
  }
  function selectPanel(index){
    if(index<0||index>=row.panels.length)return;
    panelIndex=index;
    const current=row.panels[index];strip.value=String(current.stripNumber);
    prev.disabled=index===0;next.disabled=index===row.panels.length-1;
    status.textContent='Installed panel '+(index+1)+' of '+row.panels.length+' · '+row.name+'.';
    panelContent.innerHTML=panelDetails(row,current,layout.settings);
    batch.value=String(Math.floor(index/batchSize));
  }
  function changeWall(index,station){
    row=layout.rows[index];wallSelect.value=String(index);
    summaryBody.replaceChildren();batch.replaceChildren();
    const groups=blankGroups(row.panels);
    const summary=element('p',row.count+' installed panels · '+measure(row.area)+' sq ft net wall material.');summaryBody.append(summary);
    if(groups.length) {
      const table=element('table'),head=table.createTHead().insertRow(),body=table.createTBody();
      for(const name of ['Order blank','Quantity'])head.append(element('th',name));
      for(const [len,count] of groups.slice(0,100)){const tr=body.insertRow();tr.insertCell().textContent=inches(len);tr.insertCell().textContent=String(count);}
      summaryBody.append(table);
      if(groups.length>100)summaryBody.append(element('p','Showing 100 length groups. Download the wall CSV for every length.'));
    }
    for(let start=0;start<row.panels.length;start+=batchSize){
      const panels=row.panels.slice(start,start+batchSize);
      const option=element('option','Strips '+panels[0].stripNumber+'–'+panels.at(-1).stripNumber+' ('+panels.length+')');
      option.value=String(start/batchSize);batch.append(option);
    }
    const hasPanels=Boolean(row.panels.length);
    navigation.hidden=!hasPanels;exports.hidden=!hasPanels;basisNote.hidden=!hasPanels;panelContent.replaceChildren();
    if(!hasPanels){status.textContent='This wall has no installed strips after its openings are deducted.';return;}
    if(!Number.isFinite(station)){selectPanel(0);return;}
    const hit=row.panels.findIndex((p,i)=>station>=p.startFeet-1e-6 && (station<p.endFeet || i===row.panels.length-1&&station<=p.endFeet+1e-6));
    if(hit>=0){selectPanel(hit);return;}
    const nearest=row.panels.reduce((best,p,i)=>Math.min(Math.abs(p.startFeet-station),Math.abs(p.endFeet-station))<best.distance?{index:i,distance:Math.min(Math.abs(p.startFeet-station),Math.abs(p.endFeet-station))}:best,{index:0,distance:Infinity});
    selectPanel(nearest.index);
    status.textContent='There is no installed strip at that point. Showing the nearest installed strip on this wall.';
  }
  wallSelect.addEventListener('change',()=>changeWall(Number(wallSelect.value)));
  const requested=wallId?layout.rows.findIndex(candidate=>candidate.id===wallId):0;
  if(requested===-1){changeWall(0);status.textContent='The selected wall no longer exists. Choose another wall.';}
  else changeWall(requested,offsetFeet);
}
