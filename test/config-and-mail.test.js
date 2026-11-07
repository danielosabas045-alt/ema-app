'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { loadConfig } = require('../lib/config');
const { createMailer, messageTemplate } = require('../lib/mail');
const { Client } = require('pg');

const database = { DATABASE_URL: 'postgresql://ema:example@localhost/ema' };

describe('production configuration', () => {
  it('requires a real database and an HTTPS server origin in production', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', BASE_URL: 'https://ema.example' }), /DATABASE_URL/);
    for (const BASE_URL of ['', 'http://ema.example', 'https://ema.example/path', 'https://user:pass@ema.example', 'https://ema.example?token=bad']) {
      assert.throws(() => loadConfig({ ...database, NODE_ENV: 'production', BASE_URL }), /BASE_URL/);
    }
    const production = loadConfig({ ...database, NODE_ENV: 'production', BASE_URL: 'https://ema.example/' });
    assert.equal(production.baseUrl, 'https://ema.example');
    assert.equal(production.cookieSecure, true);
  });

  it('rejects weak bootstrap passwords and does not silently configure a mail provider', () => {
    assert.throws(() => loadConfig({ ...database, ADMIN_PASSWORD: 'ChangeMe123' }), /ADMIN_PASSWORD/);
    const config = loadConfig(database);
    assert.equal(config.adminPassword, '');
    assert.equal(createMailer(config), null);
  });

  it('keeps verified database TLS enabled when a connection string contains conflicting SSL options', () => {
    for (const query of ['sslmode=disable', 'sslmode=no-verify', 'sslmode=require&uselibpqcompat=true', 'ssl=false']) {
      const config = loadConfig({ DATABASE_URL: `${database.DATABASE_URL}?${query}`, DATABASE_SSL: 'require' });
      const client = new Client({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: true } });
      assert.notEqual(client.connectionParameters.ssl, false);
      assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized, false);
      assert.equal(new URL(config.databaseUrl).searchParams.get('sslmode'), 'verify-full');
    }
  });

  it('normalizes Gmail app-password whitespace without leaking it into a message', () => {
    const config = loadConfig({ ...database, GMAIL_USER: 'sender@example.test', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop\n' });
    assert.equal(config.gmailPassword, 'abcdefghijklmnop');
    assert.equal(config.mailProvider, 'gmail');
    const template = messageTemplate({ name: '<img src=x onerror=alert(1)>', url: 'https://ema.example/invite.html#token=test' });
    assert.ok(!template.html.includes('<img'));
    assert.ok(template.html.includes('&lt;img'));
    assert.ok(template.text.includes('https://ema.example/invite.html#token=test'));
    assert.ok(!template.html.includes(config.gmailPassword));
  });
});

describe('real email-provider adapter', () => {
  it('sends Resend messages over HTTPS with the recipient and preserves rejection as failure', async () => {
    const originalFetch = global.fetch;
    const requests = [];
    try {
      global.fetch = async (url, options) => {
        requests.push({ url, options });
        return { ok: true, json: async () => ({ id: 'provider-message-id' }) };
      };
      const mailer = createMailer({ mailProvider: 'resend', resendApiKey: 'test-secret-key' });
      const message = { from: 'EMA <ema@example.test>', to: 'recipient@gmail.com', subject: 'Invitación EMA', text: 'URL personal', html: '<p>Invitación</p>' };
      assert.deepEqual(await mailer.sendMail(message), { id: 'provider-message-id' });
      assert.equal(requests[0].url, 'https://api.resend.com/emails');
      assert.equal(requests[0].options.headers.Authorization, 'Bearer test-secret-key');
      const body = JSON.parse(requests[0].options.body);
      assert.deepEqual(body.to, ['recipient@gmail.com']);
      assert.equal(body.from, message.from);
      global.fetch = async () => ({ ok: false, status: 403 });
      await assert.rejects(() => mailer.sendMail(message), /403/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
