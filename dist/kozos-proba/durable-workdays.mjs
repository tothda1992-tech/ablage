/** Persist BEFORE send. One atomic localStorage value per authenticated project/user.
 * The UI must hold a Web Lock while this store is writable. No tokens/passwords.
 * Uncertain requests retain the exact UUID/body across reload and reauthentication.
 */
import {validDate,validatePayload,calculate,emptyPayload,normSnapshot} from './team-core.mjs';
const copy=x=>structuredClone(x);
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]))):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<2147483647;
export function actorIdentity(a){
 if(!a||!uuid(a.id)||!uuid(a.workspace_id)||a.role!=='employee'||a.active!==true)throw Error('Aktív dolgozói bejelentkezés szükséges.');
 return {id:a.id,workspace_id:a.workspace_id};
}
export function durableKey(project,actor){const a=actorIdentity(actor);if(!/^[a-z0-9-]{3,80}$/.test(project))throw Error('Érvénytelen projekt.');return `muszaknaplo.outbox.v1.${project}.${a.workspace_id}.${a.id}`;}
function serverRow(r,a,date){
 if(!r||r.employee_id!==a.id||r.workspace_id!==a.workspace_id||!validDate(r.work_date)||date&&r.work_date!==date||!integer(r.version)||r.version<1||!['draft','submitted','approved'].includes(r.status))throw Error('Idegen vagy hibás központi nap.');
 calculate(r.payload,r.norms);
 return {employee_id:r.employee_id,workspace_id:r.workspace_id,work_date:r.work_date,version:r.version,status:r.status,payload:copy(r.payload),norms:copy(r.norms)};
}
const needsDraft=d=>!d.server||!same(d.desired,d.server.payload);
const hasWork=d=>!!d.flight||d.wantSubmit||needsDraft(d);
function freshDay(){return {server:null,desired:emptyPayload(),localVersion:0,wantSubmit:false,flight:null,hold:null,attempts:0,nextTry:0};}
function readStore(raw,actor){
 if(raw===null)return {schema:1,actor:copy(actor),revision:0,days:{}};
 if(raw.length>6*1024*1024)throw Error('Túl nagy helyi mentési sor.');
 const s=JSON.parse(raw);
 if(!s||s.schema!==1||!same(s.actor,actor)||!integer(s.revision)||!s.days||typeof s.days!=='object'||Array.isArray(s.days)||Object.keys(s.days).length>1500)throw Error('Sérült helyi mentési sor. Nem írjuk felül.');
 if(Object.keys(s).some(k=>!['schema','actor','revision','days'].includes(k)))throw Error('Ismeretlen mentési mező.');
 for(const [date,d] of Object.entries(s.days)){
  if(!validDate(date)||!d||Object.keys(d).some(k=>!['server','desired','localVersion','wantSubmit','flight','hold','attempts','nextTry'].includes(k))||!integer(d.localVersion)||typeof d.wantSubmit!=='boolean'||!integer(d.attempts)||!Number.isFinite(d.nextTry)||d.nextTry<0)throw Error('Hibás helyi nap.');
  validatePayload(d.desired);if(d.server)d.server=serverRow(d.server,actor,date);
  if(d.hold&&(!['conflict','denied','invalid','auth','protocol'].includes(d.hold.kind)||typeof d.hold.message!=='string'||d.hold.message.length>2000))throw Error('Hibás mentési állapot.');
  if(d.flight){const f=d.flight;if(!uuid(f.id)||!['draft','submit'].includes(f.kind)||f.date!==date||!integer(f.expected)||!same(f.actor,actor))throw Error('Hibás függő kérés.');if(f.kind==='draft')validatePayload(f.payload);}
 }
 return s;
}
export function createDurableWorkdays({storage,project,getActor,canWrite=()=>false,onChange=()=>{},requestId=()=>crypto.randomUUID(),now=Date.now}){
 const actor=actorIdentity(getActor()),key=durableKey(project,getActor());
 let raw=storage.getItem(key),state=readStore(raw,actor),alive=true,pumping=null;
 function assertActor(){if(!alive||!same(actorIdentity(getActor()),actor))throw Error('A munkamenet megváltozott. A helyi sor zárolva.');}
 function write(fn){
  assertActor();if(!canWrite())throw Error('Ebben az ablakban nincs szerkesztési zár. Használd a másik ablakot.');
  if(storage.getItem(key)!==raw)throw Error('Másik ablak módosította a helyi sort. Nyisd újra a naplót.');
  const next=copy(state);fn(next);next.revision++;const encoded=JSON.stringify(next);readStore(encoded,actor);
  storage.setItem(key,encoded);state=next;raw=encoded;try{onChange();}catch{}return next;
 }
 function record(date){assertActor();const d=state.days[date];if(!d)return null;return {employee_id:actor.id,workspace_id:actor.workspace_id,work_date:date,version:d.localVersion||1,payload:copy(d.desired),norms:copy(d.server?.norms??normSnapshot()),status:d.wantSubmit||d.flight?.kind==='submit'?'submitted':d.server?.status??'draft'};}
 function status(date){assertActor();const d=state.days[date];if(!d)return {kind:'empty',text:'Erre a napra még nincs mentés.',pending:false};
  if(d.hold)return {kind:d.hold.kind,text:d.hold.message,pending:true};
  if(hasWork(d))return {kind:'pending',text:d.wantSubmit?'Nap beküldése várakozik – még nincs visszaigazolva.':'A telefonon mentve · központi küldésre vár.',pending:true};
  return {kind:'synced',text:d.server?.status==='approved'?'Központban mentve · jóváhagyva.':d.server?.status==='submitted'?'Központban mentve · beküldve.':'Központban mentve · még nem beküldött nap.',pending:false};
 }
 function editable(date){assertActor();const d=state.days[date];return canWrite()&&(!d||!d.hold&&!d.wantSubmit&&d.flight?.kind!=='submit'&&(!d.server||d.server.status==='draft'));}
 function commit(date,payload,expected){
  if(!validDate(date)||!editable(date))throw Error('Ez a nap most nem szerkeszthető. Ellenőrizd a mentési állapotot.');validatePayload(payload);
  const old=record(date);if(expected!==undefined&&expected!==(old?.version??0))throw Error('Közben megváltozott a nap. Nyisd újra a javítást.');
  write(s=>{const d=s.days[date]??(s.days[date]=freshDay());d.desired=copy(payload);d.localVersion=(old?.version??0)+1;d.nextTry=0;});return record(date);
 }
 function requestSubmit(date){if(!state.days[date]||!editable(date))throw Error('Előbb rögzítsd a napot, és rendezd a függő mentést.');write(s=>{s.days[date].wantSubmit=true;s.days[date].localVersion++;s.days[date].nextTry=0;});}
 function hydrate(rows){
  assertActor();const checked=rows.map(r=>serverRow(r,actor));if(new Set(checked.map(r=>r.work_date)).size!==checked.length)throw Error('Ismétlődő központi nap.');
  write(s=>{for(const r of checked){let d=s.days[r.work_date];
   if(d?.flight)continue;
   if(d&&hasWork(d)){
    if((d.server?.version??0)!==r.version){d.hold={kind:'conflict',message:'Másik készülék módosította a napot. A helyi adat megmaradt; összehasonlítás szükséges.'};}
    continue;
   }
   if(d?.server&&r.version<d.server.version)continue;
   if(d?.server&&r.version===d.server.version)continue;
   s.days[r.work_date]={...freshDay(),server:r,desired:copy(r.payload),localVersion:(d?.localVersion??0)+1};
  }});
 }
 function failure(date,flight,e){
  if(!alive)return;write(s=>{const d=s.days[date];if(d.flight?.id!==flight.id)return;
   const code=e.code,status=e.status;
   if(code==='40001'){d.flight=null;d.hold={kind:'conflict',message:'Másik eszköz módosította a napot. A helyi rögzítés megmaradt; hasonlítsd össze a két változatot.'};}
   else if(status===401){d.hold={kind:'auth',message:'Új bejelentkezés szükséges. A küldési sor megmaradt.'};}
   else if(code==='42501'||status===403){d.hold={kind:'denied',message:'A szerver nem engedi a mentést. Ellenőrizd a hozzáférést vagy kérj vezetői visszaadást.'};d.flight=null;}
   else if(code==='22023'||status===400){d.hold={kind:'invalid',message:'A központ elutasította az adatot. A helyi rögzítés megmaradt; ellenőrzés szükséges.'};d.flight=null;}
   else if(code==='PROTOCOL'){d.hold={kind:'protocol',message:'A szerver visszaigazolása hibás. A kérésazonosítót és a helyi adatot megőriztük.'};}
   else{d.attempts++;d.nextTry=now()+Math.min(60000,1000*2**Math.min(6,d.attempts));}
  });
 }
 function validateReceipt(response,f){
  const d=serverRow(response?.workday,actor,f.date);
  if(response.request_id!==f.id||response.applied_version!==f.expected+1||typeof response.replayed!=='boolean'||d.version<response.applied_version)throw Object.assign(Error('Hibás visszaigazolás.'),{code:'PROTOCOL'});
  if(d.version===response.applied_version&&(f.kind==='draft'&&(!same(d.payload,f.payload)||d.status!=='draft')||f.kind==='submit'&&d.status!=='submitted'))throw Object.assign(Error('Eltérő mentési eredmény.'),{code:'PROTOCOL'});
  return d;
 }
 async function flush(send,{force=false}={}){
  assertActor();if(!canWrite())return;if(pumping)return pumping;
  pumping=(async()=>{let work=0;
   for(const date of Object.keys(state.days).sort()){
    while(work<80){assertActor();const current=state.days[date];
     if(current.hold||!hasWork(current)||!force&&current.nextTry>now())break;
     if(!current.flight){write(s=>{const d=s.days[date];const id=requestId();if(!uuid(id))throw Error('Hibás kérésazonosító.');d.flight={actor:copy(actor),id,date,expected:d.server?.version??0,kind:needsDraft(d)?'draft':'submit',...(needsDraft(d)?{payload:copy(d.desired)}:{})};});}
     const f=copy(state.days[date].flight);work++;
     try{
      const response=await send(copy(f));assertActor();let server;try{server=validateReceipt(response,f);}catch(e){e.code='PROTOCOL';throw e;}
      write(s=>{const d=s.days[date];if(d.flight?.id!==f.id)throw Error('A küldési sor megváltozott.');
       d.flight=null;d.attempts=0;d.nextTry=0;
       if(server.version>response.applied_version){
        if(f.kind==='draft'&&!same(d.desired,f.payload)){d.hold={kind:'conflict',message:'A korábbi mentés átért, de közben másik eszköz is írt. A későbbi helyi módosításokat ellenőrizd.'};d.server=server;}
        else{d.server=server;d.desired=copy(server.payload);d.wantSubmit=false;d.localVersion++;}
       }else{d.server=server;if(f.kind==='submit'){d.wantSubmit=false;d.desired=copy(server.payload);d.localVersion++;}}
      });
     }catch(e){if(alive){try{assertActor();failure(date,f,e);}catch{}}break;}
     if(state.days[date].hold)break;
    }
   }
  })().finally(()=>{pumping=null;});return pumping;
 }
 function resolve(date,choice,remote){
  assertActor();const r=serverRow(remote,actor,date),d=state.days[date];
  if(!d?.hold||!['remote','local'].includes(choice))throw Error('Nincs összehasonlítandó változat.');
  if(d.flight)throw Error('Előbb az ismeretlen kimenetelű mentést kell visszaigazoltatni.');
  if(choice==='local'&&r.status!=='draft')throw Error('A beküldött naphoz vezetői visszaadás szükséges.');
  write(s=>{const x=s.days[date];x.server=r;if(choice==='remote')x.desired=copy(r.payload);x.wantSubmit=false;x.hold=null;x.localVersion++;x.nextTry=0;x.attempts=0;});
 }
 function retryAuth(){write(s=>{for(const d of Object.values(s.days))if(d.hold?.kind==='auth')d.hold=null;});}
 return Object.freeze({key,record,status,editable,commit,requestSubmit,hydrate,flush,resolve,retryAuth,
  inspect:()=>{assertActor();return copy(state);},pendingCount:()=>{assertActor();return Object.values(state.days).filter(hasWork).length;},
  exportBackup:()=>{assertActor();return JSON.stringify({app:'muszaknaplo-outbox',exportedAt:new Date(now()).toISOString(),state},null,2);},
  close:()=>{alive=false;state={schema:1,actor,revision:0,days:{}};}
 });
}
