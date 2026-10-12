import {PRODUCTS,DOWNTIME} from './catalog.mjs';
import {TEMPLATE_GZIP_BASE64} from './excel-template-data.mjs';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EXCEL_VERSION='original-template-2026-10-11-v1';
const TYPES={draft:'Javítható / helyi',submitted:'Beküldve',approved:'Jóváhagyva',local_closed:'Helyben lezárva'};
const productRows=PRODUCTS.map(p=>({...p,row:Number(p.sourceCell.match(/\d+$/)[0])}));
const otherRows=DOWNTIME.map(p=>({...p,row:Number(p.sourceCell.match(/\d+$/)[0])}));
const enc=new TextEncoder();
export const xml=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function column(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
const columnNumber=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const validMonth=m=>typeof m==='string'&&/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(m);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&validMonth(d.slice(0,7))&&!isNaN(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const safeProfile=p=>p&&typeof p.id==='string'&&typeof p.display_name==='string'&&p.display_name.length<=80;
let templatePromise;
async function template(){
 if(!templatePromise)templatePromise=(async()=>{
   if(typeof DecompressionStream==='undefined')throw Error('Ehhez az Excel-exporthoz friss Chrome, Edge, Firefox vagy Safari szükséges.');
   const bytes=Uint8Array.from(atob(TEMPLATE_GZIP_BASE64),c=>c.charCodeAt(0));
   return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
 })().catch(e=>{templatePromise=null;throw e;});
 return templatePromise;
}
function validateRecord(r){
 const p=r.payload;if(!validDate(r.work_date)||!p||!p.counts||!p.downtime||!r.norms)throw Error('Hibás napi adat; az Excel nem készült el.');
 for(const [id,n] of Object.entries(p.counts))if(!PRODUCTS.some(x=>x.id===id)||!integer(n,99999))throw Error('Hibás termékkód vagy darabszám.');
 for(const product of PRODUCTS)if(!integer(r.norms[product.id],100000000))throw Error('Hiányzó normapillanatkép.');
 for(const [id,n] of Object.entries(p.downtime))if(!DOWNTIME.some(x=>x.id===id)||!integer(n,144000))throw Error('Hibás állásidő.');
 if(p.workCentiMinutes!==null&&!integer(p.workCentiMinutes,288000))throw Error('Hibás munkaóra.');
 if(!integer(p.brazilCount??0,99999)||typeof p.note!=='string'||p.note.length>3000||typeof p.spoiler!=='string'||p.spoiler.length>1000)throw Error('Hibás feljegyzés.');
}
export function reportData(profile,month,records,{approvedOnly=false}={}){
 if(!safeProfile(profile)||!validMonth(month)||!Array.isArray(records))throw Error('Hibás dolgozó vagy hónap.');
 const selected=records.filter(r=>r.employee_id===profile.id&&r.work_date?.slice(0,7)===month&&(!approvedOnly||r.status==='approved')).map(r=>{validateRecord(r);return r;}).sort((a,b)=>a.work_date.localeCompare(b.work_date));
 if(new Set(selected.map(r=>r.work_date)).size!==selected.length)throw Error('Ismétlődő nap: az Excel-export megállt, hogy ne számoljon kétszer.');
 const byDay=new Map(selected.map(r=>[Number(r.work_date.slice(-2)),r]));
 const sum={norm:0,other:0,work:0,upper:0,lower:0,accessory:0,brazil:0,missingWork:0};
 const daily=selected.map(r=>{
  const p=r.payload,t={date:r.work_date,status:TYPES[r.status]||r.status,version:r.version??0,norm:0,other:0,work:p.workCentiMinutes,upper:0,lower:0,accessory:0};
  for(const x of PRODUCTS){const q=p.counts[x.id]||0;t.norm+=q*r.norms[x.id];t[x.position]+=q;}
  t.other=Object.values(p.downtime).reduce((a,b)=>a+b,0);t.credited=t.norm+t.other;
  for(const k of ['norm','other','upper','lower','accessory'])sum[k]+=t[k];
  if(t.work===null)sum.missingWork++;else sum.work+=t.work;sum.brazil+=p.brazilCount||0;
  return {...t,note:p.note,spoiler:p.spoiler,brazil:p.brazilCount||0};
 });
 sum.credited=sum.norm+sum.other;
 if(!Object.values(sum).every(Number.isSafeInteger))throw Error('Túl nagy összeg az Excel biztonságos elkészítéséhez.');
 return {profile,month,records:selected,byDay,daily,sum,days:new Date(Number(month.slice(0,4)),Number(month.slice(-2)),0).getDate()};
}
// Read-only adapter for the existing app. Its storage schema and original days are never changed.
export function localRecords(state){
 if(!state||state.schemaVersion!==1||!state.days||typeof state.profile?.name!=='string')throw Error('Nem olvasható a helyi napló.');
 const profile={id:'local',worker_code:'SAJAT',display_name:state.profile.name};
 const records=Object.values(state.days).filter(d=>Object.values(d.counts??{}).some(n=>n>0)||Object.values(d.downtime??{}).some(n=>n>0)||d.workCentiMinutes!==null||d.brazilCount||d.note||d.spoiler||d.closed).map(d=>({employee_id:'local',work_date:d.date,status:d.closed?'local_closed':'draft',version:state.revision||0,payload:{counts:d.counts,downtime:d.downtime,workCentiMinutes:d.workCentiMinutes,brazilCount:d.brazilCount||0,note:d.note||'',spoiler:d.spoiler||''},norms:d.norms}));
 return {profile,records};
}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function zipFiles(files){
 const local=[],central=[];let offset=0;
 for(const [path,text] of Object.entries(files)){
  const name=enc.encode(path),data=typeof text==='string'?enc.encode(text):text,crc=crc32(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);local.push(h,data);
  const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,2048,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=h.length+data.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
 const result=new Uint8Array(offset+size+22);let pos=0;for(const b of [...local,...central,end]){result.set(b,pos);pos+=b.length;}return result;
}
function cell(ref,style,value,formula){
 const head=`<c r="${ref}" s="${style}">`;
 if(formula!==undefined&&formula!==null)return `${typeof value==='string'?head.replace('>', ' t="str">'):head}<f>${xml(formula)}</f><v>${xml(value??0)}</v></c>`;
 if(value===undefined||value===null)return `<c r="${ref}" s="${style}"/>`;
 if(typeof value==='number')return `${head}<v>${value}</v></c>`;
 return `${head.replace('>', ' t="inlineStr">')}<is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function plainSheet(rows){return `<?xml version="1.0" encoding="utf-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="7" width="20" customWidth="1"/><col min="8" max="10" width="44" customWidth="1"/></cols><sheetData>${rows.map((vals,i)=>`<row r="${i+1}" ht="24" customHeight="1">${vals.map((v,j)=>cell(column(j+1)+(i+1),0,v)).join('')}</row>`).join('')}</sheetData></worksheet>`;}
export async function originalWorkbookParts(profile,month,records,{approvedOnly=false,demo=false}={}){
 const data=reportData(profile,month,records,{approvedOnly}),t=await template(),values={...t.values},formulas={...t.formulas},sum=data.sum;
 const put=(a,v,f)=>{values[a]=v;if(f!==undefined)formulas[a]=f;else delete formulas[a];};
 const start=Math.round((Date.parse(month+'-01T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
 put('B2',start);put('B75',start,'B2');put('Z2',profile.display_name);put('AF2',String(profile.worker_code||''));put('AM11',profile.display_name);
 put('Z75','Második blokk: nincs kiválasztott dolgozó');put('AM5','Második blokk (üres)');put('AF75','');
 put('B3',demo?'BEMUTATÓ – TESZTADAT':approvedOnly?'Jóváhagyott napok':'TERVEZET – ellenőrzésre');
 const normGrid={};
 for(let d=1;d<=31;d++){
  const c=column(d+3),r=data.byDay.get(d),p=r?.payload;
  for(const row of [1,4,77])put(c+row,d<=data.days?start+d-1:'',`IF(MONTH($B$2+${d-1})=MONTH($B$2),$B$2+${d-1},"")`);
  put(c+'5',p?.workCentiMinutes==null?'':p.workCentiMinutes/6000);
  for(const x of productRows){put(c+x.row,p?(p.counts[x.id]||0):'');normGrid[c+x.row]=r?r.norms[x.id]/100:x.normCentiMinutes/100;}
  for(const x of otherRows)put(c+x.row,p?(p.downtime[x.id]||0)/100:'');
  put(c+'69',p?.brazilCount??'');
  for(const [row,lo,hi] of [[15,10,14],[23,17,22],[31,25,30],[39,33,38],[49,41,48],[57,51,56]]){
   const n=p?productRows.filter(x=>x.row>=lo&&x.row<=hi).reduce((s,x)=>s+(p.counts[x.id]||0),0):0;put(c+row,n,`SUM(${c}${lo}:${c}${hi})`);
  }
  put(c+'58',p?productRows.filter(x=>x.position==='upper').reduce((s,x)=>s+(p.counts[x.id]||0),0):0,`${c}15+${c}23+${c}31+${c}39`);
 }
 for(const x of productRows){
  const qty=data.records.reduce((s,r)=>s+(r.payload.counts[x.id]||0),0),amount=data.records.reduce((s,r)=>s+(r.payload.counts[x.id]||0)*r.norms[x.id],0)/100;
  const rates=[...new Set(data.records.map(r=>r.norms[x.id]))],variable=rates.length>1;
  put('C'+x.row,variable?'változó':(rates[0]??x.normCentiMinutes)/100);
  put('AI'+x.row,qty,`SUM(D${x.row}:AH${x.row})`);
  put('AJ'+x.row,amount,variable?`SUMPRODUCT(D${x.row}:AH${x.row},Normak!D${x.row}:AH${x.row})`:`AI${x.row}*C${x.row}`);
 }
 for(const [row,lo,hi] of [[9,6,8],[15,10,14],[23,17,22],[31,25,30],[39,33,38],[49,41,48],[57,51,56]]){
  const xs=productRows.filter(x=>x.row>=lo&&x.row<=hi);if(row!==9)put('AI'+row,xs.reduce((s,x)=>s+values['AI'+x.row],0),`SUM(AI${lo}:AI${hi})`);
  put('AJ'+row,xs.reduce((s,x)=>s+Math.round(values['AJ'+x.row]*100),0)/100,`SUM(AJ${lo}:AJ${hi})`);
 }
 for(const x of otherRows)put('AI'+x.row,data.records.reduce((s,r)=>s+(r.payload.downtime[x.id]||0),0)/100,`SUM(D${x.row}:AH${x.row})`);
 const q=id=>data.records.reduce((s,r)=>s+(r.payload.counts[id]||0),0);
 for(const [a,v,f] of [['AI5',sum.work/6000,'SUM(D5:AH5)'],['AI58',sum.upper,'SUM(D58:AH58)'],['AI69',sum.brazil,'SUM(D69:AH69)'],['AJ59',sum.norm/100,'AJ9+AJ15+AJ23+AJ31+AJ39+AJ49+AJ57'],['AI71',sum.other/100,'SUM(AI61:AI67)'],['C59',q('rollo'),'AI6'],['C60',q('polc'),'AI7'],['C61',q('tukor'),'AI8'],['C62',sum.upper,'AI15+AI23+AI31+AI39'],['C63',sum.lower,'AI49+AI57'],['C65',sum.work/6000,'AI5'],['C66',sum.norm/6000,'AJ59/60'],['C68',(sum.norm-sum.work)/6000,'C66-C65'],['C69',sum.other/6000,'AI71/60'],['C70',sum.credited/6000,'C66+C69'],['AN11',sum.credited/6000,'C70'],['AO11',sum.upper,'AI58'],['AP11',sum.brazil,'AI69'],['AQ11',q('germersheim_lower'),'AI56'],['AR11',sum.upper-sum.brazil-q('germersheim_lower'),'AO11-AP11-AQ11'],['AT11',sum.upper-sum.brazil-q('germersheim_lower'),'AR11-AS11'],['AU11',q('rollo'),'AI6'],['AW11',q('rollo'),'AU11-AV11'],['AK48',q('product_5074')+q('product_5174')+q('product_5274')+q('product_5374'),'AI45+AI46+AI47+AI48']])put(a,v,f);
 const rows=t.rows.map(([n,attrs,runs])=>{
  const cells=new Map();for(const [a,b,s] of runs)for(let c=a;c<=b;c++)cells.set(c,s);
  for(const ref of [...Object.keys(values),...Object.keys(formulas)])if(Number(ref.match(/\d+$/)[0])===n){const c=columnNumber(ref.match(/^[A-Z]+/)[0]);if(!cells.has(c))cells.set(c,0);}
  return `<row r="${n}" ${Object.entries(attrs).map(([k,v])=>`${k}="${xml(v)}"`).join(' ')}>${[...cells].sort((a,b)=>a[0]-b[0]).map(([c,s])=>{const a=column(c)+n;return cell(a,s,values[a]??(formulas[a]!==undefined?0:undefined),formulas[a]);}).join('')}</row>`;
 });
 let sheet=t.prefix+'<sheetData>'+rows.join('')+'</sheetData>'+t.suffix;
 if(!sheet.includes('<pageSetup'))sheet=sheet.replace('</worksheet>','<pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/></worksheet>');
 const noteRows=[['MŰSZAKNAPLÓ',demo?'BEMUTATÓ – KITALÁLT ADATOK':approvedOnly?'Jóváhagyott napok':'TERVEZET – ellenőrizendő'],['Dolgozó',profile.display_name,profile.worker_code||''],['Hónap',month],['Forrás','Toth.xlsx eredeti elrendezése; az első dolgozói blokk kitöltve.'],['Második blokk','Üresen megőrizve. Nem tartalmaz más dolgozó adatait.'],['Automatika','A letöltött fájl pillanatkép. Nem frissül magától, és nem kerül automatikusan a főnökhöz/HR-hez.'],['Hiányzó munkaóra',sum.missingWork],['Megjegyzés','A főlap a normákat tizedes percben tárolja. A két felcserélt polc/tükör felirat javítva.'],[],['Dátum','Állapot','Verzió','Munkaóra','Normaóra','Egyéb óra','Elszámolt óra','Megjegyzés','Spoiler','Brazil db'],...data.daily.map(d=>[d.date,d.status,d.version,d.work==null?'':d.work/6000,d.norm/6000,d.other/6000,d.credited/6000,d.note,d.spoiler,d.brazil])];
 const normRows=['<row r="1">'+cell('B1',0,'Napi normák – perc/db. A történeti elszámolások megőrzéséhez.')+'</row>',...productRows.map(x=>`<row r="${x.row}">${cell('B'+x.row,0,x.code)}${Array.from({length:31},(_,i)=>cell(column(i+4)+x.row,0,normGrid[column(i+4)+x.row])).join('')}</row>`)];
 const names=['Elszamolas','Napi_adatok','Normak'];
 return {
  '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
  '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+names.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Elszamolas!$B$2:$AJ$71</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
  'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>',
  'xl/styles.xml':t.styles,'xl/theme/theme1.xml':t.theme,'xl/worksheets/sheet1.xml':sheet,'xl/worksheets/sheet2.xml':plainSheet(noteRows),'xl/worksheets/sheet3.xml':'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+normRows.join('')+'</sheetData></worksheet>'
 };
}
export async function makeOriginalWorkbook(profile,month,records,options={}){return zipFiles(await originalWorkbookParts(profile,month,records,options));}
export function saveXlsx(bytes,name){const u=URL.createObjectURL(new Blob([bytes],{type:XLSX_MIME})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
