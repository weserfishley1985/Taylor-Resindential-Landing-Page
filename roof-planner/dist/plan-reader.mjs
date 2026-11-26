// PDF.js is loaded only when a user opens a plan. The PDF is supplied as local bytes.
const readerBase = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.624/';
const byteLimit = 64 * 1024 * 1024;
const pageLimit = 100;
const itemLimit = 150000;
const textLimit = 3000000;

async function pdfLibrary() {
  try {
    const pdf = await import(readerBase + 'pdf.min.mjs');
    pdf.GlobalWorkerOptions.workerSrc = readerBase + 'pdf.worker.min.mjs';
    return pdf;
  } catch {
    throw new Error('The PDF reader could not load. Check your internet connection and try again in a current browser.');
  }
}

// Coordinates are in sheet points after page rotation, measured from the top left.
// Only join text runs that actually touch the same local row on the drawing.
async function sheetText(page, viewport, budget) {
  const reader = page.streamTextContent().getReader();
  const lines = [];
  let current = null;
  let finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { finished = true; break; }
      for (const item of value.items) {
        if (++budget.items > itemLimit) throw new Error('This plan set has too many text objects. Export the building and elevation sheets as a smaller PDF.');
        if (typeof item.str !== 'string') continue;
        budget.characters += item.str.length;
        if (budget.characters > textLimit) throw new Error('There is too much text in this plan set. Select fewer sheets and try again.');
        const str = item.str.trim();
        if (!str) { if (item.hasEOL) current = null; continue; }
        const [a,b,,,tx,ty] = item.transform;
        const [x,y] = viewport.convertToViewportPoint(tx,ty);
        const [endX,endY] = viewport.convertToViewportPoint(tx+a,ty+b);
        const height = Math.max(1, Math.hypot(endX-x,endY-y));
        const horizontal = endX>x && Math.abs(endY-y)<height*0.12;
        const width = Math.max(0, item.width * viewport.scale * page.userUnit);
        const gap = current ? x-current.right : 0;
        if (current && horizontal && Math.abs(current.y-y)<=height*0.3 &&
            gap>=-height*0.3 && gap<=height*2 && current.text.length+str.length<2048) {
          const separator = gap < height*0.12 ? '' : ' ';
          current.text += separator + str;
          current.right = x+width;
        } else {
          current = { text:str, x, y, right:x+width, height };
          lines.push(current);
        }
        if (item.hasEOL || !horizontal) current = null;
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  return lines.sort((a,b)=>a.y-b.y || a.x-b.x);
}

function sheetMarks(raw, viewport, budget) {
  const marks=[];
  const relevant=new Set(['Text','FreeText','Ink','Square','Circle','Polygon','PolyLine','Line','Stamp','Highlight','Caret','StrikeOut','Underline','Squiggly']);
  for (const mark of raw) {
    if (!relevant.has(mark.subtype) || !Array.isArray(mark.rect) || mark.rect.length!==4 || !mark.rect.every(Number.isFinite)) continue;
    if (++budget.marks>2500) throw new Error('This plan set has too many annotations. Export its relevant sheets as a smaller PDF.');
    const rect=viewport.convertToViewportRectangle(mark.rect);
    const [x1,y1,x2,y2]=rect;
    const note=mark.contentsObj?.str || mark.contents || '';
    const text=typeof note==='string'?note.trim().slice(0,500):'';
    marks.push({type:mark.subtype,text,x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)});
  }
  return marks;
}

export async function readPlanPdf(file, { onProgress, signal } = {}) {
  if (!file || !file.size || file.size > byteLimit) throw new Error('Select a PDF between 1 byte and 64 MB. Large sets can be split by sheet.');
  const header = await file.slice(0,1024).text();
  if (!header.includes('%PDF-')) throw new Error('This file does not contain a PDF header. Export the original drawing as a PDF.');
  signal?.throwIfAborted();
  const pdfjs = await pdfLibrary();
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = pdfjs.getDocument({
    data, isEvalSupported:false, enableXfa:false, maxImageSize:32000000,
    canvasMaxAreaInBytes:64000000, stopAtErrors:true, useSystemFonts:true,
    standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/standard_fonts/',
    cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/cmaps/', cMapPacked:true,
    wasmUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/wasm/'
  });
  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    signal?.removeEventListener('abort',destroy);
    return task.destroy();
  }
  signal?.addEventListener('abort',destroy,{once:true});
  try {
    const pdf = await task.promise;
    if (pdf.numPages>pageLimit) throw new Error('Select up to 100 sheets per import. Export the relevant floor, roof and elevation sheets together.');
    const pages = [];
    const budget = {items:0, characters:0, marks:0};
    for (let number=1; number<=pdf.numPages; number++) {
      signal?.throwIfAborted();
      onProgress?.(number,pdf.numPages);
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({scale:1});
      const lines = await sheetText(page,viewport,budget);
      const annotations = sheetMarks(await page.getAnnotations({intent:'display'}),viewport,budget);
      pages.push({number,width:viewport.width,height:viewport.height,lines,annotations});
      page.cleanup();
    }
    async function renderPage(number,canvas,{markup=true}={}) {
      if (destroyed) throw new Error('Reopen the PDF to view its sheets.');
      if (!Number.isInteger(number) || number<1 || number>pages.length) throw new Error('Choose a sheet in this PDF.');
      const page = await pdf.getPage(number);
      const base = page.getViewport({scale:1});
      const scale = Math.min(3,2200/Math.max(base.width,base.height));
      const viewport = page.getViewport({scale});
      canvas.width = Math.max(1,Math.ceil(viewport.width));
      canvas.height = Math.max(1,Math.ceil(viewport.height));
      const annotationMode=markup?pdfjs.AnnotationMode.ENABLE:pdfjs.AnnotationMode.DISABLE;
      await page.render({canvas,viewport,annotationMode,background:'#ffffff'}).promise;
      return {scale,width:canvas.width,height:canvas.height};
    }
    return {pages,renderPage,destroy};
  } catch (error) {
    await destroy();
    if (error?.name==='PasswordException') throw new Error('This drawing is password protected. Import an unlocked copy.');
    throw error;
  }
}
