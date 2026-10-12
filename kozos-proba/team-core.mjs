import {PRODUCTS as SOURCE_PRODUCTS,DOWNTIME as SOURCE_DOWNTIME} from './catalog.mjs';
export const PRODUCTS=SOURCE_PRODUCTS.map(p=>({...p,rate:p.normCentiMinutes,row:Number(p.sourceCell.match(/\d+$/)[0])}));
export const DOWNTIME=SOURCE_DOWNTIME.map(p=>({...p,row:Number(p.sourceCell.match(/\d+$/)[0])}));

export const STATUS = {draft:'Javítható',submitted:'Beküldve',approved:'Jóváhagyva'};
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number(s.slice(0,4))>=2000&&Number(s.slice(0,4))<2200&&!isNaN(d)&&d.toISOString().slice(0,10)===s;}
export function validMonth(s){return typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&validDate(s+'-01');}
export function daysInMonth(s){if(!validMonth(s))throw Error('Érvénytelen hónap.');return new Date(Number(s.slice(0,4)),Number(s.slice(5,7)),0).getDate();}
export function decimal(s,max=144000){s=String(s).trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Nemnegatív számot írj, legfeljebb két tizedessel.');const [a,b='']=s.split('.'),n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>max)throw Error('Túl nagy érték.');return n;}
export function count(s){if(!/^\d+$/.test(String(s))||Number(s)>99999)throw Error('0–99999 közötti egész darabszám szükséges.');return Number(s);}
export function emptyPayload(){return {counts:{},downtime:{},workCentiMinutes:48000,brazilCount:0,spoiler:'',note:''};}
export function validatePayload(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Hibás napi adat.');
 const allowed=['counts','downtime','workCentiMinutes','brazilCount','spoiler','note'];
 if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error('Ismeretlen napi mező.');
 for(const [field,list,max] of [['counts',PRODUCTS,99999],['downtime',DOWNTIME,144000]]){
   if(!p[field]||typeof p[field]!=='object'||Array.isArray(p[field]))throw Error('Hibás mennyiségek.');
   for(const [id,n] of Object.entries(p[field]))if(!list.some(x=>x.id===id)||!Number.isSafeInteger(n)||n<0||n>max)throw Error('Hibás kód vagy mennyiség.');
 }
 if(!Number.isSafeInteger(p.workCentiMinutes)||p.workCentiMinutes<0||p.workCentiMinutes>288000||p.workCentiMinutes%60!==0)throw Error('Érvénytelen munkaóra.');
 if(!Number.isSafeInteger(p.brazilCount)||p.brazilCount<0||p.brazilCount>99999)throw Error('Hibás Brazil-darabszám.');
 if(typeof p.note!=='string'||p.note.length>3000||typeof p.spoiler!=='string'||p.spoiler.length>1000)throw Error('Túl hosszú megjegyzés.');
 return structuredClone(p);
}
export function calculate(p,norms=Object.fromEntries(PRODUCTS.map(p=>[p.id,p.rate]))){
 validatePayload(p);let norm=0,other=0,upper=0,lower=0,accessory=0;
 for(const product of PRODUCTS){const n=p.counts[product.id]||0,rate=norms[product.id];if(!Number.isSafeInteger(rate)||rate<0||rate>1000000)throw Error('Hiányzó vagy hibás normapillanatkép.');norm+=n*rate;if(product.position==='upper')upper+=n;else if(product.position==='lower')lower+=n;else accessory+=n;}
 for(const n of Object.values(p.downtime))other+=n;
 return {norm,other,credited:norm+other,work:p.workCentiMinutes,upper,lower,accessory,ratio:p.workCentiMinutes?(norm+other)/p.workCentiMinutes*100:null};
}
export function normSnapshot(){return Object.fromEntries(PRODUCTS.map(p=>[p.id,p.rate]));}
export function monthly(records,month,employeeId,approvedOnly=false){
 if(!validMonth(month))throw Error('Érvénytelen hónap.');
 const selected=records.filter(r=>r.employee_id===employeeId&&r.work_date.slice(0,7)===month&&(!approvedOnly||r.status==='approved'));
 if(selected.some(r=>!validDate(r.work_date))||new Set(selected.map(r=>r.work_date)).size!==selected.length)throw Error('Hibás vagy ismétlődő munkanap.');
 const sums={norm:0,other:0,credited:0,work:0,upper:0,lower:0,accessory:0};
 for(const r of selected){const t=calculate(r.payload,r.norms);for(const key of Object.keys(sums))sums[key]+=t[key];}
 return {...sums,records:selected.sort((a,b)=>a.work_date.localeCompare(b.work_date)),ratio:sums.work?sums.credited/sums.work*100:null};
}
export function demoData(month=today().slice(0,7)){
 const profiles=[{id:'demo-001',worker_code:'D001',display_name:'Minta dolgozó 01',role:'employee'}, {id:'demo-002',worker_code:'D002',display_name:'Minta dolgozó 02',role:'employee'}, {id:'demo-manager',worker_code:'VEZETO',display_name:'Minta vezető',role:'manager'}];
 const records=[];
 for(const [employee,index] of profiles.slice(0,2).map((p,i)=>[p,i]))for(const day of [1,2,5]){
   const payload=emptyPayload();payload.counts={product_3243:3+index,product_3474:2,product_4074:5,product_4674:4,product_5074:3,rollo:5,polc:2,tukor:3};payload.downtime={downtime_64:1500};
   records.push({employee_id:employee.id,work_date:`${month}-${String(day).padStart(2,'0')}`,status:day===5?'submitted':'approved',version:1,payload,norms:normSnapshot(),updated_at:new Date().toISOString()});
 }
 return {profiles,records,audit:[]};
}
// XLSX writer: standard uncompressed ZIP + OOXML. No macros, external resources or formulas from user text.
const encoder=new TextEncoder();
export const xml=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function zipStore(files){
 const local=[],central=[];let offset=0;
 for(const [path,text] of Object.entries(files)){
  const name=encoder.encode(path),data=typeof text==='string'?encoder.encode(text):text,crc=crc32(data);
  const h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);local.push(h,data);
  const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,2048,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=h.length+data.length;
 }
 const centralSize=central.reduce((s,b)=>s+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 const result=new Uint8Array(offset+centralSize+22);let pos=0;for(const b of [...local,...central,end]){result.set(b,pos);pos+=b.length;}return result;
}
export function col(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function cell(ref,value,style=0,formula=null){const base=`<c r="${ref}" s="${style}"`;return formula?`${base}><f>${xml(formula)}</f><v>${Number(value)||0}</v></c>`:typeof value==='number'?`${base}><v>${value}</v></c>`:`${base} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;}
function columnOf(cellXml){const ref=cellXml.match(/ r="([A-Z]+)[0-9]+"/)[1];return [...ref].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);}
function sheet(rows,options=''){return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${options}<sheetData>${rows.map(([n,cells])=>`<row r="${n}" ht="20" customHeight="1">${cells.slice().sort((a,b)=>columnOf(a)-columnOf(b)).join('')}</row>`).join('')}</sheetData><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;}
export function workbookParts(profile,month,records,{approvedOnly=false,demo=false}={}){
 const m=monthly(records,month,profile.id,approvedOnly),nDays=daysInMonth(month),byDate=new Map(m.records.map(r=>[Number(r.work_date.slice(8)),r]));
 const details=[],detailTotals={};let detailRow=2;
 for(const record of m.records)for(const product of PRODUCTS){const qty=record.payload.counts[product.id]||0;if(!qty)continue;const amount=qty*record.norms[product.id]/100;details.push([detailRow,[cell('A'+detailRow,record.work_date),cell('B'+detailRow,product.id),cell('C'+detailRow,product.code),cell('D'+detailRow,qty,2),cell('E'+detailRow,record.norms[product.id]/100,2),cell('F'+detailRow,amount,2,`D${detailRow}*E${detailRow}`)]]);detailTotals[product.id]=(detailTotals[product.id]||0)+amount;detailRow++;}
 const main=new Map();const put=(row,ref,v,style=0,f=null)=>{if(!main.has(row))main.set(row,[]);main.get(row).push(cell(ref+row,v,style,f));};
 put(1,'B',demo?'BEMUTATÓ – KITALÁLT DOLGOZÓK':approvedOnly?'JÓVÁHAGYOTT NAPOK – vezetői ellenőrzésre':'TERVEZET – nem kizárólag jóváhagyott napok',1);
 put(2,'B',month,1);put(2,'C','ABLAGE',1);put(2,'Z',profile.display_name,1);put(2,'AF',profile.worker_code,1);
 put(3,'B','Forrás: Toth.xlsx • dolgozónkénti havi elrendezés',0);put(4,'B','Munkanap',1);put(4,'C','Perc/db',1);put(4,'AI','Összes',1);put(4,'AJ','Össz. perc',1);put(5,'B','Munkaóra / Arb.std',3);
 for(let d=1;d<=31;d++){const c=col(d+3),r=byDate.get(d);put(4,c,d<=nDays?d:'',1);put(5,c,r?r.payload.workCentiMinutes/6000:'',2);}
 put(5,'AI',m.work/6000,2,'SUM(D5:AH5)');
 const groupHeaders={9:'Aero felső 2500',16:'Giga felső 2500',24:'Hoch felső 2500',32:'Aero felső 2300',40:'Aero alsó 2500',50:'Aero alsó 2300'};
 for(const [r,label] of Object.entries(groupHeaders))put(Number(r),'B',label,4);
 for(const p of PRODUCTS){const row=p.row;put(row,'A',p.id);put(row,'B',p.code,0);const rates=[...new Set(m.records.map(r=>r.norms[p.id]))];put(row,'C',rates.length>1?'változó':(rates[0]??p.rate)/100,2);let total=0;for(let d=1;d<=31;d++){const r=byDate.get(d),qty=r?(r.payload.counts[p.id]||0):'';if(r)total+=qty;put(row,col(d+3),qty,0);}put(row,'AI',total,0,`SUM(D${row}:AH${row})`);put(row,'AJ',detailTotals[p.id]||0,2,`SUMIF(Tetelek!$B$2:$B$${Math.max(2,detailRow-1)},$A${row},Tetelek!$F$2:$F$${Math.max(2,detailRow-1)})`);}
 for(const [r,lo,hi] of [[15,10,14],[23,17,22],[31,25,30],[39,33,38],[49,41,48],[57,51,56]]){put(r,'B','Összesen',3);for(let d=1;d<=31;d++){const rec=byDate.get(d);const val=rec?PRODUCTS.filter(p=>p.row>=lo&&p.row<=hi).reduce((s,p)=>s+(rec.payload.counts[p.id]||0),0):0;put(r,col(d+3),val,3,`SUM(${col(d+3)}${lo}:${col(d+3)}${hi})`);}for(const c of ['AI','AJ'])put(r,c,PRODUCTS.filter(p=>p.row>=lo&&p.row<=hi).reduce((s,p)=>s+(c==='AI'?m.records.reduce((s,r)=>s+(r.payload.counts[p.id]||0),0):detailTotals[p.id]||0),0),c==='AJ'?2:3,`SUM(${c}${lo}:${c}${hi})`);}
 put(58,'B','Darab / Nap (felső)',3);for(let d=1;d<=31;d++){const r=byDate.get(d),c=col(d+3);put(58,c,r?calculate(r.payload,r.norms).upper:0,3,`${c}15+${c}23+${c}31+${c}39`);}put(58,'AI',m.upper,3,'SUM(D58:AH58)');
 for(const category of DOWNTIME){const row=category.row;put(row,'AJ',category.label,0);let total=0;for(let d=1;d<=31;d++){const r=byDate.get(d),v=r?(r.payload.downtime[category.id]||0)/100:'';if(r)total+=v;put(row,col(d+3),v,2);}put(row,'AI',total,2,`SUM(D${row}:AH${row})`);}
 put(69,'AJ','Brazil (külön jelölés)');for(let d=1;d<=31;d++)put(69,col(d+3),byDate.get(d)?.payload.brazilCount??'',0);put(69,'AI',m.records.reduce((s,r)=>s+r.payload.brazilCount,0),0,'SUM(D69:AH69)');
 const productRef=PRODUCTS.map(p=>'AJ'+p.row).join('+');put(59,'AJ',m.norm/100,2,productRef);
 for(const [r,label,val,formula] of [[59,'Össz. roló',m.records.reduce((s,r)=>s+(r.payload.counts.rollo||0),0),'AI6'],[60,'Polc / Regal',m.records.reduce((s,r)=>s+(r.payload.counts.polc||0),0),'AI7'],[61,'Tükör / Spiegel',m.records.reduce((s,r)=>s+(r.payload.counts.tukor||0),0),'AI8'],[62,'Össz. felső',m.upper,'AI15+AI23+AI31+AI39'],[63,'Össz. alsó',m.lower,'AI49+AI57'],[65,'Össz. munkaóra',m.work/6000,'AI5'],[66,'Normaidő (óra)',m.norm/6000,'AJ59/60'],[68,'Normaidő – munkaidő',(m.norm-m.work)/6000,'C66-C65'],[69,'Állás / egyéb (óra)',m.other/6000,'AI71/60'],[70,'Elszámolt idő (óra)',m.credited/6000,'C66+C69']]){put(r,'B',label,r===70?3:0);put(r,'C',val,2,formula);}
 put(71,'AI',m.other/100,2,'SUM(AI61:AI67)');put(72,'B','Napi állapot',1);for(let d=1;d<=31;d++)put(72,col(d+3),STATUS[byDate.get(d)?.status]||'',0);
 const dayRows=[[1,['Dátum','Állapot','Verzió','Munkaóra','Normaóra','Egyéb óra','Elszámolt óra','Megjegyzés','Spoiler','Brazil db'].map((v,i)=>cell(col(i+1)+'1',v,1))]];
 for(const [i,r] of m.records.entries()){const n=i+2,t=calculate(r.payload,r.norms);dayRows.push([n,[r.work_date,STATUS[r.status]||r.status,r.version,t.work/6000,t.norm/6000,t.other/6000,t.credited/6000,r.payload.note,r.payload.spoiler,r.payload.brazilCount].map((v,c)=>cell(col(c+1)+n,v,typeof v==='number'?2:0))]);}
 const names=['Elszamolas','Tetelek','Napok'];
 const parts={
 '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
 '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((name,i)=>`<sheet name="${name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':'<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF66"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDDDDD"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left style="thin"><color rgb="FFD0D5CD"/></left><right style="thin"><color rgb="FFD0D5CD"/></right><top style="thin"><color rgb="FFD0D5CD"/></top><bottom style="thin"><color rgb="FFD0D5CD"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
 'xl/worksheets/sheet1.xml':sheet([...main.entries()].sort((a,b)=>a[0]-b[0]),'<sheetViews><sheetView workbookViewId="0"><pane xSplit="3" ySplit="4" topLeftCell="D5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="2" hidden="1" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/><col min="4" max="34" width="8" customWidth="1"/><col min="35" max="35" width="12" customWidth="1"/><col min="36" max="36" width="34" customWidth="1"/></cols>'),
 'xl/worksheets/sheet2.xml':sheet([[1,['Dátum','Termékazonosító','Kód','Darab','Perc/db (naponként)','Összes perc'].map((v,i)=>cell(col(i+1)+'1',v,1))],...details],'<cols><col min="1" max="6" width="24" customWidth="1"/></cols>'),
 'xl/worksheets/sheet3.xml':sheet(dayRows,'<cols><col min="1" max="7" width="19" customWidth="1"/><col min="8" max="9" width="38" customWidth="1"/><col min="10" max="10" width="12" customWidth="1"/></cols>')};
 return parts;
}
export function makeWorkbook(profile,month,records,options={}){return zipStore(workbookParts(profile,month,records,options));}
