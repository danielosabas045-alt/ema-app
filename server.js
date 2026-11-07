'use strict';
require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { loadConfig } = require('./lib/config');
const { initializeDatabase, transaction } = require('./lib/database');
const { createMailer, messageTemplate } = require('./lib/mail');

const VERSION = '2.0.0';
const COOKIE = 'ema_session';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status });
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new HttpError(status, message, code); };
function validEmail(email) { return typeof email === 'string' && email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email); }
function normalizedEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function text(value, field, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, `${field}: escribe entre ${required ? 1 : 0} y ${max} caracteres.`);
  return value.trim();
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || Buffer.byteLength(value) > 72) fail(400, 'La contraseña debe tener al menos 12 caracteres y como máximo 72 bytes.');
  return value;
}
function idParam(value) {
  if (!/^[1-9]\d{0,17}$/.test(String(value))) fail(400, 'Identificador inválido.');
  return String(value);
}
function tokenHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) fail(400, 'El enlace no es válido o ha caducado.', 'INVALID_TOKEN');
  return sha256(value);
}
function parseSession(req) {
  const match = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
  if (!match) return null;
  const raw = match.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(raw) ? sha256(raw) : null;
}

function createApp({ pool, mailer = null, config }) {
  if (!pool || !config) throw new Error('createApp requiere pool y config.');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], connectSrc: ["'self'"],
        objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
    strictTransportSecurity: config.production ? undefined : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '48kb', strict: true }));
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-EMA-Request') !== 'true') return next(new HttpError(403, 'Solicitud no permitida. Recarga la página.', 'CSRF'));
    const origin = req.get('origin');
    if (origin && origin !== config.baseUrl) return next(new HttpError(403, 'Origen de solicitud no permitido.', 'CSRF'));
    if (req.get('sec-fetch-site') === 'cross-site') return next(new HttpError(403, 'Solicitud de otro sitio no permitida.', 'CSRF'));
    if (!req.is('application/json')) return next(new HttpError(415, 'La solicitud debe usar JSON.'));
    if (req.body === undefined) req.body = {};
    next();
  });
  const limiter = (limit, windowMs = 15 * 60 * 1000) => rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera unos minutos antes de reintentar.', code: 'RATE_LIMIT' },
  });
  const loginLimit = limiter(30);
  const emailLimit = limiter(20);
  const tokenLimit = limiter(50);
  app.use('/api', limiter(1500));
  const cookieOptions = { httpOnly: true, secure: Boolean(config.cookieSecure), sameSite: 'lax', path: '/', maxAge: (config.sessionHours || 8) * 3600000 };
  async function createSession(client, userId, res) {
    const raw = token();
    await client.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [sha256(raw), userId, new Date(Date.now() + cookieOptions.maxAge)]);
    await client.query('DELETE FROM sessions WHERE expires_at < NOW()');
    res.cookie(COOKIE, raw, cookieOptions);
  }
  const auth = asyncRoute(async (req, _res, next) => {
    const hash = parseSession(req);
    if (!hash) fail(401, 'Inicia sesión para continuar.', 'UNAUTHENTICATED');
    const result = await pool.query(`SELECT u.id,u.email,u.name,u.role,u.status
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`, [hash]);
    if (!result.rowCount) fail(401, 'Tu sesión ha caducado. Inicia sesión nuevamente.', 'UNAUTHENTICATED');
    req.user = result.rows[0];
    req.sessionHash = hash;
    next();
  });
  const admin = (req, _res, next) => req.user.role === 'admin' ? next() : next(new HttpError(403, 'Solo el administrador tiene acceso a esta función.'));
  const globalRecords = user => ['admin', 'moderator'].includes(user.role);
  function requireEmail() { if (!mailer) fail(503, 'El envío de correo aún no está configurado en el servidor.', 'EMAIL_NOT_CONFIGURED'); }
  async function sendMail(message) {
    const result = await mailer.sendMail({ from: config.mailFrom || `EMA Database <${config.adminEmail}>`, ...message });
    if (result?.rejected?.length || (Array.isArray(result?.accepted) && !result.accepted.length)) throw new Error('El proveedor rechazó al destinatario.');
    return result;
  }

  app.get('/api/health', asyncRoute(async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, database: 'connected', emailConfigured: Boolean(mailer), emailProvider: config.mailProvider || (mailer ? 'smtp' : null), version: VERSION });
    } catch {
      res.status(503).json({ ok: false, database: 'unavailable', emailConfigured: Boolean(mailer), version: VERSION });
    }
  }));
  app.post('/api/login', loginLimit, asyncRoute(async (req, res) => {
    const email = normalizedEmail(req.body.email);
    if (!validEmail(email) || typeof req.body.password !== 'string' || req.body.password.length > 128 || Buffer.byteLength(req.body.password) > 72) fail(401, 'Correo o contraseña incorrectos.');
    const user = await transaction(pool, async client => {
      // Serializes login with password changes/resets and suspension so an old
      // password cannot establish a new session after revocation has committed.
      const result = await client.query('SELECT id,email,name,role,status,password_hash FROM users WHERE email=$1 FOR UPDATE', [email]);
      const found = result.rows[0];
      // A fixed valid bcrypt hash keeps nonexistent accounts on the comparison path.
      const hash = found?.password_hash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5/rlFNQxzM4V9zO5Dui8/y.uTMsD4tO';
      const matches = await bcrypt.compare(req.body.password, hash);
      if (!found || found.status !== 'active' || !matches) fail(401, 'Correo o contraseña incorrectos.');
      const old = parseSession(req);
      if (old) await client.query('DELETE FROM sessions WHERE token_hash=$1', [old]);
      await createSession(client, found.id, res);
      return found;
    });
    res.json({ user: publicUser(user) });
  }));
  app.post('/api/logout', asyncRoute(async (req, res) => {
    const hash = parseSession(req);
    if (hash) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash]);
    res.clearCookie(COOKIE, { httpOnly: true, secure: Boolean(config.cookieSecure), sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  }));
  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/password/change', auth, loginLimit, asyncRoute(async (req, res) => {
    const newPassword = password(req.body.newPassword);
    if (typeof req.body.currentPassword !== 'string' || req.body.currentPassword.length > 128 || Buffer.byteLength(req.body.currentPassword) > 72) fail(400, 'Escribe tu contraseña actual.');
    const hash = await bcrypt.hash(newPassword, config.bcryptRounds || 12);
    await transaction(pool, async client => {
      const result = await client.query('SELECT password_hash,status FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      if (result.rows[0]?.status !== 'active' || !(await bcrypt.compare(req.body.currentPassword, result.rows[0].password_hash))) fail(400, 'La contraseña actual es incorrecta.');
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
      await client.query('DELETE FROM password_resets WHERE user_id=$1', [req.user.id]);
      await createSession(client, req.user.id, res);
    });
    res.json({ ok: true, user: publicUser(req.user) });
  }));
  app.post('/api/password/forgot', emailLimit, asyncRoute(async (req, res) => {
    requireEmail();
    const email = normalizedEmail(req.body.email);
    if (!validEmail(email)) fail(400, 'Escribe un correo electrónico válido.');
    const result = await pool.query("SELECT id,email,name FROM users WHERE email=$1 AND status='active'", [email]);
    if (result.rowCount) {
      const user = result.rows[0], raw = token(), hash = sha256(raw);
      try {
        await transaction(pool, async client => {
          await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
          await client.query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);
          await client.query('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [hash, user.id, new Date(Date.now() + 3600000)]);
          await sendMail({ to: user.email, ...messageTemplate({ name: user.name, url: `${config.baseUrl}/invite.html#token=${raw}&mode=reset`, reset: true }) });
        });
      } catch (error) {
        // Keep the same public response for existing and nonexistent accounts.
        console.error('EMA password recovery delivery failed:', error.code || 'EMAIL_SEND_FAILED');
      }
    }
    res.json({ ok: true, message: 'Si el correo pertenece a una cuenta activa, recibirás un enlace para restablecer tu contraseña.' });
  }));
  app.post('/api/password/reset', tokenLimit, asyncRoute(async (req, res) => {
    const hash = tokenHash(req.body.token), newPassword = password(req.body.password);
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds || 12);
    const user = await transaction(pool, async client => {
      const result = await client.query(`SELECT p.token_hash,u.id,u.email,u.name,u.role,u.status
        FROM password_resets p JOIN users u ON u.id=p.user_id
        WHERE p.token_hash=$1 AND p.expires_at>NOW() AND p.consumed_at IS NULL AND u.status='active'
        FOR UPDATE OF u,p`, [hash]);
      if (!result.rowCount) fail(400, 'El enlace no es válido o ha caducado.', 'INVALID_TOKEN');
      const found = result.rows[0];
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, found.id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [found.id]);
      await client.query('UPDATE password_resets SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [found.id]);
      await createSession(client, found.id, res);
      return found;
    });
    res.json({ user: publicUser(user) });
  }));

  app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
    const canSeeAll = globalRecords(req.user);
    const where = canSeeAll ? '' : ' WHERE owner_user_id=$1';
    const params = canSeeAll ? [] : [req.user.id];
    const [users, records, invites, recent] = await Promise.all([
      req.user.role === 'admin' ? pool.query("SELECT COUNT(*)::int n FROM users WHERE role<>'admin'") : Promise.resolve({ rows: [{ n: null }] }),
      pool.query(`SELECT COUNT(*)::int n FROM records${where}`, params),
      req.user.role === 'admin' ? pool.query('SELECT COUNT(*)::int n FROM invitations') : Promise.resolve({ rows: [{ n: null }] }),
      pool.query(`SELECT r.id,r.owner_user_id,r.title,r.description,r.created_at,r.updated_at,u.email owner_email,u.name owner_name
        FROM records r JOIN users u ON u.id=r.owner_user_id${canSeeAll ? '' : ' WHERE r.owner_user_id=$1'} ORDER BY r.created_at DESC,r.id DESC LIMIT 5`, params),
    ]);
    res.json({ users: users.rows[0].n, records: records.rows[0].n, invitations: invites.rows[0].n, recentRecords: recent.rows });
  }));
  app.get('/api/users', auth, admin, asyncRoute(async (_req, res) => {
    const result = await pool.query('SELECT id,email,name,role,status,created_at,accepted_at FROM users ORDER BY created_at DESC,id DESC');
    res.json({ users: result.rows });
  }));

  async function invite(req, res, resend = false) {
    requireEmail();
    const email = normalizedEmail(req.body.email);
    const role = req.body.role || 'user';
    if (!resend && !validEmail(email)) fail(400, 'Escribe un correo electrónico válido.');
    if (!resend && !['user', 'moderator'].includes(role)) fail(400, 'Selecciona un rol válido.');
    const name = !resend ? text(req.body.name || email.split('@')[0], 'Nombre', 120) : null;
    const raw = token(), hash = sha256(raw), expires = new Date(Date.now() + 48 * 3600000);
    const result = await transaction(pool, async client => {
      // Serializes invites of the same email, including the initially absent row.
      const lockKey = resend ? `id:${idParam(req.params.id)}` : `email:${email}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      let found = await client.query(`SELECT id,email,name,role,status FROM users WHERE ${resend ? 'id' : 'email'}=$1 FOR UPDATE`, [resend ? idParam(req.params.id) : email]);
      let user = found.rows[0];
      if (resend && !user) fail(404, 'Usuario no encontrado.');
      if (user && user.status !== 'pending') fail(409, 'Este usuario ya tiene una cuenta. No necesita otra invitación.');
      if (user?.role === 'admin' || email === config.adminEmail) fail(409, 'El administrador ya tiene acceso.');
      if (!user) {
        found = await client.query("INSERT INTO users(email,name,role,status,invite_token_hash,invite_expires_at) VALUES($1,$2,$3,'pending',$4,$5) RETURNING id,email,name,role,status", [email, name, role, hash, expires]);
        user = found.rows[0];
      } else {
        const update = await client.query('UPDATE users SET name=$1,role=$2,invite_token_hash=$3,invite_expires_at=$4 WHERE id=$5 RETURNING id,email,name,role,status', [resend ? user.name : name, resend ? user.role : role, hash, expires, user.id]);
        user = update.rows[0];
      }
      await client.query("UPDATE invitations SET status='superseded' WHERE user_id=$1 AND status IN ('sent','sending','failed')", [user.id]);
      const inserted = await client.query("INSERT INTO invitations(user_id,email,role,token_hash,status,sent_at,expires_at) VALUES($1,$2,$3,$4,'sending',NULL,$5) RETURNING id", [user.id, user.email, user.role, hash, expires]);
      const invitationId = inserted.rows[0].id;
      try {
        await sendMail({ to: user.email, ...messageTemplate({ name: user.name, url: `${config.baseUrl}/invite.html#token=${raw}` }) });
        const sent = await client.query("UPDATE invitations SET status='sent',sent_at=NOW() WHERE id=$1 RETURNING id,email,role,status,sent_at,expires_at", [invitationId]);
        return { user, invitation: sent.rows[0] };
      } catch {
        await client.query("UPDATE invitations SET status='failed',last_error='El proveedor no pudo enviar el correo. Revisa la configuración y reintenta.' WHERE id=$1", [invitationId]);
        return { failed: true };
      }
    });
    if (result.failed) fail(502, 'El correo no se pudo enviar. La invitación aparece como fallida; revisa el proveedor y reenvíala.', 'EMAIL_SEND_FAILED');
    res.status(resend ? 200 : 201).json(result);
  }
  app.post('/api/users/invite', auth, admin, emailLimit, asyncRoute((req, res) => invite(req, res)));
  app.post('/api/users/:id/resend', auth, admin, emailLimit, asyncRoute((req, res) => invite(req, res, true)));
  app.patch('/api/users/:id', auth, admin, asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    const user = await transaction(pool, async client => {
      const result = await client.query('SELECT id,email,name,role,status,password_hash,accepted_at FROM users WHERE id=$1 FOR UPDATE', [id]);
      const found = result.rows[0];
      if (!found) fail(404, 'Usuario no encontrado.');
      if (found.role === 'admin' || String(found.id) === String(req.user.id)) fail(403, 'No puedes cambiar la cuenta del administrador desde esta opción.');
      const name = req.body.name === undefined ? found.name : text(req.body.name, 'Nombre', 120);
      const role = req.body.role === undefined ? found.role : req.body.role;
      if (!['user', 'moderator'].includes(role)) fail(400, 'Selecciona un rol válido.');
      const status = req.body.status === undefined ? found.status : req.body.status;
      if (!['active', 'suspended', 'pending'].includes(status)) fail(400, 'Estado de usuario inválido.');
      if (status === 'active' && (!found.password_hash || !found.accepted_at)) fail(400, 'El usuario debe aceptar su invitación antes de activar la cuenta.');
      if (status === 'pending' && found.status !== 'pending') fail(400, 'Una cuenta activada no puede volver a estar pendiente.');
      const updated = await client.query('UPDATE users SET name=$1,role=$2,status=$3 WHERE id=$4 RETURNING id,email,name,role,status,created_at,accepted_at', [name, role, status, id]);
      if (status !== 'active' || found.role !== role) await client.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      return updated.rows[0];
    });
    res.json({ user });
  }));
  app.get('/api/invitations', auth, admin, asyncRoute(async (_req, res) => {
    const result = await pool.query(`SELECT i.id,i.user_id,i.email,i.role,
      CASE WHEN i.status='sent' AND i.expires_at<NOW() THEN 'expired' ELSE i.status END status,
      i.sent_at,i.accepted_at,i.expires_at,i.created_at,i.last_error,u.name
      FROM invitations i JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC,i.id DESC LIMIT 500`);
    res.json({ invitations: result.rows });
  }));
  app.get('/api/invite', tokenLimit, asyncRoute(async (req, res) => {
    const hash = tokenHash(req.query.token);
    const result = await pool.query(`SELECT u.email,u.name,u.role,u.invite_expires_at expires_at
      FROM users u JOIN invitations i ON i.token_hash=u.invite_token_hash
      WHERE u.invite_token_hash=$1 AND u.status='pending' AND u.invite_expires_at>NOW() AND i.status='sent'`, [hash]);
    if (!result.rowCount) fail(400, 'La invitación no es válida, ya se utilizó o ha caducado.', 'INVALID_TOKEN');
    res.json({ invitation: result.rows[0] });
  }));
  app.post('/api/invite/accept', tokenLimit, asyncRoute(async (req, res) => {
    const hash = tokenHash(req.body.token), newPassword = password(req.body.password);
    const name = req.body.name === undefined ? '' : text(req.body.name, 'Nombre', 120, false);
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds || 12);
    const user = await transaction(pool, async client => {
      const result = await client.query(`SELECT u.id FROM users u JOIN invitations i ON i.token_hash=u.invite_token_hash
        WHERE u.invite_token_hash=$1 AND u.status='pending' AND u.invite_expires_at>NOW() AND i.status='sent' FOR UPDATE OF u,i`, [hash]);
      if (!result.rowCount) fail(400, 'La invitación no es válida, ya se utilizó o ha caducado.', 'INVALID_TOKEN');
      const updated = await client.query(`UPDATE users SET name=COALESCE(NULLIF($1,''),name),password_hash=$2,status='active',accepted_at=NOW(),invite_token_hash=NULL,invite_expires_at=NULL
        WHERE id=$3 RETURNING id,email,name,role,status`, [name, passwordHash, result.rows[0].id]);
      await client.query("UPDATE invitations SET accepted_at=NOW(),status='accepted' WHERE token_hash=$1", [hash]);
      await createSession(client, updated.rows[0].id, res);
      return updated.rows[0];
    });
    res.json({ user: publicUser(user) });
  }));

  app.get('/api/records', auth, asyncRoute(async (req, res) => {
    const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'Paginación inválida.');
    const search = req.query.search === undefined ? '' : text(req.query.search, 'Búsqueda', 200, false);
    const params = [], clauses = [];
    if (!globalRecords(req.user)) { params.push(req.user.id); clauses.push(`r.owner_user_id=$${params.length}`); }
    if (search) {
      params.push(`%${search.replace(/[\\%_]/g, ch => `\\${ch}`)}%`);
      clauses.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const count = await pool.query(`SELECT COUNT(*)::int n FROM records r JOIN users u ON u.id=r.owner_user_id${where}`, params);
    const result = await pool.query(`SELECT r.id,r.title,r.description,r.owner_user_id,r.created_at,r.updated_at,u.email owner_email,u.name owner_name
      FROM records r JOIN users u ON u.id=r.owner_user_id${where} ORDER BY r.created_at DESC,r.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, (page - 1) * limit]);
    res.json({ records: result.rows, total: count.rows[0].n, page, limit });
  }));
  app.post('/api/records', auth, asyncRoute(async (req, res) => {
    const title = text(req.body.title, 'Título', 160), description = text(req.body.description ?? '', 'Descripción', 10000, false);
    const result = await pool.query('INSERT INTO records(owner_user_id,title,description) VALUES($1,$2,$3) RETURNING id,owner_user_id,title,description,created_at,updated_at', [req.user.id, title, description]);
    res.status(201).json({ record: { ...result.rows[0], owner_email: req.user.email, owner_name: req.user.name } });
  }));
  app.patch('/api/records/:id', auth, asyncRoute(async (req, res) => {
    const id = idParam(req.params.id), title = text(req.body.title, 'Título', 160), description = text(req.body.description ?? '', 'Descripción', 10000, false);
    const result = await pool.query(`UPDATE records SET title=$1,description=$2,updated_at=NOW()
      WHERE id=$3${globalRecords(req.user) ? '' : ' AND owner_user_id=$4'} RETURNING id,owner_user_id,title,description,created_at,updated_at`, globalRecords(req.user) ? [title, description, id] : [title, description, id, req.user.id]);
    if (!result.rowCount) fail(404, 'Registro no encontrado o sin permiso para editarlo.');
    res.json({ record: result.rows[0] });
  }));
  app.delete('/api/records/:id', auth, asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    const result = await pool.query(`DELETE FROM records WHERE id=$1${globalRecords(req.user) ? '' : ' AND owner_user_id=$2'} RETURNING id`, globalRecords(req.user) ? [id] : [id, req.user.id]);
    if (!result.rowCount) fail(404, 'Registro no encontrado o sin permiso para eliminarlo.');
    res.json({ ok: true });
  }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
  // Explicit file allowlist: credentials, source, SQL and package metadata are never public.
  const publicFiles = new Map([
    ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'],
    ['/invite.html', 'invite.html'], ['/invite.js', 'invite.js'], ['/config.json', 'config.json'],
  ]);
  app.get('*', (req, res, next) => {
    const file = publicFiles.get(req.path);
    if (!file) return next(new HttpError(404, 'Página no encontrada.'));
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, file), error => error && next(error));
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    let status = error.status || 500;
    let message = error.message;
    if (error.type === 'entity.parse.failed') { status = 400; message = 'El cuerpo JSON no es válido.'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'La solicitud es demasiado grande.'; }
    if (error.code === '23505') { status = 409; message = 'Ya existe un elemento con estos datos.'; }
    if (status >= 500 && !(error instanceof HttpError)) {
      console.error('EMA request failed:', error.code || error.name || 'UNEXPECTED');
      message = 'No se pudo completar la operación. Intenta nuevamente.';
    }
    res.status(status).json({ error: message || 'No se pudo completar la operación.', ...(error instanceof HttpError && error.code ? { code: error.code } : {}) });
  });
  return app;
}

async function start() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl, ...(config.databaseSsl ? { ssl: { rejectUnauthorized: true } } : {}), max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
  pool.on('error', error => console.error('EMA PostgreSQL connection:', error.code || 'CONNECTION_FAILED'));
  await initializeDatabase(pool, config);
  const app = createApp({ pool, mailer: createMailer(config), config });
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`EMA Database ${VERSION}: puerto ${config.port}`));
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return { app, server, pool };
}
if (require.main === module) start().catch(error => { console.error('No se pudo iniciar EMA:', error.message); process.exitCode = 1; });

module.exports = { createApp, initializeDatabase, loadConfig, start };
