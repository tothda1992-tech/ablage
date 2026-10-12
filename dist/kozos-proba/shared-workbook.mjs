/** Shared MONTHLY workbook. Pure generator: never authenticates, uploads or downloads.
 * Each call consumes a complete, immutable team snapshot. A saved day replaces its
 * previous version; the same identity/month always maps to the same logical file.
 */
import {originalWorkbookParts,reportData,zipFiles,xml,column,XLSX_MIME} from '../excel-export.mjs';
export const SHARED_VERSION='muszaknaplo-shared-v1';
export const MAX_EMPLOYEES=100;
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const validMonth=m=>typeof m==='string'&&/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(m);
const safeKey=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s);
export function workbookKey(workspace,month){
 if(!safeKey(workspace)||!validMonth(month))throw Error('Hibás munkafüzet-azonosító vagy hónap.');
 return `${workspace}/${month}/Elszamolas_${month}.xlsx`;
}
export function workbookFilename(month){if(!validMonth(month))throw Error('Hibás hónap.');return `Elszamolas_${month}.xlsx`;}
export function employeeSheets(profiles){
 if(!Array.isArray(profiles)||!profiles.length||profiles.length>MAX_EMPLOYEES)throw Error('1–100 dolgozó szükséges a közös munkafüzethez.');
 const ids=new Set(),codes=new Set();
 const rows=profiles.map(p=>{
  if(!p||!safeKey(p.id)||typeof p.worker_code!=='string'||!/^[A-Za-z0-9_-]{1,25}$/.test(p.worker_code)||typeof p.display_name!=='string'||p.display_name.length>80||p.role==='manager')throw Error('Hibás dolgozói névsor; az Excel nem készült el.');
  const code=p.worker_code.toUpperCase();
  if(ids.has(p.id)||codes.has(code)||['OSSZESITO','NORMAK','NAPLO','RENDSZER'].includes(code))throw Error('Ismétlődő vagy fenntartott dolgozói azonosító.');
  ids.add(p.id);codes.add(code);return {...p,sheet:code};
 });
 return rows.sort((a,b)=>a.sheet.localeCompare(b.sheet,'en',{numeric:true}));
}
export function validateSnapshot(s){
 if(!s||s.schemaVersion!==1||!safeKey(s.workspace)||!safeKey(s.bookId)||!validMonth(s.month)||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.records)||s.records.length>3100)throw Error('Nem teljes vagy hibás munkafüzet-pillanatkép.');
 if(s.approvedOnly)throw Error('A közös mestermunkafüzet minden mentett napot tartalmaz; a jóváhagyási állapotot külön jelzi.');
 const people=employeeSheets(s.profiles),ids=new Set(people.map(p=>p.id));
 if(people.some(p=>p.workspace_id&&p.workspace_id!==s.workspace))throw Error('Idegen munkaterület dolgozója.');
 for(const r of s.records){if(!Number.isSafeInteger(r.version)||r.version<1||!['draft','submitted','approved','local_closed'].includes(r.status))throw Error('Hibás munkanap-verzió vagy állapot.');if(r.workspace_id&&r.workspace_id!==s.workspace)throw Error('Idegen munkaterület munkanapja.');if(!ids.has(r.employee_id))throw Error('A névsor hiányos: egy munkanap dolgozója nem található.');if(r.work_date?.slice(0,7)!==s.month)throw Error('Más hónap adata került a havi munkafüzetbe.');}
 for(const p of people)reportData(p,s.month,s.records);
 return people;
}
export function replaceWorkday(records,record,expectedVersion){
 const key=r=>r.employee_id+'|'+r.work_date;
 const found=records.filter(r=>key(r)===key(record));
 if(found.length>1)throw Error('Ismétlődő munkanap.');
 const currentVersion=found[0]?.version??0;
 if(expectedVersion!==currentVersion)throw Error('A nap időközben megváltozott. Előbb frissítsd az adatokat.');
 if(!Number.isSafeInteger(currentVersion)||currentVersion<0)throw Error('Hibás verzió.');
 const next=structuredClone(record);next.version=currentVersion+1;
 return [...records.filter(r=>key(r)!==key(record)),next];
}
function cell(ref,value,style=0,formula){
 const base=`<c r="${ref}" s="${style}"`;
 if(formula!==undefined)return `${base}><f>${xml(formula)}</f><v>${typeof value==='number'?value:0}</v></c>`;
 if(value===null||value===undefined)return `${base}/>`;
 if(typeof value==='number')return `${base}><v>${value}</v></c>`;
 return `${base} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function worksheet(rows,{cols='',merges=[],freeze=false,tab='174C3C',filter=''}={}){
 return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetPr><tabColor rgb="FF${tab}"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze?'<pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/>':''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/>${cols?'<cols>'+cols+'</cols>':''}<sheetData>${rows.join('')}</sheetData>${filter?'<autoFilter ref="'+filter+'"/>':''}${merges.length?'<mergeCells count="'+merges.length+'">'+merges.map(r=>'<mergeCell ref="'+r+'"/>').join('')+'</mergeCells>':''}<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}
function extendStyles(source){
 let s=source;const append=(tag,entries)=>{let first;s=s.replace(new RegExp(`<${tag} count="(\\d+)"[^>]*>([\\s\\S]*?)</${tag}>`),(full,n,body)=>{first=Number(n);return `<${tag} count="${Number(n)+entries.length}">${body}${entries.join('')}</${tag}>`;});if(first===undefined)throw Error('Hiányzó Excel-formázás: '+tag);return first;};
 const f=append('fonts',[
 '<font><sz val="20"/><color rgb="FFFFFFFF"/><name val="Calibri"/><b/></font>',
 '<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><b/></font>',
 '<font><sz val="11"/><color rgb="FF174C3C"/><name val="Calibri"/><b/></font>',
 '<font><sz val="11"/><color rgb="FF24392F"/><name val="Calibri"/></font>',
 '<font><sz val="10"/><color rgb="FF607060"/><name val="Calibri"/></font>'
 ]);
 const fill=append('fills',['174C3C','EEF5EF','F4F7FA','FFF2D9'].map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`));
 const xf=(font,background,num=0,align='left',wrap=false)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${background}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center"${wrap?' wrapText="1"':''}/></xf>`;
 const start=append('cellXfs',[xf(f,fill),xf(f+1,fill,0,'center',true),xf(f+3,0),xf(f+3,0,2,'right'),xf(f+3,fill+2),xf(f+3,fill+2,2,'right'),xf(f+2,fill+1,2,'right'),xf(f+2,fill+1),xf(f+4,0,0,'left',true),xf(f+2,fill+3),xf(f+3,0,14),xf(f+3,0,1,'right'),xf(f+3,fill+2,1,'right'),xf(f+2,fill+1,1,'right')]);
 return {xml:s,title:start,header:start+1,text:start+2,num:start+3,altText:start+4,altNum:start+5,totalNum:start+6,totalText:start+7,note:start+8,warning:start+9,date:start+10,int:start+11,altInt:start+12,totalInt:start+13};
}
function row(n,vals,styles,forms={},height=23){return `<row r="${n}" ht="${height}" customHeight="1">${vals.map((v,i)=>cell(column(i+1)+n,v,Array.isArray(styles)?styles[i]??styles[0]:styles,forms[i])).join('')}</row>`;}
function rewriteNormReferences(sheet,offset){return sheet.replace(/<f>([\s\S]*?)<\/f>/g,(m,f)=>'<f>'+f.replace(/Normak!([A-Z]+)(\d+):([A-Z]+)(\d+)/g,(_,a,r,b,t)=>`Normak!${a}${Number(r)+offset}:${b}${Number(t)+offset}`)+'</f>');}
function shiftedNormRows(sheet,offset){const data=sheet.match(/<sheetData>([\s\S]*?)<\/sheetData>/)?.[1];if(!data)throw Error('Hiányzó normák.');return data.replace(/(<row r=")(\d+)(")/g,(_,a,n,b)=>a+(Number(n)+offset)+b).replace(/(<c r="[A-Z]+)(\d+)(")/g,(_,a,n,b)=>a+(Number(n)+offset)+b);}
// Restrict every visible worker sheet to the FIRST worker block of the original.
// Only out-of-block blank material is removed. Rates, row numbers, merges and column widths stay.
function firstBlock(sheet,code){
 let s=sheet.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g,(m,n)=>Number(n)<=71?m:'');
 s=s.replace(/<dimension ref="[^"]*"\/>/,'<dimension ref="A1:AW71"/>');
 s=s.replace(/<mergeCells count="\d+">([\s\S]*?)<\/mergeCells>/,(_,body)=>{const merged=[...body.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].filter(m=>Math.max(...[...m[1].matchAll(/\d+/g)].map(x=>Number(x[0])))<=71).map(m=>m[0]);return `<mergeCells count="${merged.length}">${merged.join('')}</mergeCells>`;});
 s=s.replace(/<conditionalFormatting\b[^>]*>[\s\S]*?<\/conditionalFormatting>/g,m=>m); // preserve template rules
 // The original second-worker mini-summary (AM5:AW5) must not reference deleted rows.
 s=s.replace(/<c r="(A[M-W]5)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g,(_,ref,attr)=>`<c r="${ref}"${attr}/>`);
 return s;
}
export function makeSharedWorkbookBuilder(){
 const cache=new Map();
 return async function build(snapshot){
  const snap=structuredClone(snapshot),people=validateSnapshot(snap),demo=snap.demo!==false,only=snap.approvedOnly===true;
  const all=[],normRows=[],dayRows=[],tables=[];let first;
  for(let i=0;i<people.length;i++){
   const p=people[i],rows=snap.records.filter(r=>r.employee_id===p.id),signature=JSON.stringify([p,snap.month,rows,demo,only]);
   let cached=cache.get(p.id);if(!cached||cached.signature!==signature){cached={signature,parts:await originalWorkbookParts(p,snap.month,rows,{demo,approvedOnly:only})};cache.set(p.id,cached);}
   first??=cached.parts;
   const data=reportData(p,snap.month,rows,{approvedOnly:only});tables.push(data);
   all.push({name:p.sheet,xml:firstBlock(rewriteNormReferences(cached.parts['xl/worksheets/sheet1.xml'],i*70),p.sheet)});
   normRows.push(shiftedNormRows(cached.parts['xl/worksheets/sheet3.xml'],i*70));
   for(const d of data.daily)dayRows.push([p.worker_code,p.display_name,d.date,d.version,d.status,d.work==null?null:d.work/6000,d.norm/6000,d.other/6000,d.credited/6000,d.note,d.spoiler,d.brazil]);
  }
  for(const id of cache.keys())if(!people.some(p=>p.id===id))cache.delete(id);
  const st=extendStyles(first['xl/styles.xml']);
  const headers=['Azonosító','Dolgozó','Mentett nap','Munkaóra','Normaóra','Egyéb óra','Elszámolt óra','Felső db','Alsó db','Kiegészítő db','Jóváhagyott nap','Hiányzó munkaóra'];
  const rows=[row(1,['MŰSZAKNAPLÓ • KÖZÖS HAVI ELSZÁMOLÁS'],st.title,{},37),row(2,[`${snap.month}  |  ${people.length} dolgozói fül  |  egy közös munkafüzet`],st.note,{},26),row(3,[demo?'BEMUTATÓ – KITALÁLT ADATOK. Nem HR-elszámolás.':only?'Csak a jóváhagyott napok.':'TERVEZET – jóváhagyás előtt nem végleges.'],st.warning,{},28),row(4,[`Frissítési verzió: ${snap.revision}. Fájl: ${workbookFilename(snap.month)}`],st.note),row(5,['Az app mentett adataiból készül. Kézi javítás helyett az appban módosíts; külső fájlváltozásnál a közvetlen visszaírás megáll.'],st.note,{},30),row(7,headers,st.header,{},37)];
  const totals={days:0,work:0,norm:0,other:0,credited:0,upper:0,lower:0,accessory:0,approved:0,missing:0};
  for(let i=0;i<tables.length;i++){
   const d=tables[i],n=i+8,sum=d.sum,p=people[i],ref="'"+p.sheet+"'!",approved=d.records.filter(r=>r.status==='approved').length;
   const forms={2:`COUNTIF(Naplo!$A$8:$A$${Math.max(8,7+dayRows.length)},A${n})`,3:ref+'C65',4:ref+'C66',5:ref+'C69',6:ref+'C70',7:ref+'C62',8:ref+'C63',9:`${ref}AI6+${ref}AI7+${ref}AI8`,10:`COUNTIFS(Naplo!$A$8:$A$${Math.max(8,7+dayRows.length)},A${n},Naplo!$E$8:$E$${Math.max(8,7+dayRows.length)},"Jóváhagyva")`,11:`COUNTIFS(Naplo!$A$8:$A$${Math.max(8,7+dayRows.length)},A${n},Naplo!$F$8:$F$${Math.max(8,7+dayRows.length)},"")`};
   const vals=[p.worker_code,p.display_name,d.records.length,sum.work/6000,sum.norm/6000,sum.other/6000,sum.credited/6000,sum.upper,sum.lower,sum.accessory,approved,sum.missingWork];
   rows.push(row(n,vals,[i%2?st.altText:st.text,i%2?st.altText:st.text,i%2?st.altInt:st.int,...Array(4).fill(i%2?st.altNum:st.num),...Array(5).fill(i%2?st.altInt:st.int)],forms));
   totals.days+=d.records.length;for(const k of ['work','norm','other','credited','upper','lower','accessory'])totals[k]+=sum[k];totals.approved+=approved;totals.missing+=sum.missingWork;
  }
  const end=7+people.length,totalRow=end+1,vals=['ÖSSZESEN','',totals.days,totals.work/6000,totals.norm/6000,totals.other/6000,totals.credited/6000,totals.upper,totals.lower,totals.accessory,totals.approved,totals.missing],forms={};
  for(let i=2;i<12;i++)forms[i]=`SUM(${column(i+1)}8:${column(i+1)}${end})`;
  rows.push(row(totalRow,vals,[st.totalText,st.totalText,st.totalInt,...Array(4).fill(st.totalNum),...Array(5).fill(st.totalInt)],forms,30));
  rows.push(row(totalRow+2,['A dolgozó fülét alul az azonosítója alapján választhatod ki. Minden fül a Toth.xlsx első dolgozói blokkjának másolata.'],st.note,{},30));
  rows.push(row(totalRow+3,['Forrás: felhasználó által átadott Toth.xlsx; normák és képletek az eredeti sablon alapján. Nincs valódi felhasználónév vagy jelszó ebben a mintában.'],st.note,{},30));
  const merges=['A1:L1','A2:L2','A3:L3','A4:L4','A5:L5',`A${totalRow+2}:L${totalRow+2}`,`A${totalRow+3}:L${totalRow+3}`];
  all.unshift({name:'Osszesito',xml:worksheet(rows,{cols:'<col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="25" customWidth="1"/><col min="3" max="12" width="15" customWidth="1"/>',merges,freeze:true,filter:`A7:L${end}`})});
  all.push({name:'Normak',hidden:true,xml:worksheet(normRows)});
  const meta=[row(1,['MŰSZAKNAPLÓ • RENDSZERADATOK'],st.title,{},30),row(2,['Formátum',SHARED_VERSION],st.text),row(3,['Munkafüzet-azonosító',snap.bookId,'Munkaterület',snap.workspace,'Hónap',snap.month,'Verzió',snap.revision],st.text),row(4,['Mentési mód','Egy fájl frissül. A sima letöltés csak pillanatkép; automatikus visszaíráshoz csatlakoztatott célfájl kell.'],st.note,{},35),row(5,['Adatforrás','Kizárólag az app mentett munkanapjai. Kézi Excel-módosítás nem kerül vissza az appba.'],st.note,{},30),row(7,['Azonosító','Név','Dátum','Verzió','Állapot','Munkaóra','Normaóra','Egyéb óra','Elszámolt óra','Megjegyzés','Spoiler','Brazil db'],st.header,{},33),...dayRows.map((v,i)=>row(i+8,v,st.text))];
  all.push({name:'Naplo',hidden:true,xml:worksheet(meta,{cols:'<col min="1" max="9" width="18" customWidth="1"/><col min="10" max="11" width="50" customWidth="1"/><col min="12" max="12" width="12" customWidth="1"/>'})});
  const sheetRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const parts={
   '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="json" ContentType="application/json"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+all.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
   '_rels/.rels':`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${sheetRel}officeDocument" Target="xl/workbook.xml"/></Relationships>`,
   'xl/workbook.xml':`<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${sheetRel.slice(0,-1)}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${all.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}"${s.hidden?' state="hidden"':''} r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${people.map((p,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i+1}">'${p.sheet}'!$B$2:$AJ$71</definedName>`).join('')}</definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
   'xl/_rels/workbook.xml.rels':`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${all.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${sheetRel}worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${all.length+1}" Type="${sheetRel}styles" Target="styles.xml"/><Relationship Id="rId${all.length+2}" Type="${sheetRel}theme" Target="theme/theme1.xml"/></Relationships>`,
   'xl/styles.xml':st.xml,'xl/theme/theme1.xml':first['xl/theme/theme1.xml'],
   'muszaknaplo-manifest.json':JSON.stringify({format:SHARED_VERSION,bookId:snap.bookId,workspace:snap.workspace,month:snap.month,revision:snap.revision,employees:people.map(p=>p.id)})
  };
  all.forEach((s,i)=>parts[`xl/worksheets/sheet${i+1}.xml`]=s.xml);
  return {bytes:zipFiles(parts),parts,filename:workbookFilename(snap.month),key:workbookKey(snap.workspace,snap.month),revision:snap.revision,bookId:snap.bookId,month:snap.month,employeeCount:people.length,totals};
 };
}
// Read only the small manifest of our own uncompressed exporter, not arbitrary XLSX.
// This is an identity check, not a general Excel import or permission mechanism.
export function readSharedManifest(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength),dec=new TextDecoder();
 let offset=0;while(offset+30<=b.length&&v.getUint32(offset,true)===0x04034b50){
  const method=v.getUint16(offset+8,true),size=v.getUint32(offset+18,true),nameLen=v.getUint16(offset+26,true),extra=v.getUint16(offset+28,true),start=offset+30+nameLen+extra,end=start+size;
  if(end>b.length)throw Error('Sérült Excel-fájl.');
  const name=dec.decode(b.subarray(offset+30,offset+30+nameLen));
  if(name==='muszaknaplo-manifest.json'){
   if(method!==0||size>10000)throw Error('Ez a munkafüzet megváltozott; új célfájl szükséges.');
   const m=JSON.parse(dec.decode(b.subarray(start,end)));
   if(m.format!==SHARED_VERSION||!safeKey(m.bookId)||!safeKey(m.workspace)||!validMonth(m.month)||!Number.isSafeInteger(m.revision))throw Error('Hibás munkafüzet-jelölés.');return m;
  }offset=end;
 }return null;
}
