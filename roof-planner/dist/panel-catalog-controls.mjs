import {PANEL_CATALOG, PANEL_FINISHES, getPanelProfile, panChoices} from './panel-catalog.mjs';
import {panelSection} from './panel-surfaces.mjs';

const inches=n=>n.toLocaleString('en-US',{maximumFractionDigits:3})+'″';
const feet=n=>{
 const total=Math.round(n*12);
 return Math.floor(total/12)+'′'+(total%12?' '+total%12+'″':'');
};
const option=(value,text)=>new Option(text,value);
const safeColor=value=>/^#[0-9a-f]{6}$/i.test(value)?value:'#82949e';

function drawSample(canvas, profile, width, color, panStyle) {
 const context=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 if(!context)return;
 context.clearRect(0,0,w,h);
 const section=panelSection(profile,width,panStyle);
 // Show the opposing lock formed by the next installed panel at this sheet's far side.
 if(profile?.pans&&profile.shape==='seam'&&!profile.id.startsWith('smoothwall')){
  const crown=section.findIndex(([,z])=>z===profile.height);
  const end=section.findIndex(([,z],i)=>i>crown&&z===0);
  if(crown>=0&&end>crown)section.push(...section.slice(1,end+1).map(([x,z])=>[width+x,z]));
 }
 canvas.hidden=section.length<2;
 if(canvas.hidden)return;
 const angle=.49,elevation=.53,length=width*.94;
 const ca=Math.cos(angle),sa=Math.sin(angle),ce=Math.cos(elevation),se=Math.sin(elevation);
 const project=(x,y,z)=>[x*ca+y*sa,(x*sa-y*ca)*se-z*ce];
 const bounds=section.flatMap(([x,z])=>[project(x,0,z),project(x,length,z)]);
 const minX=Math.min(...bounds.map(p=>p[0])),maxX=Math.max(...bounds.map(p=>p[0]));
 const minY=Math.min(...bounds.map(p=>p[1])),maxY=Math.max(...bounds.map(p=>p[1]));
 const scale=Math.min((w-36)/(maxX-minX),(h-30)/(maxY-minY));
 const screen=(x,y,z)=>{
  const [a,b]=project(x,y,z);
  return [w/2+(a-(minX+maxX)/2)*scale,h/2+(b-(minY+maxY)/2)*scale];
 };
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 const paint=(coords,fill)=>{
  context.beginPath();
  coords.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));
  context.closePath();context.fillStyle=fill;context.fill();
 };
 paint([screen(0,0,0),screen(width,0,0),screen(width,length,0),screen(0,length,0)],color);
 for(let i=1;i<section.length;i++){
  const [x0,z0]=section[i-1],[x1,z1]=section[i],dx=x1-x0,dz=z1-z0;
  const magnitude=Math.hypot(dx,dz);
  if(!magnitude)continue;
  const nx=-dz/magnitude,nz=dx/magnitude;
  const diffuse=Math.max(0,-nx*.78+nz*.61);
  const glint=Math.pow(Math.max(0,-nx*.32+nz*.94),14);
  const shade=rgb.map(channel=>Math.min(255,Math.round(channel*(.56+.56*diffuse)+16*glint)));
  paint([screen(x0,0,z0),screen(x1,0,z1),screen(x1,length,z1),screen(x0,length,z0)],'rgb('+shade.join(',')+')');
 }
 context.beginPath();
 for(const [i,[x,z]] of section.entries()){
  const [a,b]=screen(x,0,z);
  if(i)context.lineTo(a,b);else context.moveTo(a,b);
 }
 context.strokeStyle='rgba(229,234,232,.67)';context.lineWidth=1.35;context.stroke();
}

export function setupPanelCatalog({host,surface,onApply,getCurrent}) {
 const panel=document.createElement('details');
 panel.className='catalog-panel';
 panel.innerHTML="<summary>Taylor Metal profiles &amp; finishes</summary><label>Find a profile<input type=\"search\" placeholder=\"Search profile or series\"></label><label>Panel profile<select class=\"catalog-profile\"></select></label><label>Coverage width<select class=\"catalog-width\"></select></label><label class=\"catalog-pan-row\" hidden>Pan style<select class=\"catalog-pan\"></select></label><label>Preview finish<select class=\"catalog-finish\"></select></label><label class=\"catalog-custom\">Custom preview color<input type=\"color\"></label><figure class=\"catalog-modeled\" hidden><canvas width=\"640\" height=\"275\" class=\"catalog-sample\" role=\"img\" aria-label=\"Installed panel in the selected finish\"></canvas><figcaption class=\"catalog-caption\" aria-live=\"polite\"></figcaption></figure><button class=\"primary full catalog-apply\" type=\"button\">Apply &amp; view in 3D</button><figure class=\"catalog-reference\" hidden><a class=\"catalog-reference-link\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Open the Taylor Metal product page\"><span class=\"catalog-image-wrap\"></span></a><figcaption>Taylor Metal catalog photo · factory example</figcaption></figure><p class=\"catalog-spec\"></p><a class=\"catalog-drawing\" target=\"_blank\" rel=\"noopener noreferrer\">Taylor Metal product &amp; drawings</a><p class=\"source\">Screen colors are approximate. Verify the finish and availability with Taylor Metal.</p><a href=\"https://taylormetal.com/colors-and-finishes/\" target=\"_blank\" rel=\"noopener noreferrer\">Taylor Metal color charts</a>";
 const heading=host.querySelector('h2');
 if(heading)heading.after(panel);else host.prepend(panel);
 const find=s=>panel.querySelector(s),search=find('input[type=search]'),profiles=find('.catalog-profile'),widths=find('.catalog-width'),finishes=find('.catalog-finish'),custom=find('input[type=color]');
 const sample=find('canvas'),spec=find('.catalog-spec'),source=find('.catalog-drawing'),apply=find('.catalog-apply');
 finishes.append(option('custom','Custom preview color'));
 const pans=find('.catalog-pan'),reference=find('.catalog-reference'),imageWrap=find('.catalog-image-wrap');
 let shownImage='';
 function showReference(profile){
  const path=profile?.image||'';
  if(path)find('.catalog-reference-link').href=profile.url;
  if(shownImage===path)return;
  shownImage=path;imageWrap.replaceChildren();reference.hidden=true;
  if(!path)return;
  const img=document.createElement('img');img.alt=profile.name+' from Taylor Metal';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  find('.catalog-reference-link').href=profile.url;
  img.onload=()=>{if(shownImage===path)reference.hidden=false;};
  img.onerror=()=>{if(shownImage===path)reference.hidden=true;};
  // Keep the reference box in layout so lazy images can load when the catalog opens.
  reference.hidden=false;imageWrap.append(img);
  img.src='https://taylormetal.com/wp-content/'+path;
 }
 function showPans(preferred){
  const profile=getPanelProfile(profiles.value,surface);
  const choices=panChoices(profile,Number(widths.value));
  pans.replaceChildren(...choices.map(p=>option(p.id,p.label)));
  if(choices.some(p=>p.id===preferred))pans.value=preferred;
  find('.catalog-pan-row').hidden=!choices.length;
 }
 const coatingOptions=new Map();
 for(const [coating,name,color] of PANEL_FINISHES){
  if(!coatingOptions.has(coating)){
   const group=document.createElement('optgroup');group.label=coating;coatingOptions.set(coating,group);finishes.append(group);
  }
  const chip=option(coating+' / '+name,name);chip.dataset.color=color;coatingOptions.get(coating).append(chip);
 }
 const available=PANEL_CATALOG.filter(p=>p.uses.includes(surface));
 function list(selected=''){
  profiles.replaceChildren(option('','Custom / existing settings'));
  const filter=search.value.toLowerCase().trim();
  const groups=new Map();
  for(const p of available){
   if(p.id!==selected && !`${p.name} ${p.group}`.toLowerCase().includes(filter))continue;
   if(!groups.has(p.group)){
    const group=document.createElement('optgroup');group.label=p.group;groups.set(p.group,group);profiles.append(group);
   }
   groups.get(p.group).append(option(p.id,p.name+(p.shape?'':' · reference')));
  }
  profiles.value=selected;
 }
 function currentColor(){return finishes.value==='custom'?custom.value:finishes.selectedOptions[0].dataset.color;}
 function showOptions() {
  const {profileId,width,panStyle}=getCurrent(), profile=getPanelProfile(profiles.value,surface);
  widths.replaceChildren();
  const options=profile?.widths?.length?profile.widths:[width];
  for(const n of options)widths.append(option(String(n),inches(n)));
  if(profileId===profile?.id && options.includes(width))widths.value=String(width);
  widths.disabled=!profile?.widths?.length;
  showPans(profileId===profile?.id?panStyle:null);
  showReference(profile);
  source.hidden=!profile;
  if(profile)source.href=profile.url;
  const details=[];
  if(profile?.widths?.length)details.push((profile.nominal?'Nominal coverage ':'Coverage ')+profile.widths.map(inches).join(' / '));
  if(profile?.height)details.push('Rib '+inches(profile.height));
  if(profile?.maxLength)details.push('Published standard max '+feet(profile.maxLength));
  if(profile?.stretchOut)details.push('Published stretch-out '+profile.stretchOut);
  if(profile && !profile.stretchOut)details.push('Stretch-out requires factory confirmation');
  if(profile && !profile.maxLength)details.push('Confirm maximum length with Taylor Metal');
  if(profile?.note)details.push(profile.note);
  if(profile && !profile.shape)details.push('Reference only. Open Taylor Metal’s drawing for this configuration.');
  else if(profile)details.push('Bend shapes and shallow relief are approximate. See the product drawing for fabrication details.');
  spec.textContent=details.join(' · ');
  apply.disabled=Boolean(profile&&!profile.shape);
  repaint();
 }
 function repaint(){
  find('.catalog-custom').hidden=finishes.value!=='custom';
  const profile=getPanelProfile(profiles.value,surface),width=Number(widths.value);
  drawSample(sample,profile,width,safeColor(currentColor()),pans.value);
  find('.catalog-modeled').hidden=!profile?.shape;
  const style=pans.selectedOptions[0]?.textContent;
  const finish=finishes.value==='custom'?'Custom color':finishes.selectedOptions[0].textContent;
  find('.catalog-caption').textContent=[profile?.name,style,inches(width),finish].filter(Boolean).join(' · ');
  sample.setAttribute('aria-label','Installed panel, '+find('.catalog-caption').textContent);
 }
 function sync() {
  const state=getCurrent();search.value='';list(state.profileId||'');
  custom.value=safeColor(state.color);
  finishes.value=[...finishes.options].some(option=>option.value===state.colorName&&option.dataset.color===state.color)?state.colorName:'custom';
  showOptions();
 }
 search.oninput=()=>list(profiles.value);
 profiles.onchange=showOptions;
 widths.onchange=()=>{showPans(pans.value);repaint();};
 pans.onchange=repaint;
 finishes.onchange=repaint;
 custom.oninput=repaint;
 apply.onclick=()=>{
  const profile=getPanelProfile(profiles.value,surface);
  if(profile&&!profile.shape)return;
  const color=currentColor(),colorName=finishes.value==='custom'?'Custom color':finishes.value;
  onApply({profile,width:Number(widths.value),color,colorName,panStyle:pans.value||undefined});
 };
 sync();
 return {sync};
}
