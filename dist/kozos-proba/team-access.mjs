// Auth tokens are kept ONLY in memory. This module deliberately has no storage API.
// Database RLS is authoritative; hiding UI elements is not authorization.
export const PASSWORD_MIN=15;
export function checkNewPassword(password,confirm){
 if(typeof password!=='string'||password.length<PASSWORD_MIN||password.length>128)throw Error('A jelszó 15–128 karakter legyen.');
 if(confirm!==undefined&&password!==confirm)throw Error('A két új jelszó nem egyezik.');
 return password;
}
export function createSessionClient(config,{fetchImpl=globalThis.fetch,now=Date.now,onClear=()=>{}}={}){
 let session=null,epoch=0,controller=new AbortController(),refreshPromise=null;
 const stale=()=>new Error('A munkamenet megváltozott. Jelentkezz be újra.');
 function assertEpoch(e){if(e!==epoch)throw stale();}
 function clear(){session=null;epoch++;controller.abort();controller=new AbortController();refreshPromise=null;onClear();}
 function configured(){if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)||!config.publishableKey||/^sb_secret_/.test(config.publishableKey))throw Error('Az éles adatkapcsolat még nincs biztonságosan beállítva.');}
 function install(s){if(!s?.access_token||!s.refresh_token||!s.user?.id||!Number.isFinite(s.expires_in)||s.expires_in<=0)throw Error('Érvénytelen munkamenet.');session={...s,expires_at:now()+s.expires_in*1000};}
 async function wire(path,options={},token=null,e=epoch,asBlob=false){
  configured();assertEpoch(e);
  if(!/^\/(rest|auth|functions|storage)\/v1\//.test(path)||path.includes('\\')||path.includes('..'))throw Error('Érvénytelen API-útvonal.');
  const response=await fetchImpl(config.url+path,{...options,signal:typeof AbortSignal.any==='function'?AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]):controller.signal,cache:'no-store',credentials:'omit',headers:{...(options.headers||{}),apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}});
  assertEpoch(e);
  const value=asBlob&&response.ok?await response.blob():await response.json().catch(()=>null);
  assertEpoch(e);
  if(!response.ok){const error=new Error(response.status===401?'A belépés lejárt. Jelentkezz be újra.':value?.message||value?.error_description||value?.error||'A kérés nem sikerült.');error.status=response.status;error.code=value?.code;throw error;}
  return value;
 }
 async function ensure(){
  if(!session)throw stale();const e=epoch;
  if(session.expires_at>now()+30000)return session.access_token;
  if(!refreshPromise){
   const token=session.refresh_token;
   refreshPromise=wire('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:token})},null,e)
    .then(s=>{assertEpoch(e);install(s);return s.access_token;})
    .catch(error=>{if(e===epoch)clear();throw error;})
    .finally(()=>{if(e===epoch)refreshPromise=null;});
  }
  const token=await refreshPromise;assertEpoch(e);return token;
 }
 async function request(path,options={},asBlob=false){const e=epoch;try{const token=await ensure();assertEpoch(e);return await wire(path,options,token,e,asBlob);}catch(error){if(error.status===401&&e===epoch)clear();throw error;}}
 async function signIn(code,password){
  configured();clear();const e=epoch;
  code=String(code).trim().toLowerCase();
  if(!/^[a-z0-9_-]{2,32}$/.test(code)||typeof password!=='string'||!password||password.length>128)throw Error('Sikertelen belépés. Ellenőrizd az azonosítót és a jelszót.');
  if(!/^[a-z0-9.-]+$/.test(config.loginDomain||''))throw Error('Érvénytelen belépési beállítás.');
  try{
   const s=await wire('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:code+'@'+config.loginDomain,password})},null,e);
   assertEpoch(e);install(s);
   const rows=await request('/rest/v1/profiles?select=*&id=eq.'+encodeURIComponent(s.user.id));
   if(rows?.length!==1||rows[0].id!==s.user.id||!rows[0].active||!['employee','manager'].includes(rows[0].role))throw Error('Hozzáférés megtagadva.');
   return rows[0];
  }catch(error){if(e===epoch)clear();throw new Error('Sikertelen belépés. Ellenőrizd az azonosítót és a jelszót, illetve a fiók engedélyezését.');}
 }
 async function signOut(){
  const token=session?.access_token;clear();
  if(!token)return true;
  try{const response=await fetchImpl(config.url+'/auth/v1/logout?scope=local',{method:'POST',cache:'no-store',credentials:'omit',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token}});return response.ok;}catch{return false;}
 }
 async function changePassword(currentPassword,newPassword,confirmation){
  checkNewPassword(newPassword,confirmation);const e=epoch;await ensure();assertEpoch(e);const id=session.user.id,email=session.user.email;
  if(!email||!currentPassword)throw Error('Add meg a jelenlegi jelszavadat is.');
  let proof;
  try{proof=await wire('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:currentPassword})},null,e);}catch{throw Error('A jelenlegi jelszó ellenőrzése nem sikerült.');}
  try{
   if(proof.user?.id!==id)throw Error('Nem a saját fiókodhoz tartozó belépés.');
   await wire('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:newPassword})},proof.access_token,e);
  }finally{
   if(proof.access_token)await fetchImpl(config.url+'/auth/v1/logout?scope=local',{method:'POST',cache:'no-store',headers:{apikey:config.publishableKey,Authorization:'Bearer '+proof.access_token}}).catch(()=>{});
  }
  assertEpoch(e);await signOut();
 }
 return Object.freeze({signIn,signOut,changePassword,json:request,blob:(path,options)=>request(path,options,true),clear,get epoch(){return epoch;},get signedIn(){return session!==null;}});
}
