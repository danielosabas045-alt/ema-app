'use strict';
require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const config = {
  port: Number(process.env.PORT || 3000),
  environment: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  adminEmail: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: String(process.env.ADMIN_NAME || 'Administrador EMA').trim(),
  gmailUser: String(process.env.GMAIL_USER || '').trim().toLowerCase(),
  gmailPassword: String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, ''),
  baseUrl: (process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/+$/, '')
};
if (!config.databaseUrl) throw Error('Falta DATABASE_URL; configurá PostgreSQL.');
if (!config.jwtSecret || config.jwtSecret.length < 32) throw Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminEmail)) throw Error('Configurá ADMIN_EMAIL correctamente.');
if (config.environment === 'production' && !config.baseUrl.startsWith('https://')) throw Error('BASE_URL debe usar HTTPS en producción.');
if (!!config.gmailUser !== !!config.gmailPassword) throw Error('GMAIL_USER y GMAIL_APP_PASSWORD deben configurarse juntos.');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '32kb' }));

const pool = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
const mailer = config.gmailPassword ? nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.gmailUser, pass: config.gmailPassword },
  connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000
}) : null;
const q = (sql, params = []) => pool.query(sql, params);
const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const bad = (res, status, error) => res.status(status).json({ error });
const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const SHA256 = text => crypto.createHash('sha256').update(text).digest('hex');
const html = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const editableRole = ['user', 'moderator'];
const privileged = user => user.role === 'admin' || user.role === 'moderator';

async function init() {
  await q("CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT, role TEXT NOT NULL CHECK(role IN ('admin','moderator','user')), status TEXT NOT NULL DEFAULT 'pending', invite_token_hash TEXT, invite_expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ)");
  await q("CREATE TABLE IF NOT EXISTS records (id BIGSERIAL PRIMARY KEY, owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await q("CREATE TABLE IF NOT EXISTS invitations (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ, last_error TEXT)");
  await q("CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, subject TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await q('ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await q('CREATE INDEX IF NOT EXISTS records_created_idx ON records(created_at DESC)');
  await q('CREATE INDEX IF NOT EXISTS records_owner_idx ON records(owner_user_id,created_at DESC)');
  await q('CREATE INDEX IF NOT EXISTS invite_history_idx ON invitations(sent_at DESC)');
  await q('CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC)');
  const current = (await q('SELECT id,role FROM users WHERE email=$1', [config.adminEmail])).rows[0];
  if (!current) {
    if (config.adminPassword.length < 12) throw Error('Para crear el administrador, ADMIN_PASSWORD debe tener 12 caracteres como mínimo.');
    const hash = await bcrypt.hash(config.adminPassword, 12);
    await q("INSERT INTO users(email,name,password_hash,role,status,accepted_at) VALUES($1,$2,$3,'admin','active',NOW()) ON CONFLICT(email) DO NOTHING", [config.adminEmail, config.adminName, hash]);
    console.log('Administrador inicial creado.');
  } else if (current.role !== 'admin') {
    throw Error('ADMIN_EMAIL corresponde a otra cuenta. Resolver manualmente antes de iniciar.');
  }
  // Nunca volver a reemplazar la contraseña del administrador al reiniciar.
}

async function audit(actor, action, subject = '') {
  await q('INSERT INTO audit_events(actor_user_id,action,subject) VALUES($1,$2,$3)', [actor || null, action, String(subject).slice(0,180)]);
}
function tokenFor(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, { expiresIn: '8h', issuer: 'ema-database', audience: 'ema-users' });
}
async function authenticate(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const t = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const jwtPayload = jwt.verify(t, config.jwtSecret, { issuer: 'ema-database', audience: 'ema-users' });
    const user = (await q('SELECT id,email,name,role,status FROM users WHERE id=$1', [jwtPayload.sub])).rows[0];
    if (!user || user.status !== 'active') return bad(res,401,'Sesión caducada o cuenta deshabilitada.');
    req.user = user; next();
  } catch { return bad(res,401,'Sesión no válida. Volvé a iniciar sesión.'); }
}
function adminOnly(req, res, next) { if (req.user.role !== 'admin') return bad(res,403,'Acceso exclusivo del administrador.'); next(); }

// Rate limiting en memoria para una sola instancia. En despliegues multinodo usar Redis.
const rate = new Map();
function limit(maxHits, periodMs, keyPrefix) {
  return (req, res, next) => {
    const key = keyPrefix + ':' + req.ip;
    const now = Date.now();
    const old = rate.get(key);
    const item = !old || old.reset <= now ? { count: 0, reset: now + periodMs } : old;
    item.count++; rate.set(key, item);
    if (rate.size > 15000) for (const [k,v] of rate) if (v.reset <= now) rate.delete(k);
    if (item.count > maxHits) return bad(res,429,'Demasiados intentos. Intentá de nuevo en unos minutos.');
    next();
  };
}
function emailTemplate(name, url, role) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="background:#eef4fb;font-family:Arial,sans-serif;padding:24px"><main style="max-width:550px;margin:auto;padding:32px;border-radius:14px;background:#fff;color:#142337"><h1 style="color:#0878bb">EMA DATABASE</h1><h2>Hola, '+html(name)+'</h2><p>Te invitaron a colaborar en EMA con el rol de <strong>'+html(role)+'</strong>.</p><p>Tu enlace personal vence en 48 horas.</p><p><a style="display:inline-block;background:#0878bb;color:white;padding:14px 20px;text-decoration:none;border-radius:8px" href="'+html(url)+'">Aceptar invitación</a></p><p style="font-size:12px;color:#697a8b">Si no esperabas esta invitación, ignorá el mensaje. No compartás el enlace.</p></main></body></html>';
}
async function issueInvitation(user, actorId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = SHA256(raw);
  const exp = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await q("UPDATE users SET status='pending',invite_token_hash=$1,invite_expires_at=$2 WHERE id=$3 AND status='pending'", [hashed, exp, user.id]);
  await q('INSERT INTO invitations(user_id,email,role,token_hash) VALUES($1,$2,$3,$4)', [user.id,user.email,user.role,hashed]);
  const target = config.baseUrl + '/invite.html?token=' + raw;
  try {
    const info = await mailer.sendMail({
      from: { name:'EMA Database', address:config.gmailUser },
      to:user.email,
      subject:'Invitación para entrar a EMA Database',
      text:'Hola '+user.name+'. Te invitaron a EMA como '+user.role+'. Aceptá antes de 48 horas: '+target,
      html:emailTemplate(user.name,target,user.role)
    });
    await audit(actorId, 'invitation.smtp_accepted', user.email);
    return { ok:true, email:user.email, message:'Gmail SMTP aceptó el envío. Revisá la bandeja de entrada y spam.' };
  } catch (err) {
    await q('UPDATE invitations SET last_error=$1 WHERE token_hash=$2', [String(err.message || err).slice(0,500),hashed]);
    await audit(actorId,'invitation.failed',user.email);
    const ex = Error('No se pudo enviar el correo. Verificá la configuración SMTP del servidor.'); ex.status=502; throw ex;
  }
}

const PUBLIC_FILES = {
  '/': 'index.html', '/index.html':'index.html', '/app.js':'app.js', '/styles.css':'styles.css',
  '/invite.html':'invite.html', '/invite.js':'invite.js'
};
for (const [route, filename] of Object.entries(PUBLIC_FILES)) {
  app.get(route, (_req,res) => res.sendFile(path.join(__dirname,filename)));
}
app.get('/api/health', run(async(_req,res) => {
  await q('SELECT 1');
  res.json({ok:true,database:'connected',emailConfigured:!!mailer});
}));
app.post('/api/login', limit(12, 15*60*1000,'login'), run(async(req,res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!emailValid(email) || !password || password.length > 200) return bad(res,400,'Correo o contraseña incorrectos.');
  const user = (await q('SELECT id,email,name,password_hash,role,status FROM users WHERE email=$1',[email])).rows[0];
  if (!user || user.status !== 'active' || !user.password_hash || !(await bcrypt.compare(password,user.password_hash))) return bad(res,401,'Correo o contraseña incorrectos.');
  await audit(user.id,'auth.login',user.email);
  res.json({token:tokenFor(user),user:{id:user.id,email:user.email,name:user.name,role:user.role}});
}));
app.get('/api/me',authenticate,(req,res) => res.json({user:req.user}));
app.get('/api/dashboard',authenticate,run(async(req,res) => {
  const isAdmin = req.user.role === 'admin';
  const a = await Promise.all([
    q('SELECT COUNT(*)::int AS n FROM records' + (privileged(req.user)?'':' WHERE owner_user_id=$1'),privileged(req.user)?[]:[req.user.id]),
    isAdmin?q("SELECT COUNT(*)::int AS n FROM users WHERE role<>'admin'"):Promise.resolve({rows:[{n:null}]}),
    isAdmin?q('SELECT COUNT(*)::int AS n FROM invitations'):Promise.resolve({rows:[{n:null}]})
  ]);
  res.json({records:a[0].rows[0].n,users:a[1].rows[0].n,invitations:a[2].rows[0].n});
}));
app.get('/api/users',authenticate,adminOnly,run(async(_req,res) => {
  const data = await q("SELECT id,name,email,role,status,created_at FROM users WHERE role<>'admin' ORDER BY created_at DESC");
  res.json({users:data.rows});
}));
app.post('/api/users/invite',limit(20,60*60*1000,'invite'),authenticate,adminOnly,run(async(req,res) => {
  if (!mailer) return bad(res,503,'SMTP Gmail no está configurado en el servidor.');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const role = String(req.body?.role || 'user');
  if (!emailValid(email) || name.length < 2 || name.length > 120 || !editableRole.includes(role)) return bad(res,400,'Revisá nombre, correo y rol.');
  if (email === config.adminEmail) return bad(res,409,'Ese correo pertenece al administrador.');
  const prior = (await q('SELECT id,status,role FROM users WHERE email=$1',[email])).rows[0];
  if (prior && prior.status !== 'pending') return bad(res,409,'La cuenta ya existe y no admite otra invitación.');
  let user;
  if (prior) {
    user = (await q('UPDATE users SET name=$1,role=$2 WHERE id=$3 RETURNING id,email,name,role',[name,role,prior.id])).rows[0];
  } else {
    user = (await q("INSERT INTO users(email,name,role,status) VALUES($1,$2,$3,'pending') ON CONFLICT(email) DO NOTHING RETURNING id,email,name,role",[email,name,role])).rows[0];
    if (!user) return bad(res,409,'El usuario ya fue creado. Actualizá y reintentá.');
  }
  const result = await issueInvitation(user,req.user.id);
  res.status(201).json(result);
}));
app.post('/api/users/:id/resend',limit(20,60*60*1000,'resend'),authenticate,adminOnly,run(async(req,res) => {
  if (!mailer) return bad(res,503,'SMTP Gmail no está configurado.');
  const user = (await q("SELECT id,email,name,role FROM users WHERE id=$1 AND status='pending' AND role<>'admin'",[req.params.id])).rows[0];
  if (!user) return bad(res,404,'No se encontró una invitación pendiente.');
  res.json(await issueInvitation(user,req.user.id));
}));
app.patch('/api/users/:id/status',authenticate,adminOnly,run(async(req,res) => {
  const status = String(req.body?.status || '');
  if (!['active','disabled'].includes(status)) return bad(res,400,'Estado inválido.');
  const result = await q("UPDATE users SET status=$1 WHERE id=$2 AND role<>'admin' AND status IN ('active','disabled') RETURNING id,email,status",[status,req.params.id]);
  const user = result.rows[0];
  if (!user) return bad(res,404,'Cuenta no encontrada o todavía pendiente.');
  await audit(req.user.id,'user.status.'+status,user.email);
  res.json({user});
}));
app.get('/api/invitations',authenticate,adminOnly,run(async(_req,res) => {
  const data = await q('SELECT id,email,role,sent_at,accepted_at,last_error FROM invitations ORDER BY sent_at DESC LIMIT 500');
  res.json({invitations:data.rows});
}));
app.get('/api/records',authenticate,run(async(req,res) => {
  const limitValue = Math.min(Math.max(Number.parseInt(req.query.limit,10)||100,1),100);
  const offset = Math.min(Math.max(Number.parseInt(req.query.offset,10)||0,0),1000000);
  const search = String(req.query.search || '').trim().slice(0,120);
  const where=[],params=[];
  if (!privileged(req.user)) { params.push(req.user.id); where.push('r.owner_user_id=$'+params.length); }
  if (search) { params.push('%'+search+'%'); where.push('(r.title ILIKE $'+params.length+' OR r.description ILIKE $'+params.length+')'); }
  params.push(limitValue,offset);
  const sql = 'SELECT r.id,r.title,r.description,r.created_at,r.updated_at,u.email AS owner_email FROM records r JOIN users u ON u.id=r.owner_user_id ' + (where.length ? 'WHERE '+where.join(' AND ')+' ' : '') + 'ORDER BY r.created_at DESC,r.id DESC LIMIT $'+(params.length-1)+' OFFSET $'+params.length;
  res.json({records:(await q(sql,params)).rows});
}));
app.post('/api/records',authenticate,run(async(req,res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!title || title.length > 160 || description.length > 4000) return bad(res,400,'El título es obligatorio (máximo 160); la descripción admite 4000 caracteres.');
  const record = (await q('INSERT INTO records(owner_user_id,title,description) VALUES($1,$2,$3) RETURNING id,title,description,created_at,updated_at',[req.user.id,title,description])).rows[0];
  await audit(req.user.id,'record.create',String(record.id));
  res.status(201).json({record});
}));
app.put('/api/records/:id',authenticate,run(async(req,res) => {
  const title = String(req.body?.title || '').trim(), description = String(req.body?.description || '').trim();
  if (!title || title.length > 160 || description.length > 4000) return bad(res,400,'Datos del registro inválidos.');
  const r = await q('UPDATE records SET title=$1,description=$2,updated_at=NOW() WHERE id=$3 AND (owner_user_id=$4 OR $5::boolean) RETURNING id,title,description,updated_at',[title,description,req.params.id,req.user.id,privileged(req.user)]);
  if (!r.rowCount) return bad(res,404,'Registro no encontrado o acceso denegado.');
  await audit(req.user.id,'record.update',req.params.id);
  res.json({record:r.rows[0]});
}));
app.delete('/api/records/:id',authenticate,run(async(req,res) => {
  const r = await q('DELETE FROM records WHERE id=$1 AND (owner_user_id=$2 OR $3::boolean) RETURNING id',[req.params.id,req.user.id,privileged(req.user)]);
  if (!r.rowCount) return bad(res,404,'Registro no encontrado o acceso denegado.');
  await audit(req.user.id,'record.delete',req.params.id);
  res.json({ok:true});
}));
app.post('/api/invite/accept',limit(15,60*60*1000,'accept'),run(async(req,res) => {
  const raw = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  if (!/^[a-f0-9]{64}$/.test(raw) || password.length < 12 || password.length > 150 || name.length > 120) return bad(res,400,'Enlace inválido o contraseña demasiado corta (mínimo 12 caracteres).');
  const hash = SHA256(raw);
  const ph = await bcrypt.hash(password,12);
  const r = await q("UPDATE users SET name=COALESCE(NULLIF($1,''),name),password_hash=$2,status='active',accepted_at=NOW(),invite_token_hash=NULL,invite_expires_at=NULL WHERE invite_token_hash=$3 AND status='pending' AND invite_expires_at>NOW() RETURNING id,email,name,role",[name,ph,hash]);
  if (!r.rows[0]) return bad(res,400,'La invitación expiró, fue utilizada o no existe.');
  await q('UPDATE invitations SET accepted_at=NOW() WHERE token_hash=$1',[hash]);
  await audit(r.rows[0].id,'invitation.accepted',r.rows[0].email);
  res.json({token:tokenFor(r.rows[0]),user:r.rows[0]});
}));
app.use('/api',(_req,res) => bad(res,404,'Ruta API inexistente.'));
app.use((_req,res)=>bad(res,404,'Página no encontrada.'));
app.use((err,_req,res,_next) => {
  console.error('EMA API error:',err);
  if (res.headersSent) return;
  bad(res,err.status || 500,err.status ? err.message : 'Error interno. Revisá los registros del servidor.');
});
init().then(() => app.listen(config.port,'0.0.0.0',()=>console.log('EMA API escuchando en puerto '+config.port))).catch(err => {console.error('No se pudo iniciar EMA:',err);process.exitCode=1;pool.end();});
