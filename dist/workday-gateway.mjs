/** Staging adapter, NOT activated in the public demo. Inject Supabase's client.rpc.
 * Prepare once; retry the SAME command after a lost response. No hidden retry loop,
 * auth tokens, company records, service keys, or production network configuration.
 */
import {validDate,validatePayload,calculate} from './team-core.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
export function createWorkdayGateway({rpc,getActor,requestId=()=>crypto.randomUUID()}){
 const pending=new WeakSet();
 function actor(){const a=getActor();if(!a||!uuid(a.userId)||!uuid(a.workspaceId)||a.role!=='employee'||a.active!==true)throw Error('Aktív dolgozói bejelentkezés szükséges.');return {userId:a.userId,workspaceId:a.workspaceId};}
 function prepare(kind,date,expectedVersion,payload){
  if(!validDate(date)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>2147483646)throw Error('Hibás nap vagy verzió.');
  const a=actor(),id=requestId();if(!uuid(id))throw Error('Hibás mentési azonosító.');
  if(kind==='draft')validatePayload(payload);
  const command=freeze({kind,date,expectedVersion,id,actor:a,...(kind==='draft'?{payload:structuredClone(payload)}:{})});
  pending.add(command);return command;
 }
 async function send(command){
  if(!pending.has(command))throw Error('Nem ebből a munkamenetből származó mentés.');
  const a=actor();if(a.userId!==command.actor.userId||a.workspaceId!==command.actor.workspaceId)throw Error('A bejelentkezett dolgozó megváltozott.');
  const name=command.kind==='draft'?'save_workday_draft':'submit_workday';
  const params={p_date:command.date,p_expected:command.expectedVersion,p_request_id:command.id,...(command.kind==='draft'?{p_payload:structuredClone(command.payload)}:{})};
  const response=await rpc(name,params);
  // A late request cannot put data back after logout/account switch.
  const now=actor();if(now.userId!==a.userId||now.workspaceId!==a.workspaceId)throw Error('A munkamenet közben megváltozott. A választ nem jelenítjük meg.');
  if(response.error){const e=new Error(response.error.message||'A központi mentés nem sikerült.');e.code=response.error.code;throw e;}
  const r=response.data,d=r?.workday;
  if(r?.request_id!==command.id||r.applied_version!==command.expectedVersion+1||typeof r.replayed!=='boolean'||!d||d.employee_id!==a.userId||d.workspace_id!==a.workspaceId||d.work_date!==command.date||!Number.isSafeInteger(d.version)||d.version<r.applied_version||!['draft','submitted','approved'].includes(d.status))throw Error('A központi mentés válasza nem igazolható.');
  calculate(d.payload,d.norms);
  return structuredClone(r);
 }
 return {prepareDraft:(date,payload,version)=>prepare('draft',date,version,payload),prepareSubmit:(date,version)=>prepare('submit',date,version),send};
}
