/** Shared, synchronous local entry engine. Authentication belongs to the future server adapter.
 * Receipts identify one product edit, never a snapshot of the whole team's data.
 */
import {PRODUCTS,emptyPayload,normSnapshot,calculate,validDate,count} from '../team-core.mjs';
export const ENTRY_MODES=[{id:'list',label:'Gyors lista'},{id:'cards',label:'Kártyás kereső'},{id:'big',label:'Nagygombos'}];
export const POSITIONS=[{id:'upper',label:'Felső'},{id:'lower',label:'Alsó'},{id:'accessory',label:'Kiegészítők'}];
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const validPosition=x=>POSITIONS.some(p=>p.id===x);
const productById=id=>PRODUCTS.find(p=>p.id===id);
export function normalizeSearch(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu').trim();}
export function entryProducts({category='all',query='',favoritesOnly=false,favorites=[]}={}){
 if(category!=='all'&&!validPosition(category))return [];
 const words=normalizeSearch(query).split(/\s+/).filter(Boolean);
 const source=favoritesOnly?favorites.map(productById).filter(Boolean):PRODUCTS;
 return source.filter(p=>(category==='all'||p.position===category)&&words.every(w=>normalizeSearch([p.code,p.label,p.group,...p.aliases].join(' ')).includes(w)));
}
export function cleanPreferences(raw){
 const x=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const favorites=Array.isArray(x.favorites)?[...new Set(x.favorites.filter(id=>!!productById(id)))].slice(0,PRODUCTS.length):[];
 const lastTypes={};for(const p of POSITIONS){const candidate=x.lastTypes?.[p.id];lastTypes[p.id]=productById(candidate)?.position===p.id?candidate:'';}
 return {version:1,mode:ENTRY_MODES.some(m=>m.id===x.mode)?x.mode:'list',favorites,lastTypes,bigCategory:validPosition(x.bigCategory)?x.bigCategory:'upper'};
}
export function preferenceKey(scope,employeeId){
 if(!validId(scope)||!validId(employeeId))throw Error('Hibás nézetbeállítás-azonosító.');
 return `muszaknaplo.entry-modes.v1.${scope}.${employeeId}`;
}
export function loadPreferences(storage,scope,employeeId){
 try{return {value:cleanPreferences(JSON.parse(storage.getItem(preferenceKey(scope,employeeId))||'{}')),saved:true};}
 catch{return {value:cleanPreferences(),saved:false};}
}
export function savePreferences(storage,scope,employeeId,prefs){
 const value=cleanPreferences(prefs);
 try{storage.setItem(preferenceKey(scope,employeeId),JSON.stringify(value));return {value,saved:true};}
 catch{return {value,saved:false};}
}
function contextKey(c){if(!c||!validId(c.employeeId)||!validDate(c.date))throw Error('Válassz érvényes dolgozót és napot.');return c.employeeId+'|'+c.date;}
function editableRecord(ctx,old){
 contextKey(ctx);
 if(ctx.editable!==true)throw Error('Ez a munkanap itt csak megtekinthető.');
 if(old&&(old.employee_id!==ctx.employeeId||old.work_date!==ctx.date))throw Error('Másik dolgozó vagy nap adata érkezett. A mentés elutasítva.');
 if(old&&old.status!=='draft')throw Error('A nap beküldött vagy lezárt. Javításhoz előbb vissza kell adni.');
 if(old&&(!Number.isSafeInteger(old.version)||old.version<1))throw Error('Hibás napverzió.');
 const r=old?structuredClone(old):{employee_id:ctx.employeeId,work_date:ctx.date,version:0,status:'draft',payload:emptyPayload(),norms:normSnapshot()};
 calculate(r.payload,r.norms);return r;
}
export function productChange(ctx,old,operation){
 const r=editableRecord(ctx,old),p=productById(operation.productId);
 if(!p||!validPosition(operation.position)||p.position!==operation.position)throw Error('A termék nem ehhez a kategóriához tartozik.');
 if(operation.expectedVersion!==undefined&&operation.expectedVersion!==(old?.version??0))throw Error('A nap közben megváltozott. Nyisd meg újra a javítást.');
 const before=r.payload.counts[p.id]??0;let after;
 if(operation.kind==='add'){
  const amount=count(String(operation.amount).trim());if(amount<1)throw Error('Legalább 1 darabot adj hozzá.');after=count(before+amount);
 }else if(operation.kind==='decrement'){
  if(before===0)throw Error('Nulla darabból már nem lehet levonni.');after=before-1;
 }else if(operation.kind==='set')after=count(String(operation.amount).trim());
 else throw Error('Ismeretlen rögzítési művelet.');
 r.payload.counts[p.id]=after;calculate(r.payload,r.norms);
 return {record:r,receipt:{employeeId:ctx.employeeId,date:ctx.date,productId:p.id,position:p.position,before,after,baseVersion:old?.version??0}};
}
export function createEntryController({getContext,getRecord,commitRecord}){
 const receipts=new Map();
 function run(op){
  const ctx=getContext(),old=getRecord(),change=productChange(ctx,old,op);
  if(change.receipt.before===change.receipt.after)return {...change.receipt,changed:false};
  const result=commitRecord(change.record,old?.version??0);
  if(!result||result.employee_id!==ctx.employeeId||result.work_date!==ctx.date||result.version!==(old?.version??0)+1||result.payload.counts[op.productId]!==change.receipt.after)throw Error('A rögzítés eredménye nem igazolható. Ellenőrizd a napot.');
  const receipt={...change.receipt,version:result.version};receipts.set(contextKey(ctx),receipt);return {...receipt,changed:true};
 }
 function undoState(){
  const ctx=getContext(),r=getRecord(),receipt=receipts.get(contextKey(ctx));
  return {available:!!receipt&&ctx.editable===true&&r?.status==='draft'&&r.version===receipt.version&&(r.payload.counts[receipt.productId]??0)===receipt.after,receipt};
 }
 function undo(){
  const ctx=getContext(),{available,receipt}=undoState();
  if(!available)throw Error('Ez a módosítás már nem vonható vissza: a nap megváltozott vagy lezárt.');
  const result=run({productId:receipt.productId,position:receipt.position,kind:'set',amount:receipt.before,expectedVersion:receipt.version});
  receipts.delete(contextKey(ctx));return result;
 }
 return {run,undo,undoState};
}
