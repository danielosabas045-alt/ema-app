import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import {createServer} from 'node:http';
import pg from 'pg';

const port = 3107;
const base = 'http://127.0.0.1:' + port;
const password = 'StrongTestingPass123!';
const db = process.env.DATABASE_URL || '';
if (!/\/ema_test(?:[?]|$)/.test(db)) throw Error('Smoke tests only run against PostgreSQL database ema_test.');
const env = {
  ...process.env, PORT:String(port), NODE_ENV:'test', BASE_URL:base,
  JWT_SECRET:'This-is-a-test-only-very-long-secret-string-123456789',
  ADMIN_EMAIL:'admin.ema.test@example.org', ADMIN_PASSWORD:password,
  ADMIN_NAME:'EMA Test Admin', GMAIL_USER:'', GMAIL_APP_PASSWORD:''
};
let server, errorLog='';
async function startServer() {
  server = spawn(process.execPath,['server.js'],{env,stdio:['ignore','ignore','pipe']});
  server.stderr.on('data', chunk => { errorLog += chunk.toString().slice(0,1000); });
  for(let i=0;i<90;i++) {
    if (server.exitCode != null) throw Error('Server exited: '+errorLog);
    try { const res=await fetch(base+'/api/health'); if(res.ok) return; }
    catch {}
    await delay(150);
  }
  throw Error('Server did not start. '+errorLog);
}
async function stopServer() {
  if (!server) return;
  const p=server; server=null;
  if (p.exitCode === null) {
    p.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>p.once('exit',resolve)), delay(3000)]);
    if(p.exitCode === null) p.kill('SIGKILL');
  }
}
async function request(path,method='GET',body=null,token='') {
  const res=await fetch(base+path,{
    method,headers:{...(body ? {'Content-Type':'application/json'} : {}),...(token ? {Authorization:'Bearer '+token} : {})},
    body:body ? JSON.stringify(body) : undefined
  });
  let data=null; try { data=await res.json(); } catch {}
  return {status:res.status,data};
}
test('EMA V2 API: sessions, permissions, persistence, CRUD and security',async()=>{
  const pool = new pg.Pool({connectionString:db});
  const sent = [];
  const emailMock = createServer((req,res) => {
    if (req.url !== '/emails' || req.method !== 'POST') { res.writeHead(404); return res.end(); }
    let raw = '';
    req.on('data',chunk => { raw += String(chunk); });
    req.on('end',() => {
      try {
        sent.push({body:JSON.parse(raw),auth:req.headers.authorization});
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({id:'test-sent-'+sent.length}));
      } catch {
        res.writeHead(400); res.end();
      }
    });
  });
  try {
    await startServer();
    assert.equal((await request('/api/health')).data.database,'connected');
    assert.equal((await request('/server.js')).status,404,'server code must not be publicly served');
    assert.equal((await request('/.env.example')).status,404,'configuration files must not be served');
    assert.equal((await request('/api/records')).status,401);
    const adminLogin = await request('/api/login','POST',{email:env.ADMIN_EMAIL,password});
    assert.equal(adminLogin.status,200);
    const admin=adminLogin.data.token;
    assert.equal((await request('/api/me','GET',null,admin)).data.user.role,'admin');
    assert.equal((await request('/api/users/invite','POST',{name:'Test User',email:'testinvite@example.org',role:'user'},admin)).status,503,'no fake email without SMTP');
    const created=await request('/api/records','POST',{title:'Registro real',description:'PostgreSQL'},admin);
    assert.equal(created.status,201);
    const recordId=created.data.record.id;
    assert.ok((await request('/api/records','GET',null,admin)).data.records.some(r=>r.id===recordId));
    assert.equal((await request('/api/records/'+recordId,'PUT',{title:'Actualizado',description:'OK'},admin)).status,200);
    assert.equal((await request('/api/records/'+recordId,'DELETE',null,admin)).status,200);

    const hash=await bcrypt.hash('StrongUserPassword123!',12);
    const u1=(await pool.query("INSERT INTO users(email,name,password_hash,role,status) VALUES('ema.user1@example.org','Usuario 1',$1,'user','active') RETURNING id",[hash])).rows[0].id;
    const u2=(await pool.query("INSERT INTO users(email,name,password_hash,role,status) VALUES('ema.user2@example.org','Usuario 2',$1,'user','active') RETURNING id",[hash])).rows[0].id;
    const t1=(await request('/api/login','POST',{email:'ema.user1@example.org',password:'StrongUserPassword123!'})).data.token;
    const t2=(await request('/api/login','POST',{email:'ema.user2@example.org',password:'StrongUserPassword123!'})).data.token;
    const r1=await request('/api/records','POST',{title:'Registro privado',description:'No compartir'},t1);
    assert.equal(r1.status,201);
    const rid=r1.data.record.id;
    assert.equal((await request('/api/records','GET',null,t2)).data.records.length,0);
    assert.equal((await request('/api/records/'+rid,'PUT',{title:'Intrusión',description:'X'},t2)).status,404);
    assert.equal((await request('/api/records/'+rid,'DELETE',null,t2)).status,404);
    assert.equal((await request('/api/users','GET',null,t1)).status,403);
    assert.equal((await request('/api/users/'+u1+'/status','PATCH',{status:'disabled'},admin)).status,200);
    assert.equal((await request('/api/me','GET',null,t1)).status,401);
    assert.equal((await request('/api/users/'+u1+'/status','PATCH',{status:'active'},admin)).status,200);
    assert.equal((await request('/api/records/'+rid,'DELETE',null,t2)).status,404);
    assert.equal((await request('/api/records/'+rid,'DELETE',null,admin)).status,200);
    assert.equal((await request('/api/invite/accept','POST',{token:'a'.repeat(64),name:'Test',password:'CorrectLongPass123!'})).status,400);

    // Un reinicio NO puede resetear la contraseña administrativa.
    await stopServer();
    env.ADMIN_PASSWORD='A_DIFFERENT_PASSWORD_1234';
    await startServer();
    assert.equal((await request('/api/login','POST',{email:env.ADMIN_EMAIL,password})).status,200);
    assert.equal((await request('/api/login','POST',{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})).status,401);
    assert.ok(u2);

    // Recorrido completo del correo sin enviar mensajes reales durante CI.
    await new Promise(resolve => emailMock.listen(3108,'127.0.0.1',resolve));
    await stopServer();
    env.RESEND_API_KEY='re_automated_test_only';
    env.MAIL_FROM='sender@example.org';
    env.RESEND_TEST_URL='http://127.0.0.1:3108/emails';
    await startServer();
    assert.equal((await request('/api/health')).data.mailProvider,'resend_https');
    const adminAgain=(await request('/api/login','POST',{email:env.ADMIN_EMAIL,password})).data.token;
    const invited=await request('/api/users/invite','POST',{name:'Persona Invitada',email:'invitado.ema@example.org',role:'user'},adminAgain);
    assert.equal(invited.status,201,'provider API should accept email request');
    assert.equal(sent.length,1);
    assert.equal(sent[0].auth,'Bearer re_automated_test_only');
    assert.deepEqual(sent[0].body.to,['invitado.ema@example.org']);
    const firstToken=sent[0].body.html.match(/invite\.html\?token=([a-f0-9]{64})/)?.[1];
    assert.ok(firstToken,'email must include one-time invite URL');
    const users=(await request('/api/users','GET',null,adminAgain)).data.users;
    const invitee=users.find(u=>u.email==='invitado.ema@example.org');
    assert.ok(invitee);
    assert.equal((await request('/api/users/'+invitee.id+'/resend','POST',null,adminAgain)).status,200);
    assert.equal(sent.length,2);
    const secondToken=sent[1].body.html.match(/invite\.html\?token=([a-f0-9]{64})/)?.[1];
    assert.ok(secondToken);
    assert.notEqual(firstToken,secondToken);
    const activate={name:'Persona Invitada',password:'NewLongPassword123!'};
    assert.equal((await request('/api/invite/accept','POST',{...activate,token:firstToken})).status,400,'old token must be invalidated');
    assert.equal((await request('/api/invite/accept','POST',{...activate,token:secondToken})).status,200);
    assert.equal((await request('/api/invite/accept','POST',{...activate,token:secondToken})).status,400,'accepted token cannot be reused');
    assert.equal((await request('/api/login','POST',{email:'invitado.ema@example.org',password:activate.password})).status,200);
    assert.equal((await request('/api/users/invite','POST',{name:'Otra',email:'invitado.ema@example.org',role:'user'},adminAgain)).status,409);
  } finally {
    await stopServer();
    await pool.end();
    await new Promise(resolve=>emailMock.close(resolve));
  }
});
