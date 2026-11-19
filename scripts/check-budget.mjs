import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../wallet');
const manifest=JSON.parse(await readFile(root+'/.svelte-kit/output/client/.vite/manifest.json'));
const seen=new Set();
const walk=key=>{if(seen.has(key))return;seen.add(key);for(const i of manifest[key]?.imports||[])walk(i);};
for(const [key,item] of Object.entries(manifest))if(/\/entry\/(app|start|payload)\./.test(item.file)||/\/nodes\/(0|2)\./.test(item.file))walk(key);
let first=0,total=0;
for(const key of seen)if(manifest[key].file.endsWith('.js'))first+=gzipSync(await readFile(root+'/build/'+manifest[key].file)).length;
async function size(path){for(const n of await readdir(path)){const p=path+'/'+n;if((await stat(p)).isDirectory())await size(p);else total+=gzipSync(await readFile(p)).length;}}
await size(root+'/build');
console.log(JSON.stringify({initial_js_gzip_bytes:first,all_static_gzip_bytes:total,budgets:{initial_js:150*1024,all_static:350*1024}}));
if(first>150*1024||total>350*1024)process.exitCode=1;
