/** Permissioned local file adapter; a download is not sync. */
import {readSharedManifest} from './shared-workbook.mjs';
const MAX_BYTES=80*1024*1024;
const fail=message=>{throw Error(message);};
async function digest(b){const hash=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function read(handle){const f=await handle.getFile();if(f.size>MAX_BYTES)fail('A célfájl túl nagy. Válassz külön, app által kezelt munkafüzetet.');return new Uint8Array(await f.arrayBuffer());}
const identity=out=>out.bookId+'|'+out.month;
export class SameWorkbookFile {
 constructor({lock,remember=async()=>{},onStatus=()=>{}}={}){this.lock=lock??(async(_key,fn)=>fn());this.remember=remember;this.onStatus=onStatus;this.handle=null;this.hash=null;this.target=null;this.revision=-1;this.paused=false;this.chain=Promise.resolve();this.writeCount=0;this.epoch=0;}
 get connected(){return !!this.handle&&!this.paused;}
 state(kind,text){this.onStatus({kind,text,revision:this.revision,writeCount:this.writeCount,name:this.handle?.name||null});}
 disconnect(){this.epoch++;this.handle=null;this.hash=null;this.target=null;this.revision=-1;this.paused=false;this.state('unlinked','Nincs csatlakoztatott Excel-fájl.');}
 async attach(handle,out){
  const ticket=this.epoch,bytes=await read(handle);if(ticket!==this.epoch)return {status:'superseded'};const m=bytes.length?readSharedManifest(bytes):null;
  if(bytes.length&&(!m||m.bookId!==out.bookId||m.month!==out.month))fail('Ezt a meglévő fájlt nem írjuk felül. Új, külön munkafüzetet válassz, vagy ennek a bemutatónak a saját, azonos havi fájlját.');
  if(m&&m.revision>out.revision)fail('A fájl újabb az app adatainál. Nem írjuk felül régebbi bejegyzésekkel.');
  const hash=await digest(bytes);if(ticket!==this.epoch)return {status:'superseded'};this.epoch++;this.handle=handle;this.target=identity(out);this.hash=hash;this.revision=m?.revision??-1;this.paused=false;return this.write(out);
 }
 async restore(saved,out){if(!saved?.handle||saved.target!==identity(out))return false;this.epoch++;this.handle=saved.handle;this.hash=saved.hash;this.target=saved.target;this.revision=saved.revision;this.paused=true;this.state('permission','Korábbi célfájl megtalálva. A folytatás gombbal ellenőrizheted és újraengedélyezheted.');return true;}
 async resume(out){if(!this.handle||this.target!==identity(out))fail('Ehhez a hónaphoz előbb csatlakoztass fájlt.');const ticket=this.epoch,handle=this.handle;if(handle.requestPermission&&await handle.requestPermission({mode:'readwrite'})!=='granted')fail('Nem kaptunk engedélyt. A munkanapok az appban megmaradtak.');if(ticket!==this.epoch)return {status:'superseded'};this.paused=false;return this.write(out);}
 write(out){
  const ticket=this.epoch,handle=this.handle,target=this.target;
  const run=async()=>{
   if(!handle||this.paused||ticket!==this.epoch)return {status:'unlinked'};
   if(target!==identity(out))fail('Más hónap Excelét nem írjuk felül.');
   return this.lock('muszaknaplo-file-'+target,async()=>{
    if(ticket!==this.epoch)return {status:'superseded'};
    if(out.revision<this.revision)return {status:'superseded'};
    let stream;
    try{
     const bytes=await read(handle),hash=await digest(bytes);
     if(hash!==this.hash)fail('Az Excel-fájl az appon kívül megváltozott. Az automatikus írás leállt, nehogy elvesszen a kézi módosítás.');
     if(out.revision===this.revision){if(await digest(out.bytes)!==this.hash)fail('Azonos verzióhoz eltérő Excel tartozik. A meglévő fájlt nem írjuk felül.');this.state('saved','Az Excel már naprakész.');return {status:'unchanged'};}
     this.state('writing','Ugyanannak az Excel-fájlnak a frissítése…');
     stream=await handle.createWritable({keepExistingData:false,mode:'exclusive'});
     if(ticket!==this.epoch){await stream.abort();return {status:'superseded'};}
     await stream.write(out.bytes);
     if(ticket!==this.epoch){await stream.abort();stream=null;return {status:'superseded'};}
     await stream.close();stream=null;
     const savedHash=await digest(out.bytes);if(ticket!==this.epoch)return {status:'superseded'};this.hash=savedHash;this.revision=out.revision;this.writeCount++;
     const saved={handle,target,hash:this.hash,revision:this.revision};
     let remembered=true;try{await this.remember(saved);}catch{remembered=false;}
     if(ticket===this.epoch)this.state('saved',`Ugyanaz az Excel frissítve · ${out.revision}. verzió${remembered?'':' · újranyitáskor a célfájlt újra ki kell választani'}`);
     return {status:'saved',revision:this.revision};
    }catch(error){if(stream)await stream.abort().catch(()=>{});if(ticket===this.epoch){this.paused=true;this.state('error',error.message||'A fájl mentése nem sikerült; a napadatok megmaradtak.');}throw error;}
   });
  };
  const result=this.chain.then(run,run);this.chain=result.catch(()=>{});return result;
 }
}
export class LatestWorkbook {
 constructor(build,onReady,onError){this.build=build;this.onReady=onReady;this.onError=onError;this.pending=null;this.epoch=0;this.running=false;this.waiters=[];}
 request(snapshot){this.pending={snapshot:structuredClone(snapshot),epoch:++this.epoch};this.drain();}
 async drain(){if(this.running)return;this.running=true;try{while(this.pending){const job=this.pending;this.pending=null;try{const out=await this.build(job.snapshot);if(job.epoch===this.epoch)await this.onReady(out);}catch(e){if(job.epoch===this.epoch)this.onError(e);}}}finally{this.running=false;this.waiters.splice(0).forEach(r=>r());}}
 idle(){return this.running||this.pending?new Promise(resolve=>this.waiters.push(resolve)):Promise.resolve();}
}
export function fileHandleStore(dbName='muszaknaplo.shared.file-handles.v1'){
 const open=()=>new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(Error('Nincs IndexedDB.'));return;}const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return {
  async get(key){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readonly'),r=tx.objectStore('handles').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}},
  async put(key,value){const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
 };
}
