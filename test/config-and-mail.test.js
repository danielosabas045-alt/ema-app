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

  it('configures Brevo with a verified sender and keeps provider precedence', () => {
    const config = loadConfig({ ...database, ADMIN_EMAIL: 'Sender@Gmail.com', BREVO_API_KEY: 'test-brevo-key', GMAIL_APP_PASSWORD: 'gmail-password', SMTP_HOST: 'smtp.example.test' });
    assert.equal(config.mailProvider, 'brevo');
    assert.equal(config.brevoApiKey, 'test-brevo-key');
    assert.equal(config.brevoSenderEmail, 'sender@gmail.com');
    assert.equal(config.brevoSenderName, 'EMA Database');
    const custom = loadConfig({ ...database, BREVO_API_KEY: 'test-brevo-key', BREVO_SENDER_EMAIL: ' Team@Gmail.com ', BREVO_SENDER_NAME: ' Mi equipo ' });
    assert.equal(custom.brevoSenderEmail, 'team@gmail.com');
    assert.equal(custom.brevoSenderName, 'Mi equipo');
    assert.equal(loadConfig({ ...database, BREVO_API_KEY: 'test-brevo-key', RESEND_API_KEY: 'test-resend-key', MAIL_FROM: 'EMA <ema@example.test>' }).mailProvider, 'resend');
  });

  it('rejects invalid or multiline Brevo sender configuration without exposing credentials', () => {
    for (const BREVO_SENDER_EMAIL of ['invalid', 'EMA <sender@gmail.com>', 'sender@gmail.com\r\nBcc: other@gmail.com', 'sender@gmail.com\n', 'sender @gmail.com']) {
      assert.throws(() => loadConfig({ ...database, BREVO_API_KEY: 'secret-key', BREVO_SENDER_EMAIL }), /BREVO_SENDER_EMAIL/);
    }
    for (const BREVO_SENDER_NAME of ['   ', 'EMA\r\nBcc: other@gmail.com', 'x'.repeat(121)]) {
      assert.throws(() => loadConfig({ ...database, BREVO_API_KEY: 'secret-key', BREVO_SENDER_NAME }), /BREVO_SENDER_NAME/);
    }
    assert.throws(() => loadConfig({ ...database, BREVO_API_KEY: 'secret-key', ADMIN_EMAIL: 'invalid' }), /BREVO_SENDER_EMAIL/);
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

  it('sends Brevo messages over HTTPS using the configured sender and accepts queued messages', async () => {
    const originalFetch = global.fetch;
    const requests = [];
    try {
      global.fetch = async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 202, json: async () => ({ messageId: '<queued-message@brevo.test>' }) };
      };
      const mailer = createMailer(loadConfig({ ...database, BREVO_API_KEY: 'test-brevo-key', BREVO_SENDER_EMAIL: 'verified@gmail.com', BREVO_SENDER_NAME: 'Equipo EMA' }));
      const message = { from: 'Unrelated <unused@example.test>', to: 'recipient@gmail.com', subject: 'Invitación EMA', text: 'URL personal', html: '<p>Invitación</p>' };
      assert.deepEqual(await mailer.sendMail(message), { messageId: '<queued-message@brevo.test>' });
      const { url, options } = requests[0];
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['api-key'], 'test-brevo-key');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(options.body), {
        sender: { name: 'Equipo EMA', email: 'verified@gmail.com' },
        to: [{ email: 'recipient@gmail.com' }], subject: message.subject,
        htmlContent: message.html, textContent: message.text,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('preserves Brevo rejection as a safe failure without reading provider error details', async () => {
    const originalFetch = global.fetch;
    try {
      const mailer = createMailer(loadConfig({ ...database, BREVO_API_KEY: 'secret-brevo-key' }));
      for (const status of [401, 403, 429, 500]) {
        global.fetch = async () => ({ ok: false, status, json: async () => { throw new Error('secret-brevo-key provider-private-detail'); } });
        await assert.rejects(() => mailer.sendMail({ to: 'recipient@gmail.com' }), error => {
          assert.equal(error.message, `El proveedor de correo rechazó el envío (${status}).`);
          assert.ok(!error.message.includes('secret-brevo-key'));
          assert.ok(!error.message.includes('provider-private-detail'));
          return true;
        });
      }
    } finally {
      global.fetch = originalFetch;
    }
  });
});
