'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const request = require('supertest');
const { Pool } = require('pg');
const { setTimeout: delay } = require('node:timers/promises');

const databaseUrl = process.env.TEST_DATABASE_URL;
const adminEmail = 'admin@example.test';
const adminPassword = 'StrongAdminPassword123!';
const userPassword = 'StrongUserPassword123!';
const headers = { 'X-EMA-Request': 'true', Origin: 'http://localhost:3000' };

// Each run gets its own schema. Never truncate a deployment's application tables.
describe('EMA API with real PostgreSQL', { skip: !databaseUrl }, () => {
  let app;
  let pool;
  let maintenancePool;
  let config;
  let initializeDatabase;
  let createApp;
  let mailer;
  let admin;
  let sent;
  let rejectMail;
  let rejectRecipient;
  const schema = `ema_test_${process.pid}_${Date.now()}`;

  const mutation = (agent, method, url, body = {}) => agent[method](url).set(headers).send(body);
  const login = async (email = adminEmail, password = adminPassword) => {
    const agent = request.agent(app);
    const response = await mutation(agent, 'post', '/api/login', { email, password });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return agent;
  };
  const tokenFrom = message => {
    const body = `${message.text || ''}\n${message.html || ''}`.replaceAll('&amp;', '&');
    const match = body.match(/https?:\/\/[^\s<>"']+/g)?.find(value => /token=/.test(value));
    assert.ok(match, 'Mail includes a personal activation/reset URL');
    const url = new URL(match);
    return url.searchParams.get('token') || new URLSearchParams(url.hash.slice(1)).get('token');
  };
  const invite = async (email = 'user@example.test', role = 'user') => {
    const response = await mutation(admin, 'post', '/api/users/invite', { email, name: 'Persona invitada', role });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return { response, token: tokenFrom(sent.at(-1)) };
  };
  const activate = async (email = 'user@example.test', role = 'user') => {
    const { token } = await invite(email, role);
    const agent = request.agent(app);
    const response = await mutation(agent, 'post', '/api/invite/accept', {
      token, name: 'Persona activa', password: userPassword,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return { agent, user: response.body.user, token };
  };

  const waitForBlockedQueries = async count => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const blocked = await maintenancePool.query(`SELECT COUNT(*)::int AS count FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock' AND state='active'`, [schema]);
      if (blocked.rows[0].count >= count) return;
      await delay(10);
    }
    assert.fail(`Expected ${count} concurrent requests waiting on the locked account`);
  };

  before(async () => {
    const backend = require('../server');
    initializeDatabase = backend.initializeDatabase;
    createApp = backend.createApp;
    maintenancePool = new Pool({ connectionString: databaseUrl });
    await maintenancePool.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema });
    config = {
      ...backend.loadConfig({
        NODE_ENV: 'test', BASE_URL: 'http://localhost:3000', DATABASE_URL: databaseUrl,
        ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, ADMIN_NAME: 'Test Admin',
      }),
      bcryptRounds: 4,
      cookieSecure: false,
    };
    await initializeDatabase(pool, config);
    mailer = {
      async sendMail(message) {
        if (rejectMail) throw new Error('SMTP authentication failed (test)');
        if (rejectRecipient) return { accepted: [], rejected: [message.to] };
        sent.push(message);
        return { messageId: `test-${sent.length}`, accepted: [message.to] };
      },
    };
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE sessions, password_resets, invitations, records, users RESTART IDENTITY CASCADE');
    await initializeDatabase(pool, config);
    sent = [];
    rejectMail = false;
    rejectRecipient = false;
    app = createApp({ pool, mailer, config });
    admin = await login();
  });

  after(async () => {
    if (pool) await pool.end();
    if (maintenancePool) {
      await maintenancePool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await maintenancePool.end();
    }
  });

  it('authenticates using an HttpOnly cookie and denies anonymous access', async () => {
    const unauthenticated = await request(app).get('/api/records');
    assert.equal(unauthenticated.status, 401);
    const loginResponse = await mutation(request(app), 'post', '/api/login', { email: adminEmail, password: adminPassword });
    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.headers['set-cookie'].some(cookie => /httponly/i.test(cookie) && /samesite=lax/i.test(cookie)));
    assert.equal(loginResponse.body.token, undefined, 'Session credentials stay out of JavaScript');
    assert.equal((await admin.get('/api/me')).body.user.email, adminEmail);
    const bad = await mutation(request(app), 'post', '/api/login', { email: adminEmail, password: 'wrong-password' });
    assert.equal(bad.status, 401);
  });

  it('limits repeated password attempts', async () => {
    let latest;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      latest = await mutation(request(app), 'post', '/api/login', { email: adminEmail, password: 'wrong-password' });
    }
    assert.equal(latest.status, 429);
    assert.equal(latest.body.code, 'RATE_LIMIT');
    assert.ok(latest.headers['ratelimit']);
  });

  it('rejects mutations without the CSRF header or from an untrusted origin', async () => {
    assert.equal((await admin.post('/api/records').send({ title: 'Must not exist' })).status, 403);
    const foreign = await admin.post('/api/records').set({ 'X-EMA-Request': 'true', Origin: 'https://attacker.example' }).send({ title: 'Must not exist' });
    assert.equal(foreign.status, 403);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM records')).rows[0].count, 0);
  });

  it('sends a personal invitation, stores only its hash and consumes it once', async () => {
    const { token } = await invite('Case.User@example.test');
    assert.equal(sent.length, 1);
    assert.match(sent[0].to, /case.user@example\.test/i);
    const invitation = await request(app).get('/api/invite').query({ token });
    assert.equal(invitation.status, 200);
    assert.equal(invitation.body.invitation.email, 'case.user@example.test');
    const storage = (await pool.query('SELECT token_hash FROM invitations')).rows[0];
    assert.notEqual(storage.token_hash, token);
    assert.equal(storage.token_hash.length, 64);
    const agent = request.agent(app);
    const accepted = await mutation(agent, 'post', '/api/invite/accept', { token, name: 'User Name', password: userPassword });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal((await agent.get('/api/me')).body.user.email, 'case.user@example.test');
    const twice = await mutation(request(app), 'post', '/api/invite/accept', { token, password: userPassword });
    assert.equal(twice.status, 400);
    await login('case.user@example.test', userPassword);
  });

  it('accepts an invitation atomically when two requests race', async () => {
    const { token } = await invite();
    const payload = { token, name: 'Single account', password: userPassword };
    const attempts = await Promise.all([
      mutation(request(app), 'post', '/api/invite/accept', payload),
      mutation(request(app), 'post', '/api/invite/accept', payload),
    ]);
    assert.deepEqual(attempts.map(response => response.status).sort(), [200, 400]);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM sessions WHERE user_id<>1')).rows[0].count, 1);
  });

  it('rejects invalid email, privileged invitation roles and short passwords', async () => {
    for (const payload of [
      { email: 'invalid-email', role: 'user' },
      { email: 'owner@example.test', role: 'admin' },
      { email: adminEmail, role: 'user' },
    ]) {
      const response = await mutation(admin, 'post', '/api/users/invite', payload);
      assert.ok([400, 409].includes(response.status), JSON.stringify(response.body));
    }
    const { token } = await invite();
    const result = await mutation(request(app), 'post', '/api/invite/accept', { token, password: 'short' });
    assert.equal(result.status, 400);
  });

  it('leaves an honest failure history when email fails and allows a new invitation', async () => {
    rejectMail = true;
    const failed = await mutation(admin, 'post', '/api/users/invite', { email: 'retry@example.test', name: 'Retry', role: 'user' });
    assert.equal(failed.status, 502);
    const pending = (await admin.get('/api/users')).body.users.find(user => user.email === 'retry@example.test');
    assert.ok(pending);
    assert.equal(pending.status, 'pending');
    const history = (await admin.get('/api/invitations')).body.invitations;
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'failed');
    rejectMail = false;
    const retry = await mutation(admin, 'post', `/api/users/${pending.id}/resend`);
    assert.ok([200, 201].includes(retry.status), JSON.stringify(retry.body));
    assert.equal(sent.length, 1);
    const accepted = await mutation(request(app), 'post', '/api/invite/accept', { token: tokenFrom(sent[0]), password: userPassword });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  });

  it('treats an SMTP recipient rejection as a failed delivery rather than a sent invitation', async () => {
    rejectRecipient = true;
    const failed = await mutation(admin, 'post', '/api/users/invite', { email: 'rejected@gmail.com', role: 'user' });
    assert.equal(failed.status, 502);
    const history = (await admin.get('/api/invitations')).body.invitations;
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'failed');
    assert.equal(history[0].sent_at, null);
  });

  it('never demotes or deactivates an active account when it is invited again', async () => {
    const { agent, user } = await activate();
    const duplicate = await mutation(admin, 'post', '/api/users/invite', { email: user.email, name: 'Overwrite', role: 'moderator' });
    assert.equal(duplicate.status, 409);
    const current = await agent.get('/api/me');
    assert.equal(current.status, 200);
    assert.equal(current.body.user.role, 'user');
    assert.equal((await mutation(admin, 'post', `/api/users/${user.id}/resend`)).status, 409);
  });

  it('prevents users from inviting others or assigning records to another account', async () => {
    const { agent, user } = await activate();
    assert.equal((await agent.get('/api/users')).status, 403);
    assert.equal((await agent.get('/api/invitations')).status, 403);
    assert.equal((await mutation(agent, 'post', '/api/users/invite', { email: 'other@example.test', role: 'user' })).status, 403);
    const result = await mutation(agent, 'post', '/api/records', { title: 'Mine', description: 'Content', owner_user_id: '1' });
    assert.equal(result.status, 201);
    const stored = (await pool.query('SELECT owner_user_id FROM records WHERE id=$1', [result.body.record.id])).rows[0];
    assert.equal(String(stored.owner_user_id), String(user.id));
  });

  it('supports SQL record CRUD, search, pagination and user isolation', async () => {
    const { agent: first } = await activate('first@example.test');
    const { agent: second } = await activate('second@example.test');
    const created = await mutation(first, 'post', '/api/records', { title: 'Budget 2026', description: 'Original' });
    assert.equal(created.status, 201);
    const id = created.body.record.id;
    assert.equal((await second.get('/api/records')).body.total, 0);
    assert.ok([403, 404].includes((await mutation(second, 'patch', `/api/records/${id}`, { title: 'Stolen' })).status));
    assert.ok([403, 404].includes((await mutation(second, 'delete', `/api/records/${id}`)).status));
    const edited = await mutation(first, 'patch', `/api/records/${id}`, { title: 'Quarterly budget', description: 'Edited' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.record.description, 'Edited');
    await mutation(first, 'post', '/api/records', { title: 'Another budget', description: 'Second' });
    const result = await first.get('/api/records').query({ search: 'budget', limit: 1, page: 2 });
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 2);
    assert.equal(result.body.records.length, 1);
    assert.equal(Number(result.body.page), 2);
    assert.equal((await first.get('/api/records').query({ search: "'; DROP TABLE records; --" })).body.total, 0);
    assert.equal((await admin.get('/api/records')).body.total, 2);
    assert.ok([200, 204].includes((await mutation(admin, 'delete', `/api/records/${id}`)).status));
    assert.equal((await first.get('/api/records')).body.total, 1);
  });

  it('allows moderators to manage shared records while keeping user administration private', async () => {
    const { agent: member } = await activate();
    const created = await mutation(member, 'post', '/api/records', { title: 'Shared record' });
    const { agent: moderator } = await activate('moderator@example.test', 'moderator');
    assert.equal((await moderator.get('/api/records')).body.total, 1);
    assert.equal((await mutation(moderator, 'patch', `/api/records/${created.body.record.id}`, { title: 'Reviewed' })).status, 200);
    assert.equal((await moderator.get('/api/users')).status, 403);
  });

  it('suspends access immediately and prevents active status on unaccepted accounts', async () => {
    const { agent, user } = await activate();
    const suspended = await mutation(admin, 'patch', `/api/users/${user.id}`, { status: 'suspended' });
    assert.equal(suspended.status, 200);
    assert.equal((await agent.get('/api/me')).status, 401);
    assert.equal((await mutation(request(app), 'post', '/api/login', { email: user.email, password: userPassword })).status, 401);
    const reactivated = await mutation(admin, 'patch', `/api/users/${user.id}`, { status: 'active' });
    assert.equal(reactivated.status, 200);
    await login(user.email, userPassword);
    await invite('pending@example.test');
    const pending = (await admin.get('/api/users')).body.users.find(account => account.email === 'pending@example.test');
    assert.ok([400, 409].includes((await mutation(admin, 'patch', `/api/users/${pending.id}`, { status: 'active' })).status));
  });

  it('rejects overlong record values before persistence', async () => {
    for (const payload of [
      { title: '' }, { title: 'x'.repeat(161) }, { title: 'Valid', description: 'x'.repeat(10001) },
    ]) assert.equal((await mutation(admin, 'post', '/api/records', payload)).status, 400);
    assert.equal((await admin.get('/api/records')).body.total, 0);
  });

  it('invalidates other sessions when a password changes and never resets it on startup', async () => {
    const otherSession = await login();
    const newPassword = 'ChangedAdminPassword456!';
    const changed = await mutation(admin, 'post', '/api/password/change', { currentPassword: adminPassword, newPassword });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal((await otherSession.get('/api/me')).status, 401);
    await initializeDatabase(pool, config);
    await login(adminEmail, newPassword);
    assert.equal((await mutation(request(app), 'post', '/api/login', { email: adminEmail, password: adminPassword })).status, 401);
  });

  it('resets passwords through a one-use email token and hides unknown accounts', async () => {
    const known = await mutation(request(app), 'post', '/api/password/forgot', { email: adminEmail });
    assert.equal(known.status, 200);
    assert.equal(sent.length, 1);
    const unknown = await mutation(request(app), 'post', '/api/password/forgot', { email: 'missing@example.test' });
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body, known.body);
    assert.equal(sent.length, 1);
    const token = tokenFrom(sent[0]);
    const password = 'PasswordReset456!';
    const reset = await mutation(request(app), 'post', '/api/password/reset', { token, password });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal((await admin.get('/api/me')).status, 401);
    assert.equal((await mutation(request(app), 'post', '/api/password/reset', { token, password })).status, 400);
    await login(adminEmail, password);
  });

  for (const operation of ['login', 'password change']) {
    it(`serializes an old-password ${operation} behind a concurrent password reset`, async () => {
      const resetPassword = 'ConcurrentResetPassword123!';
      const staleChangePassword = 'StaleChangePassword456!';
      const recovery = await mutation(request(app), 'post', '/api/password/forgot', { email: adminEmail });
      assert.equal(recovery.status, 200);
      const resetToken = tokenFrom(sent.at(-1));
      const guard = await pool.connect();
      const resetAgent = request.agent(app);
      const staleAgent = operation === 'login' ? request.agent(app) : admin;
      let unlocked = false;
      let resetAttempt;
      let staleAttempt;
      try {
        await guard.query('BEGIN');
        await guard.query('SELECT id FROM users WHERE email=$1 FOR UPDATE', [adminEmail]);
        // Queue the real reset first, then an old credential request. With the
        // former non-locking login/change path, stale credentials could create
        // a session or overwrite the password after the reset had committed.
        resetAttempt = mutation(resetAgent, 'post', '/api/password/reset', { token: resetToken, password: resetPassword }).then(response => response);
        await waitForBlockedQueries(1);
        staleAttempt = operation === 'login'
          ? mutation(staleAgent, 'post', '/api/login', { email: adminEmail, password: adminPassword }).then(response => response)
          : mutation(staleAgent, 'post', '/api/password/change', { currentPassword: adminPassword, newPassword: staleChangePassword }).then(response => response);
        await waitForBlockedQueries(2);
        await guard.query('COMMIT');
        unlocked = true;
        const [reset, stale] = await Promise.all([resetAttempt, staleAttempt]);
        assert.equal(reset.status, 200, JSON.stringify(reset.body));
        assert.equal(stale.status, operation === 'login' ? 401 : 400, JSON.stringify(stale.body));
        assert.equal((await staleAgent.get('/api/me')).status, 401);
        assert.equal((await resetAgent.get('/api/me')).status, 200);
        await login(adminEmail, resetPassword);
        if (operation === 'password change') {
          const overwritten = await mutation(request(app), 'post', '/api/login', { email: adminEmail, password: staleChangePassword });
          assert.equal(overwritten.status, 401);
        }
      } finally {
        if (!unlocked) await guard.query('ROLLBACK');
        guard.release();
        await Promise.allSettled([resetAttempt, staleAttempt].filter(Boolean));
      }
    });
  }

  it('keeps password recovery generic and the current password valid when email fails', async () => {
    rejectMail = true;
    const failed = await mutation(request(app), 'post', '/api/password/forgot', { email: adminEmail });
    const unknown = await mutation(request(app), 'post', '/api/password/forgot', { email: 'unknown@example.test' });
    assert.equal(failed.status, 200);
    assert.deepEqual(failed.body, unknown.body);
    assert.equal(sent.length, 0);
    await login();
  });

  it('does not serve source, credentials or internal files as public static assets', async () => {
    for (const file of ['/.env', '/.env.example', '/server.js', '/package.json', '/render.yaml', '/.git/config', '/lib/config.js']) {
      const response = await request(app).get(file);
      assert.equal(response.status, 404, `${file} must be private`);
    }
    assert.equal((await request(app).get('/')).status, 200);
    assert.equal((await request(app).get('/api/nonexistent')).status, 404);
  });

  it('expires invitations and revokes the session on logout', async () => {
    const { token } = await invite();
    await pool.query("UPDATE users SET invite_expires_at = NOW() - INTERVAL '1 hour' WHERE email=$1", ['user@example.test']);
    assert.equal((await request(app).get('/api/invite').query({ token })).status, 400);
    assert.equal((await mutation(request(app), 'post', '/api/invite/accept', { token, password: userPassword })).status, 400);
    assert.ok([200, 204].includes((await mutation(admin, 'post', '/api/logout')).status));
    assert.equal((await admin.get('/api/me')).status, 401);
  });
});
