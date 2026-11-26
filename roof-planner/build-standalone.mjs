// Rebuild the single-file customer app from the editable source using Node 22.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

const root=new URL('./',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const escapeScript=text=>text.replace(/<\/script/gi,'<\\/script');
const script=text=>'<script>\n'+escapeScript(text)+'\n</script>';

function moduleFactory(file,text) {
  const name=file.slice(0,-4);
  const exports=Array.from(text.matchAll(/\bexport (?:async )?(?:function|class|const|let)\s+([\w$]+)/g),match=>match[1]);
  if(name==='geometry')exports.push('FT');
  const body=text
    .replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)\.mjs['"];?/g,
      (_,bindings,dependency)=>'const {'+bindings+'}=use('+JSON.stringify(dependency)+');')
    .replace("import * as THREE from './vendor/three.module.js';",'const THREE=threeLibrary;')
    .replace(/import\('\.\/roof3d\.mjs'\)/g,'getWebGLViewer()')
    .replace(/import\('\.\/roof3d-fallback\.mjs'\)/g,"Promise.resolve(use('roof3d-fallback'))")
    .replace(/\bexport (?=(async\s+)?(?:function|class|const|let)\b)/g,'');
  return 'factories['+JSON.stringify(name)+']=function(){\n'+body+'\nreturn {'+exports+'};\n};';
}

const files=(await readdir(new URL('dist/',root))).filter(path=>path.endsWith('.mjs')).sort();
const factories=await Promise.all(files.map(async name=>moduleFactory(name,await read('dist/'+name))));
const loader="'use strict';\nconst factories=Object.create(null), cache=Object.create(null);\nfunction use(id){if(!cache[id])cache[id]=factories[id]();return cache[id];}\nlet threeLibrary=null;\nasync function getWebGLViewer(){\n if(!threeLibrary){\n  const source=Uint8Array.from(atob(document.getElementById('three-source').textContent.trim()),c=>c.charCodeAt(0));\n  const js=await new Response(new Blob([source]).stream().pipeThrough(new DecompressionStream('gzip'))).text();\n  const url=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));\n  try{threeLibrary=await import(url);}finally{URL.revokeObjectURL(url);}\n }\n return use('roof3d');\n}\n";
const download="const originalPreview='<!doctype html>\\n'+document.documentElement.outerHTML;\ndocument.getElementById('savePreview').onclick=()=>{\n const url=URL.createObjectURL(new Blob([originalPreview],{type:'text/html'}));\n const a=document.createElement('a');a.href=url;a.download='Taylor-Metal-Roof-Planner.html';a.click();\n setTimeout(()=>URL.revokeObjectURL(url),10000);\n};\n";
const onError="\n}catch(error){document.getElementById('preview-error').textContent='Could not start the preview. Download the test app and open it in a current browser. '+error.message;}\n";
const app=download+'try{\n'+loader+factories.join('\n')+"\nuse('app');"+onError;
new Function(app);
const three=gzipSync(await read('dist/vendor/three.module.js'),{level:9}).toString('base64');
const scripts=script(await read('dist/vendor/leaflet.js'))+
  '\n<script type="application/octet-stream" id="three-source">'+three+'</script>\n'+script(app);
const css=await read('dist/vendor/leaflet.css')+'\n'+await read('dist/app.css')+'\n'+".preview-files{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 12px;background:#0d2234;color:#ceeaf5}.preview-files button{padding:6px 10px}.preview-files .note{font-size:12px}#preview-error{margin:0;color:#ffcba8}";
const template=await read('dist/index.html');
const poster=await read('assets/workshop-first-frame.svg');
const output=template.replace("<link rel=\"stylesheet\" href=\"vendor/leaflet.css\"><link rel=\"stylesheet\" href=\"app.css\">",()=>'<style>'+css+'</style>')
  .replace('<header>',()=>"<div class=\"preview-files\"><button id=\"savePreview\" type=\"button\">Download planner</button><span id=\"preview-error\" role=\"alert\"></span></div>"+'<header>')
  .replace('<div id="three" aria-label="Interactive 3D roof and wall model"></div>',match=>match+poster)
  .replace("<script src=\"vendor/leaflet.js\"></script><script type=\"module\" src=\"app.mjs\"></script>",()=>scripts);
if(!output.includes('id="three-source"')||!output.includes('id="savePreview"'))throw Error('Planner template is missing its entry points.');
await writeFile(new URL('index.html',root),output);
