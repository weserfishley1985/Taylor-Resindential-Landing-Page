// Parse explicit drawing annotations. All results are candidates for review.
// Linear quantities are feet. Unlabeled measurements stay attached to the source sheet.
const integer = String.raw`\d+(?:\.\d+)?`;
const inches = String.raw`(?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?`;
const ft = String.raw`(?:'|ft\.?(?!\w)|feet\b|foot\b)`;
const inch = String.raw`(?:"|in\.?(?!\w)|inch(?:es)?\b)`;
const dim = `(?:${integer}\\s*${ft}(?:\\s*-?\\s*(?:${inches})\\s*${inch})?|(?:${inches})\\s*${inch})`;
const dims = new RegExp(`(${dim})\\s*(?:w(?:ide)?\\b)?\\s*[x×]\\s*(${dim})(?:\\s*h(?:igh)?\\b)?`,'i');
const sideName = '(north|south|east|west)';
const elevations = new RegExp('\\b'+sideName+'\\s+(?:exterior\\s+)?elevation\\b|\\belevation\\s*[-:]?\\s*'+sideName+'\\b','ig');
const sides = ['North','South','East','West'];

function normalize(text) {
  return String(text).replace(/[’‘′]/g,"'").replace(/[“”″]/g,'"').replace(/[–—−]/g,'-')
    .replace(/[¼½¾⅛⅜⅝⅞]/g,c=>({'¼':' 1/4','½':' 1/2','¾':' 3/4','⅛':' 1/8','⅜':' 3/8','⅝':' 5/8','⅞':' 7/8'}[c]))
    .replace(/\s+/g,' ').trim();
}

export function dimensionFeet(input) {
  const s=normalize(input);
  const feetPart=new RegExp('^('+integer+')\\s*'+ft+'\\s*-?\\s*','i').exec(s);
  const rest=feetPart?s.slice(feetPart[0].length):s;
  const wholeFeet=Number(feetPart?.[1]||0);
  if (!rest) return feetPart?wholeFeet:null;
  const inPart=new RegExp('^('+inches+')\\s*'+inch+'$','i').exec(rest);
  if (!inPart) return null;
  const mixed=/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(inPart[1]);
  const value=mixed?Number(mixed[1]||0)+Number(mixed[2])/Number(mixed[3]):Number(inPart[1]);
  if (!Number.isFinite(value) || (feetPart && value>=12)) return null;
  return wholeFeet+value/12;
}

function labeledDimension(label,text) {
  const match=new RegExp('\\b(?:'+label+')\\s*[:=]?\\s*('+dim+')(?![\\w\\d]|\\s*[-]?\\s*\\d)','i').exec(text);
  return match?dimensionFeet(match[1]):null;
}

function direction(word) {
  return sides.find(side=>side.toLowerCase()===word?.toLowerCase())||'';
}

function openingKind(text) {
  if (/\b(?:garage|overhead|roll[- ]?up|sectional)\s+door\b|\bO\.?H\.?\s*D(?:OOR)?\b|\b(?:GD|OHD)[- .]?\d+\b/i.test(text)) return 'Garage door';
  if (/\bwindow\b|\bW[- .]?\d+[A-Z]?\b/i.test(text)) return 'Window';
  if (/\bdoor\b|\bD[- .]?\d+[A-Z]?\b/i.test(text)) return 'Door';
  return '';
}

function openingRow(text,source,sheetSide) {
  const kind=openingKind(text);
  if (!kind || /\b(?:schedule|typical detail|installation|manufacturer)\b/i.test(text)) return null;
  const pair=dims.exec(text);
  const tag=/\b((?:OHD|GD|D|W)[- .]?\d+[A-Z]?)\b/i.exec(text)?.[1]?.replace(/[- .]/g,'').toUpperCase()||'';
  if (!pair && !tag && !/\b(?:sill|offset|width|height)\b/i.test(text)) return null;
  const sideMatch = new RegExp('\\b'+sideName+'\\s+(?:wall|elevation)\\b|\\bwall\\s*[:=]?\\s*'+sideName+'\\b','i').exec(text);
  const side=direction(sideMatch?.[1]||sideMatch?.[2])||sheetSide;
  const width=pair?dimensionFeet(pair[1]):labeledDimension('width',text);
  const height=pair?dimensionFeet(pair[2]):labeledDimension('height',text);
  // Grid-line and centerline dimensions need an origin and half-width correction.
  const offset=/\b(?:center(?:line)?|centre|grid|axis)\b/i.test(text)?null:
    labeledDimension('offset(?:\\s+from\\s+wall\\s+start)?|from\\s+wall\\s+start',text);
  const sill=labeledDimension('sill(?:\\s+height)?|threshold(?:\\s+height)?',text);
  return {tag,kind,side,width:width??'',height:height??'',offset:offset??'',sill:sill??'',source};
}

function annotationNotes(page,notes){
  const marks=page.annotations||[];
  const labels=[...new Set(marks.map(mark=>mark.text).filter(Boolean))];
  for (const label of labels.slice(0,8)) notes.push('Sheet '+page.number+' markup for review · '+label.slice(0,150));
  if (labels.length>8) notes.push('Sheet '+page.number+' contains additional annotations. Review them in the sheet preview.');
  if (marks.some(mark=>!mark.text)) notes.push('Sheet '+page.number+' includes markup without text. Check the marked locations before adding openings.');
}

function preparedLines(lines){
  // Keep a label that is stacked above its value together only in the same column.
  const labels=/^(?:(?:(?:overall\s+)?building|overall)\s+(?:width|depth)|(?:wall|eave)\s+(?:height|ht\.?)|roof\s+(?:pitch|slope|form|type)|ridge(?:\s+direction)?|downslope(?:\s+direction)?)\s*[:=]?$/i;
  const result=[];
  for (let index=0;index<lines.length;index++){
    const line=lines[index];
    if (!labels.test(line.text) || !Number.isFinite(line.x) || !Number.isFinite(line.y)) {result.push(line);continue;}
    const height=Math.max(1,line.height||8);
    const near=[];
    for (let i=index+1;i<Math.min(lines.length,index+65);i++) {
      const other=lines[i];
      if (other.y-line.y>2.5*height) break;
      if (i===index+64) { near.push(null,null); break; }
      if (other.y>line.y && Math.abs(other.x-line.x)<1.25*height && other.text.length<40) near.push(other);
    }
    result.push(near.length===1?{...line,text:line.text+' '+near[0].text}:line);
  }
  return result;
}

export function recognizePlan(pages) {
  const candidates=new Map();
  const notes=[],openingRows=[],elevationLabels=[];
  const descriptors={width:'Building width',depth:'Building depth',wallHeight:'Wall height',pitch:'Pitch',ridge:'Ridge direction',roofType:'Roof form',downslope:'Downslope direction'};
  function offer(key,value,source) {
    if (value===null || value===undefined || value==='') return;
    if (!candidates.has(key)) candidates.set(key,new Map());
    const possibilities=candidates.get(key);
    if (!possibilities.has(value)) possibilities.set(value,source);
  }
  for (const page of pages) {
    annotationNotes(page,notes);
    const lines=page.lines.map(line=>({...line,text:normalize(line.text)})).filter(line=>line.text);
    if (!lines.length) { notes.push('Sheet '+page.number+' has no readable text layer. Use the sheet preview to review its dimensions and openings.'); continue; }
    const evidence=text=>'Sheet '+page.number+' · '+text.slice(0,150);
    const sheetElevations=[];
    for (const {text,x,y} of lines) {
      for (const match of text.matchAll(elevations)) {
        const item={page:page.number,side:direction(match[1]||match[2]),x,y,source:evidence(text)};
        elevationLabels.push(item);
        sheetElevations.push(item.side);
      }
    }
    const uniqueSides=new Set(sheetElevations);
    const sheetSide=uniqueSides.size===1 && !lines.some(line=>/\b(?:floor plan|roof plan|schedule)\b/i.test(line.text))?[...uniqueSides][0]:'';
    for (const line of preparedLines(lines)) {
      const text=line.text;
      const src=evidence(text);
      offer('width',labeledDimension('(?:(?:overall\\s+)?building|overall)\\s+width',text),src);
      offer('depth',labeledDimension('(?:(?:overall\\s+)?building|overall)\\s+depth',text),src);
      offer('wallHeight',labeledDimension('(?:eave|wall)\\s+(?:height|ht\\.?)',text),src);
      const pitch=/\b(?:roof\s+(?:pitch|slope)|pitch)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:\/|:|in)\s*12\b/i.exec(text)
        || /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:\/|:|in)\s*12\s+(?:roof\s+)?(?:pitch|slope)\b/i.exec(text);
      if (pitch && Number(pitch[1])<=24) offer('pitch',Number(pitch[1]),src);
      const ridge=/\bridge(?:\s+direction|\s+runs)?\s*[:=]?\s*(east\s*[-/]\s*west|west\s*[-/]\s*east|north\s*[-/]\s*south|south\s*[-/]\s*north|[EW]\s*[-/]\s*[EW]|[NS]\s*[-/]\s*[NS])\b/i.exec(text);
      if (ridge && !/^([NEWS])\s*[-/]\s*\1$/i.test(ridge[1])) offer('ridge',/^[EW]/i.test(ridge[1])?'EW':'NS',src);
      const form=/\b(?:roof\s+(?:type|form)\s*[:=]?\s*(gable|shed|flat)|(gable|shed|flat)\s+roof)\b/i.exec(text);
      if (form) offer('roofType',(form[1]||form[2]).toLowerCase(),src);
      const slope=new RegExp('\\b(?:downslope(?:\\s+direction)?|roof\\s+slopes?\\s+to(?:\\s+the)?)\\s*[:=]?\\s*'+sideName+'\\b','i').exec(text);
      if (slope) offer('downslope',direction(slope[1]),src);
      const row=openingRow(text,src,sheetSide);
      if (row) openingRows.push(row);
    }
  }
  const values={},sources={};
  for (const [key,matches] of candidates) {
    if (matches.size===1) { const [value,source]=matches.entries().next().value; values[key]=value; sources[key]=source; }
    else notes.push(descriptors[key]+' has conflicting labels. Review '+[...matches.values()].slice(0,4).join(' / ')+'.');
  }
  // A type tag can describe several installed openings. Reuse its size only
  // when consistent. Reading one schedule row never determines its wall offset.
  const byTag=new Map();
  for (const row of openingRows) {
    if (!row.tag) continue;
    if (!byTag.has(row.tag)) byTag.set(row.tag,[]);
    byTag.get(row.tag).push(row);
  }
  const openings=[];
  function append(row) {
    if (openings.length<200) openings.push(row);
  }
  for (const rows of byTag.values()) {
    const placed=rows.filter(row=>row.side || row.offset!=='');
    const group=placed.length?placed:rows.slice(0,1);
    const agreed={};
    for (const field of ['width','height']) {
      const variants=new Map(rows.filter(row=>row[field]!=='').map(row=>[row[field],row.source]));
      if (variants.size===1) agreed[field]=variants.entries().next().value;
      if (variants.size>1) {
        agreed[field]=null;
        notes.push(rows[0].tag+' has different '+field+' values. Check its schedule and elevation.');
      }
    }
    for (const row of group) {
      const result={...row};
      for (const field of ['width','height']) {
        if (agreed[field]===null) result[field]='';
        if (result[field]==='' && agreed[field]) {
          result[field]=agreed[field][0];
          if (!result.source.includes(agreed[field][1])) result.source+=' / '+agreed[field][1];
        }
      }
      append(result);
    }
  }
  for (const row of openingRows) if (!row.tag) append(row);
  if (openingRows.length>200) notes.push('Review the opening count. The preview accepts up to 200 candidate rows.');
  if (openingRows.length) notes.push('Check the installed count against each sheet. One schedule tag may represent several openings. Offsets run from wall start to the opening jamb.');
  if (elevationLabels.length) notes.push('Elevation views include '+[...new Set(elevationLabels.map(label=>'sheet '+label.page+' '+label.side))].slice(0,20).join(', ')+'.');
  return {values,sources,openings,notes,elevations:elevationLabels};
}
