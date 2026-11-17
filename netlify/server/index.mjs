import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { db } from '../../db/index.ts';
import { pockets, entries, sessions, credentials, challenges } from '../../db/schema.ts';
import { MAX_MONEY, validatePocket, validDate, colombiaToday, dueDate } from '../../public/finance-math.mjs';

export const config={path:'/api/*'};
const hash=s=>createHash('sha256').update(s).digest('hex');
const cookie=(req,name)=>{const v=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));return v?decodeURIComponent(v.slice(name.length+1)):''};
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const expire=()=> 'gl_finance=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
async function session(owner) {
  const token=randomBytes(32).toString('base64url');
  await db.insert(sessions).values({id:hash(token),owner,expiresAt:new Date(Date.now()+8*3600000)});
  return json({ok:true},200,{'Set-Cookie':`gl_finance=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
}
async function auth(req) {
  const token=cookie(req,'gl_finance');if(!token)return null;
  const [s]=await db.select().from(sessions).where(and(eq(sessions.id,hash(token)),gt(sessions.expiresAt,new Date())));return s?.owner||null;
}
async function consumeChallenge(req,kind) {
  const id=cookie(req,'gl_challenge');
  const [c]=await db.delete(challenges).where(and(eq(challenges.id,id),eq(challenges.kind,kind),gt(challenges.expiresAt,new Date()))).returning();
  if(!c||c.origin!==new URL(req.url).origin)throw Error('La solicitud venció. Inténtalo otra vez.');return c;
}
async function challengeResponse(options,owner,kind,origin) {
  const id=randomUUID();await db.insert(challenges).values({id,owner,kind,origin,challenge:options.challenge,expiresAt:new Date(Date.now()+300000)});
  return json(options,200,{'Set-Cookie':`gl_challenge=${id}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=300`});
}
async function state(owner) {
  const ps=await db.select().from(pockets).where(eq(pockets.owner,owner));
  const es=await db.select().from(entries).where(eq(entries.owner,owner));
  const keys=await db.select({id:credentials.id}).from(credentials).where(eq(credentials.owner,owner));
  return json({pockets:ps.sort((a,b)=>a.createdAt-b.createdAt),entries:es.sort((a,b)=>b.createdAt-a.createdAt),hasPasskey:keys.length>0});
}
async function body(req) {const raw=await req.text();if(raw.length>100000)throw Error('La solicitud es demasiado grande.');try{return JSON.parse(raw)}catch{throw Error('Revisa los datos enviados.')}}
async function owned(owner,id){const [p]=await db.select().from(pockets).where(and(eq(pockets.id,id),eq(pockets.owner,owner)));if(!p)throw Error('No se encontró el bolsillo.');return p;}
export default async function handler(req) {
 const url=new URL(req.url), path=url.pathname, method=req.method;
 if(method!=='GET' && req.headers.get('origin')!==url.origin)return json({error:'Solicitud no permitida.'},403);
 try {
  if(path==='/api/auth/session'&&method==='POST') {
    // Validate the Identity cookie with GoTrue; never trust an unverified JWT payload.
    const token=cookie(req,'nf_jwt');if(!token)return json({error:'Inicia sesión con tu correo y contraseña.'},401);
    const response=await fetch(new URL('/.netlify/identity/user',url.origin),{headers:{Authorization:`Bearer ${token}`},redirect:'error'});
    if(!response.ok)return json({error:'La sesión venció. Vuelve a ingresar.'},401);
    const user=await response.json();if(!user.id||!user.confirmed_at)return json({error:'Confirma tu correo antes de ingresar.'},401);
    return session(user.id);
  }
  if(path==='/api/auth/logout'&&method==='POST') {
    const token=cookie(req,'gl_finance');if(token)await db.delete(sessions).where(eq(sessions.id,hash(token)));
    return json({ok:true},200,{'Set-Cookie':expire()});
  }
  if(path==='/api/auth/passkey/options'&&method==='POST')return challengeResponse(await generateAuthenticationOptions({rpID:url.hostname,userVerification:'required'}),null,'login',url.origin);
  if(path==='/api/auth/passkey/verify'&&method==='POST') {
    const c=await consumeChallenge(req,'login'),answer=await body(req);
    const [key]=await db.select().from(credentials).where(eq(credentials.id,answer.id));
    if(!key)return json({error:'Esta llave no está registrada. Ingresa con contraseña.'},401);
    const result=await verifyAuthenticationResponse({response:answer,expectedChallenge:c.challenge,expectedOrigin:url.origin,expectedRPID:url.hostname,requireUserVerification:true,credential:{id:key.id,publicKey:new Uint8Array(Buffer.from(key.publicKey,'base64url')),counter:key.counter,transports:key.transports}});
    if(!result.verified)return json({error:'No se pudo verificar el acceso.'},401);
    await db.update(credentials).set({counter:result.authenticationInfo.newCounter}).where(eq(credentials.id,key.id));return session(key.owner);
  }
  const owner=await auth(req);if(!owner)return json({error:'Desbloquea tus finanzas para continuar.'},401);
  if(path==='/api/finance'&&method==='GET')return state(owner);
  if(path==='/api/auth/passkey/register-options'&&method==='POST') {
    const keys=await db.select().from(credentials).where(eq(credentials.owner,owner));
    const options=await generateRegistrationOptions({rpName:'GlowLife',rpID:url.hostname,userName:'Mis finanzas GlowLife',userID:new TextEncoder().encode(owner),attestationType:'none',excludeCredentials:keys.map(k=>({id:k.id,transports:k.transports})),authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'}});
    return challengeResponse(options,owner,'register',url.origin);
  }
  if(path==='/api/auth/passkey/register'&&method==='POST') {
    const c=await consumeChallenge(req,'register');if(c.owner!==owner)return json({error:'Acceso no permitido.'},403);
    const result=await verifyRegistrationResponse({response:await body(req),expectedChallenge:c.challenge,expectedOrigin:url.origin,expectedRPID:url.hostname,requireUserVerification:true});
    if(!result.verified||!result.registrationInfo)throw Error('No se pudo registrar el dispositivo.');
    const key=result.registrationInfo.credential;await db.insert(credentials).values({id:key.id,owner,publicKey:Buffer.from(key.publicKey).toString('base64url'),counter:key.counter,transports:key.transports||[]});return json({ok:true});
  }
  if(path==='/api/auth/passkey'&&method==='DELETE'){await db.delete(credentials).where(eq(credentials.owner,owner));return json({ok:true});}
  if(path==='/api/finance/import'&&method==='POST') {
    const x=await body(req);
    if(!Array.isArray(x?.pockets)||!Array.isArray(x?.tx)||x.pockets.length>200||x.tx.length>1000)throw Error('Revisa el registro anterior; admite hasta 200 bolsillos y 1.000 movimientos por importación.');
    const client=await getDatabase().pool.connect();
    try{
      await client.query('BEGIN');
      for(const p of x.pockets){
        if(typeof p.n!=='string'||!p.n.trim()||!Number.isSafeInteger(p.v)||p.v<0||p.v>MAX_MONEY||!Number.isSafeInteger(p.g)||p.g<0||p.g>MAX_MONEY)throw Error('Revisa los montos del registro anterior; deben ser pesos enteros no negativos.');
        const id=hash('legacy-pocket:'+owner+':'+p.id);
        await client.query('INSERT INTO finance_pockets (id,owner,name,kind,category,description,target,balance,contribution,frequency,first_date,cycle) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING',[id,owner,p.n.slice(0,100),'reserve','Ahorro general','Registro importado. Revisa su precio, descripción y plan de abonos.',p.g||Math.max(p.v,1),p.v,Math.max(1,Math.ceil((p.g||p.v||1)/12)),'monthly',colombiaToday(),colombiaToday().slice(0,7)]);
        if(p.v)await client.query('INSERT INTO finance_entries (id,owner,pocket_id,type,amount,note,date) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',[hash('legacy-initial:'+owner+':'+p.id),owner,id,'initial',p.v,'Saldo al importar; los movimientos anteriores son solo informativos.',colombiaToday()]);
      }
      for(let i=0;i<x.tx.length;i++){
        const t=x.tx[i],p=x.pockets.find(p=>p.n===t.p);
        if(!p)continue;
        if(!Number.isSafeInteger(t.a)||t.a<=0||t.a>MAX_MONEY||!validDate(t.d)||!['i','g'].includes(t.t))throw Error('Revisa los movimientos anteriores y sus fechas.');
        await client.query('INSERT INTO finance_entries (id,owner,pocket_id,type,amount,note,date) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',[hash('legacy-entry:'+owner+':'+i+':'+t.d+':'+t.a),owner,hash('legacy-pocket:'+owner+':'+p.id),t.t==='i'?'legacy_income':'legacy_expense',t.a,String(t.n||'Movimiento anterior').slice(0,500),t.d]);
      }
      await client.query('COMMIT');return json({ok:true});
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(path==='/api/finance/pockets'&&method==='POST') {
    const x=await body(req),values=validatePocket(x),initial=x.initial||0;
    if(!Number.isSafeInteger(initial)||initial<0||initial>MAX_MONEY)throw Error('Revisa el saldo inicial.');
    if(!/^[0-9a-f-]{36}$/.test(x.id||''))throw Error('Vuelve a abrir el formulario.');
    const id=x.id,cycle=colombiaToday().slice(0,7);
    const [existing]=await db.select({owner:pockets.owner}).from(pockets).where(eq(pockets.id,id));
    if(existing){if(existing.owner===owner)return json({id});return json({error:'Vuelve a abrir el formulario.'},409);}
    // Use a real SQL transaction for the initial balance and its audit entry.
    const client=await getDatabase().pool.connect();
    try{await client.query('BEGIN');await client.query('INSERT INTO finance_pockets (id,owner,name,kind,category,description,target,balance,contribution,frequency,first_date,cycle) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,owner,values.name,values.kind,values.category,values.description,values.target,initial,values.contribution,values.frequency,values.firstDate,cycle]);if(initial)await client.query('INSERT INTO finance_entries (id,owner,pocket_id,type,amount,note,date) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),owner,id,'initial',initial,'Saldo inicial declarado',colombiaToday()]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    return json({id},201);
  }
  const match=path.match(/^\/api\/finance\/pockets\/([\w-]+)(?:\/(entry|image|cycle))?$/);
  if(match) {
    const [,id,action]=match,p=await owned(owner,id);
    if(!action&&method==='PATCH') {
      const values=validatePocket(await body(req));
      // Preserve the schedule anchor so past confirmations keep their original meaning.
      if(values.frequency!==p.frequency||values.firstDate!==p.firstDate){throw Error('Para cambiar las fechas del plan, conserva este historial y crea un nuevo bolsillo. Puedes editar el precio y el valor del abono.');}
      await db.update(pockets).set(values).where(and(eq(pockets.id,id),eq(pockets.owner,owner)));return state(owner);
    }
    if(!action&&method==='DELETE') {
      await db.delete(pockets).where(and(eq(pockets.id,id),eq(pockets.owner,owner)));
      if(p.image)await getStore('finance-images').delete(p.image);return json({ok:true});
    }
    if(action==='image'&&method==='PUT') {
      const file=await req.arrayBuffer();const bytes=new Uint8Array(file);
      if(file.byteLength>5*1024*1024 || file.byteLength<4 || !(bytes[0]===0xff&&bytes[1]===0xd8))throw Error('Sube una imagen JPG de máximo 5 MB.');
      const key=`${owner}/${id}/${randomUUID()}.jpg`;await getStore('finance-images').set(key,file);
      await db.update(pockets).set({image:key}).where(and(eq(pockets.id,id),eq(pockets.owner,owner)));
      if(p.image)await getStore('finance-images').delete(p.image);return json({ok:true});
    }
    if(action==='image'&&method==='GET') {
      if(!p.image)return new Response(null,{status:404});const image=await getStore('finance-images').get(p.image,{type:'arrayBuffer'});
      if(!image)return new Response(null,{status:404});return new Response(image,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(action==='image'&&method==='DELETE') {
      await db.update(pockets).set({image:null}).where(and(eq(pockets.id,id),eq(pockets.owner,owner)));if(p.image)await getStore('finance-images').delete(p.image);return json({ok:true});
    }
    if(action==='entry'&&method==='POST') {
      const x=await body(req);
      if(!['deposit','withdraw','skip'].includes(x.type)||!validDate(x.date)||x.date>colombiaToday()||typeof x.note!=='string'||x.note.length>500)throw Error('Revisa el movimiento y su fecha; no se registran aportes futuros.');
      if(x.type!=='skip'&&(!Number.isSafeInteger(x.amount)||x.amount<=0||x.amount>MAX_MONEY))throw Error('El monto debe ser un valor positivo en pesos enteros.');
      if(!/^[\w-]{10,100}$/.test(x.id||''))throw Error('Vuelve a abrir el formulario.');
      const client=await getDatabase().pool.connect();
      try {
        await client.query('BEGIN');
        const {rows:[locked]}=await client.query('SELECT * FROM finance_pockets WHERE id=$1 AND owner=$2 FOR UPDATE',[id,owner]);if(!locked)throw Error('Bolsillo no encontrado.');
        const {rows:existing}=await client.query('SELECT id FROM finance_entries WHERE id=$1 AND owner=$2',[x.id,owner]);if(existing.length){await client.query('COMMIT');return json({ok:true})}
        let occurrence=null;
        if(x.scheduled) {
          const current={firstDate:locked.first_date,frequency:locked.frequency,nextIndex:locked.next_index};
          const due=dueDate(current);occurrence=`${locked.next_index}:${due}`;
          if(due>colombiaToday()||x.occurrence!==occurrence)throw Error('Este abono ya cambió. Actualiza tus bolsillos.');
        }else if(x.type==='skip')throw Error('Solo se puede omitir un abono programado.');
        const delta=x.type==='deposit'?x.amount:x.type==='withdraw'?-x.amount:0;
        if(Number(locked.balance)+delta<0)throw Error('El retiro no puede superar el saldo registrado.');
        if(Number(locked.balance)+delta>MAX_MONEY)throw Error('El saldo supera el máximo permitido.');
        if(x.type==='withdraw'&&x.scheduled)throw Error('Un abono programado no puede ser un retiro.');
        if(x.type==='deposit'&&x.scheduled&&Number(locked.balance)>=Number(locked.target))throw Error('Esta meta ya está completa.');
        if(x.type==='deposit'&&x.scheduled&&x.amount!==Math.min(Number(locked.contribution),Math.max(0,Number(locked.target)-Number(locked.balance))))throw Error('El valor del abono cambió. Actualiza tus bolsillos.');
        await client.query('INSERT INTO finance_entries (id,owner,pocket_id,type,amount,note,date,occurrence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[x.id,owner,id,x.type,x.type==='skip'?0:x.amount,x.note,x.date,occurrence]);
        await client.query('UPDATE finance_pockets SET balance=balance+$1,next_index=next_index+$2 WHERE id=$3 AND owner=$4',[delta,x.scheduled?1:0,id,owner]);await client.query('COMMIT');return json({ok:true});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }
    if(action==='cycle'&&method==='POST') {
      if(p.kind!=='household'||p.cycle===colombiaToday().slice(0,7))throw Error('Este gasto ya corresponde al mes actual.');
      if(p.balance!==0)throw Error('Registra primero el pago o retiro del mes anterior para dejar el saldo en cero.');
      let index=p.nextIndex;while(index<100000&&dueDate(p,index)<colombiaToday().slice(0,7)+'-01')index++;
      await db.update(pockets).set({cycle:colombiaToday().slice(0,7),nextIndex:index}).where(and(eq(pockets.id,id),eq(pockets.owner,owner)));return json({ok:true});
    }
  }
  return json({error:'Ruta no encontrada.'},404);
 }catch(e){
  // Never include infrastructure errors, request bodies or credentials in responses/logs.
  const safe=/^(Escribe|Selecciona|El |La |Los |Revisa|Para |Sube|No se |Esta |Este |Un |Solo |Registra|Vuelve|Bolsillo)/.test(e.message||'');
  return json({error:safe?e.message:'No se pudo guardar el cambio. Inténtalo de nuevo.'},400);
 }
}
