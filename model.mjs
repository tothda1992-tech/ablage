import { PRODUCTS, DOWNTIME } from './catalog.mjs';

export const VERSION = 1;
export const STORAGE_KEY = 'muszaknaplo.data.v1';
export const BACKUP_KEY = 'muszaknaplo.previous.v1';
const productIds = new Set(PRODUCTS.map(p => p.id));
const downtimeIds = new Set(DOWNTIME.map(p => p.id));
const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const integer = (x, max = 1e8) => Number.isSafeInteger(x) && x >= 0 && x <= max;
const textValue = (x, max) => typeof x === 'string' && x.length <= max;

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  if (y < 2000 || y > 2199) return false;
  const date = new Date(y,m-1,d,12);
  return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d;
}
export function shiftDate(value, amount) {
  if (!validDate(value)) throw new Error('Érvénytelen dátum.');
  const [y,m,d] = value.split('-').map(Number);
  return localDate(new Date(y,m-1,d+amount,12));
}
// Decimal entry uses integer hundredths of a minute throughout the calculation.
export function decimalHundredths(value, {empty=null, max=144000}={}) {
  const s = String(value).trim();
  if (s==='') return empty;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(s)) throw new Error('Nemnegatív számot írj be, legfeljebb két tizedessel.');
  const [whole,fraction=''] = s.replace(',','.').split('.');
  const n = Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if (!integer(n,max)) throw new Error('A megadott érték túl nagy.');
  return n;
}
export function quantity(value) {
  const s = String(value).trim();
  if (!/^\d+$/.test(s) || !integer(Number(s),99999)) throw new Error('0 és 99 999 közötti egész darabszámot írj be.');
  return Number(s);
}
export function newState() {
  return {schemaVersion:VERSION, profile:{name:'Tóth Dávid'}, favorites:[], days:{}, revision:0, updatedAt:null};
}
export function newDay(date, name='') {
  if (!validDate(date)) throw new Error('Érvénytelen dátum.');
  return {date,name,workCentiMinutes:null,counts:{},norms:Object.fromEntries(PRODUCTS.map(p=>[p.id,p.normCentiMinutes])),downtime:{},brazilCount:0,spoiler:'',note:'',closed:false,updatedAt:null};
}
export function getDay(state,date) { return state.days[date] ?? newDay(date,state.profile.name); }
export function dayHasData(day) {
  return Object.values(day.counts).some(n=>n>0) || Object.values(day.downtime).some(n=>n>0) || day.workCentiMinutes!==null || day.brazilCount>0 || !!day.spoiler || !!day.note || day.closed;
}
export function totals(day) {
  let normCentiMinutes=0,upper=0,lower=0,accessory=0;
  const rows=[];
  for (const product of PRODUCTS) {
    const count=day.counts[product.id]??0;
    if (!count) continue;
    const rate=day.norms[product.id];
    if (!integer(count,99999) || !integer(rate)) throw new Error('Hiányzó vagy hibás darabszám / normaidő.');
    const minutes=count*rate;
    normCentiMinutes+=minutes;
    if(product.position==='upper') upper+=count;
    else if(product.position==='lower') lower+=count;
    else accessory+=count;
    rows.push({...product,count,rate,centiMinutes:minutes});
  }
  let downtimeCentiMinutes=0;
  const downtimeRows=[];
  for(const category of DOWNTIME) {
    const minutes=day.downtime[category.id]??0;
    if (!integer(minutes,144000)) throw new Error('Hibás egyéb idő.');
    downtimeCentiMinutes+=minutes;
    if(minutes) downtimeRows.push({...category,centiMinutes:minutes});
  }
  const creditedCentiMinutes=normCentiMinutes+downtimeCentiMinutes;
  const workCentiMinutes=day.workCentiMinutes;
  const ratio=workCentiMinutes>0 ? creditedCentiMinutes/workCentiMinutes*100 : null;
  return {normCentiMinutes,downtimeCentiMinutes,creditedCentiMinutes,workCentiMinutes,ratio,
    normGapCentiMinutes:workCentiMinutes===null?null:normCentiMinutes-workCentiMinutes,
    totalGapCentiMinutes:workCentiMinutes===null?null:creditedCentiMinutes-workCentiMinutes,
    upper,lower,accessory,totalPieces:upper+lower+accessory,brazilCount:day.brazilCount,rows,downtimeRows};
}
export function validateState(data) {
  const bad = () => {throw new Error('A mentés formátuma vagy valamelyik adata érvénytelen. Az eddigi napló változatlan.');};
  const seen=new Set();
  const checkKeys=value=>{
    if(value===null||typeof value!=='object')return;
    if(seen.has(value))bad();
    seen.add(value);
    for(const key of Object.keys(value)) {
      if(['__proto__','prototype','constructor'].includes(key))bad();
      checkKeys(value[key]);
    }
    seen.delete(value);
  };
  checkKeys(data);
  if(!isObject(data)||data.schemaVersion!==VERSION||!isObject(data.profile)||!textValue(data.profile.name,80)||!Array.isArray(data.favorites)||!isObject(data.days)||!integer(data.revision)) bad();
  if(data.favorites.length>PRODUCTS.length || data.favorites.some(id=>!productIds.has(id)) || new Set(data.favorites).size!==data.favorites.length) bad();
  if(Object.keys(data.days).length>10000) bad();
  for(const [date,day] of Object.entries(data.days)) {
    if(!validDate(date)||!isObject(day)||day.date!==date||!textValue(day.name,80)||!isObject(day.counts)||!isObject(day.norms)||!isObject(day.downtime)||!integer(day.brazilCount,99999)||!textValue(day.spoiler,1000)||!textValue(day.note,3000)||typeof day.closed!=='boolean') bad();
    if(day.workCentiMinutes!==null && !integer(day.workCentiMinutes,288000)) bad();
    for(const [id,count] of Object.entries(day.counts)) if(!productIds.has(id)||!integer(count,99999)||!integer(day.norms[id])) bad();
    for(const [id,rate] of Object.entries(day.norms)) if(!productIds.has(id)||!integer(rate)) bad();
    // Every catalog row needs a norm snapshot before it can be incremented later.
    if(PRODUCTS.some(p=>!Object.hasOwn(day.norms,p.id))) bad();
    for(const [id,time] of Object.entries(day.downtime)) if(!downtimeIds.has(id)||!integer(time,144000)) bad();
    if(day.updatedAt!==null && (!textValue(day.updatedAt,40)||Number.isNaN(Date.parse(day.updatedAt)))) bad();
  }
  if(data.updatedAt!==null&&(!textValue(data.updatedAt,40)||Number.isNaN(Date.parse(data.updatedAt)))) bad();
  return JSON.parse(JSON.stringify(data));
}
export function readState(storage) {
  let primary=null, secondary=null;
  try {
    primary=storage.getItem(STORAGE_KEY);
    if(primary===null) return {state:newState(),warning:null,writeAllowed:true};
    try {return {state:validateState(JSON.parse(primary)),warning:null,writeAllowed:true};} catch {}
    secondary=storage.getItem(BACKUP_KEY);
    if(secondary) {
      try {return {state:validateState(JSON.parse(secondary)),warning:'Az utolsó mentés sérült volt. Az előző helyi mentést nyitottam meg; ellenőrizd a legutolsó rögzítést.',writeAllowed:true,recovered:true};} catch {}
    }
    return {state:newState(),warning:'A korábbi naplót nem sikerült beolvasni. A sérült mentést nem írom felül. A Beállításoknál mentsd le, vagy tölts vissza egy biztonsági mentést.',writeAllowed:false,raw:primary};
  } catch {
    return {state:newState(),warning:'Ez a böngésző most nem engedi a helyi mentést. Az adatok csak a megnyitott ablakban maradnak meg; tölts le biztonsági mentést.',writeAllowed:false};
  }
}
export function persist(storage,state) {
  const encoded=JSON.stringify(validateState(state));
  const old=storage.getItem(STORAGE_KEY);
  if(old) {try {validateState(JSON.parse(old));storage.setItem(BACKUP_KEY,old);} catch { /* Never replace a good recovery copy with corrupt data. */ }}
  storage.setItem(STORAGE_KEY,encoded);
  return true;
}
export function parseBackup(raw) {
  if(typeof raw!=='string'||raw.length>10*1024*1024) throw new Error('Legfeljebb 10 MB-os naplómentés tölthető vissza.');
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw new Error('Ez nem olvasható JSON-mentés.');}
  if(parsed.app!=='muszaknaplo'||!parsed.data) throw new Error('Ez a fájl nem Műszaknapló-mentés.');
  return validateState(parsed.data);
}
export function backupText(state) {
  return JSON.stringify({app:'muszaknaplo',exportedAt:new Date().toISOString(),data:validateState(state)},null,2);
}
export function mergeBackup(current,incoming,replaceConflicts=false) {
  const next=validateState(current), source=validateState(incoming);
  for(const [date,day] of Object.entries(source.days)) {
    if(!next.days[date]||!dayHasData(next.days[date])||replaceConflicts) next.days[date]=day;
  }
  next.favorites=[...new Set([...next.favorites,...source.favorites])];
  if(!next.profile.name) next.profile.name=source.profile.name;
  return next;
}
export function normalizeSearch(value) {return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
export function matchProduct(product,query) {
  const q=normalizeSearch(query);
  return !q || normalizeSearch([product.code,product.label,product.group,...product.aliases].join(' ')).includes(q);
}
export function monthTotals(state,month) {
  const days=Object.values(state.days).filter(d=>d.date.startsWith(month+'-')&&dayHasData(d)).sort((a,b)=>b.date.localeCompare(a.date));
  const result={days,normCentiMinutes:0,downtimeCentiMinutes:0,creditedCentiMinutes:0,workCentiMinutes:0,upper:0,lower:0,accessory:0,brazilCount:0,missingWorkDays:0,ratio:null};
  for(const day of days) {
    const t=totals(day);
    for(const key of ['normCentiMinutes','downtimeCentiMinutes','creditedCentiMinutes','upper','lower','accessory','brazilCount'])result[key]+=t[key];
    if(t.workCentiMinutes===null)result.missingWorkDays++;
    else result.workCentiMinutes+=t.workCentiMinutes;
  }
  if(!result.missingWorkDays&&result.workCentiMinutes>0)result.ratio=result.creditedCentiMinutes/result.workCentiMinutes*100;
  return result;
}
export function csvText(days) {
  const rows=[['Dátum','Név','Típus','Kód','Másik kód / megjegyzés','Megnevezés','Darab','Norma (perc/db)','Elszámolt idő (perc)','Munkaidő (óra)','Állapot']];
  const decimal=n=>(n/100).toFixed(2).replace('.',',');
  for(const day of [...days].sort((a,b)=>a.date.localeCompare(b.date))) {
    const t=totals(day),base=[day.date,day.name],tail=[day.workCentiMinutes===null?'':(day.workCentiMinutes/6000).toFixed(2).replace('.',','),day.closed?'Lezárt':'Nyitott'];
    for(const r of t.rows) rows.push([...base,'Termék',r.code,r.secondaryCode??'',r.label,r.count,decimal(r.rate),decimal(r.centiMinutes),...tail]);
    for(const r of t.downtimeRows) rows.push([...base,'Állás / egyéb','','',r.label,'','',decimal(r.centiMinutes),...tail]);
    if(day.brazilCount)rows.push([...base,'Külön darabjelölés','BRAZIL','Nem ad hozzá külön normaidőt','Brazil',day.brazilCount,'','',...tail]);
    if(day.spoiler)rows.push([...base,'Feljegyzés','SPOILER',day.spoiler,'Spoiler','','','',...tail]);
    if(day.note)rows.push([...base,'Feljegyzés','',day.note,'Megjegyzés','','','',...tail]);
    rows.push([...base,'NAPI ÖSSZESEN','','Felső / alsó / kiegészítő db külön követendő','Elszámolt idő','','',decimal(t.creditedCentiMinutes),...tail]);
  }
  const safe = value => {
    let s=String(value??'');
    if(typeof value!=='number'&&/^[\s]*[=+\-@]/.test(s)) s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+rows.map(row=>row.map(safe).join(';')).join('\r\n');
}
