import {validMonth,validDate,calculate} from './team-core.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x);
export function pilotConfigValid(c){
 if(c?.enabled!==true||c.environment!=='staging'||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url)||!c.loginDomain?.endsWith('.invalid'))return false;
 if(/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(c.publishableKey))return true;
 try{const part=c.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(part)).role==='anon';}catch{return false;}
}
export function createPilotApi(session,getActor){
 function actor(){const a=getActor();if(!a?.active||!uuid(a.id)||!uuid(a.workspace_id))throw Error('Új bejelentkezés szükséges.');return a;}
 function same(a){const n=actor();if(n.id!==a.id||n.workspace_id!==a.workspace_id||n.role!==a.role)throw Error('A munkamenet megváltozott.');}
 async function rpc(name,params){return session.json('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(params)});}
 async function month(month){
  if(!validMonth(month))throw Error('Hibás hónap.');const a=actor();const start=month+'-01',next=new Date(Number(month.slice(0,4)),Number(month.slice(-2)),1,12);const end=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-01';
  const out=await session.json(`/rest/v1/workdays?select=*&workspace_id=eq.${a.workspace_id}&work_date=gte.${start}&work_date=lt.${end}&order=employee_id,work_date&limit=1000`);same(a);
  if(!Array.isArray(out)||out.length>=1000)throw Error('A havi lekérés hiányos. Lapozás/ellenőrzés szükséges.');
  for(const r of out){if(r.workspace_id!==a.workspace_id||a.role!=='manager'&&r.employee_id!==a.id||!validDate(r.work_date)||r.work_date.slice(0,7)!==month)throw Error('Idegen napi válasz.');calculate(r.payload,r.norms);}return out;
 }
 async function profiles(){const a=actor(),rows=await session.json(`/rest/v1/profiles?select=id,workspace_id,worker_code,display_name,role,active&workspace_id=eq.${a.workspace_id}&order=worker_code&limit=200`);same(a);if(!Array.isArray(rows)||rows.length>=200||rows.some(p=>p.workspace_id!==a.workspace_id||a.role!=='manager'&&p.id!==a.id))throw Error('Hibás dolgozói lista.');return rows;}
 async function send(f){const a=actor();if(a.role!=='employee'||f.actor.id!==a.id||f.actor.workspace_id!==a.workspace_id)throw Error('Idegen függő mentés.');const value=await rpc(f.kind==='draft'?'save_workday_draft':'submit_workday',{p_date:f.date,p_expected:f.expected,p_request_id:f.id,...(f.kind==='draft'?{p_payload:f.payload}:{})});same(a);return value;}
 async function decide(row,action,reason=''){const a=actor();if(a.role!=='manager'||row.workspace_id!==a.workspace_id||!['approve','reopen'].includes(action))throw Error('Vezetői jogosultság szükséges.');const value=await rpc('manager_decide',{p_employee:row.employee_id,p_date:row.work_date,p_expected:row.version,p_action:action,p_reason:reason});same(a);return value;}
 async function book(month,action='refresh'){
  if(!validMonth(month))throw Error('Hibás hónap.');const a=actor();if(action==='download'&&a.role!=='manager')throw Error('A közös Excel csak a főnök számára érhető el.');
  const options={method:'POST',body:JSON.stringify({month,action})};const out=await (action==='download'?session.blob('/functions/v1/team-workbook',options):session.json('/functions/v1/team-workbook',options));same(a);return out;
 }
 async function job(month){const a=actor();if(a.role!=='manager'||!validMonth(month))throw Error('Hozzáférés megtagadva.');const rows=await session.json(`/rest/v1/team_workbook_jobs?select=generation,processed_generation,updated_at&workspace_id=eq.${a.workspace_id}&report_month=eq.${month}-01`);same(a);return rows[0]??null;}
 return Object.freeze({month,profiles,send,decide,book,job,rpc});
}
