'use strict';

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const baseUrl = (env.BASE_URL || env.RENDER_EXTERNAL_URL || (!production ? `http://localhost:${env.PORT || 3000}` : '')).replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error('BASE_URL debe ser una URL pública válida.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('BASE_URL debe contener solo el origen del servidor, sin rutas ni credenciales.');
  }
  if (production && parsed.protocol !== 'https:') throw new Error('BASE_URL debe usar HTTPS en producción.');
  const adminEmail = (env.ADMIN_EMAIL || 'danielosabas045@gmail.com').trim().toLowerCase();
  const adminPassword = env.ADMIN_PASSWORD || '';
  if (adminPassword && (adminPassword.length < 12 || adminPassword.length > 128 || Buffer.byteLength(adminPassword) > 72)) {
    throw new Error('ADMIN_PASSWORD debe tener entre 12 y 128 caracteres y como máximo 72 bytes.');
  }
  if (!env.DATABASE_URL && !(env.PGHOST && env.PGDATABASE)) throw new Error('Falta DATABASE_URL o PGHOST/PGDATABASE: configura una base PostgreSQL.');
  if (env.DATABASE_SSL && !['require', 'disable'].includes(env.DATABASE_SSL)) throw new Error('DATABASE_SSL debe ser require o disable.');
  if (env.RESEND_API_KEY && !env.MAIL_FROM) throw new Error('Configura MAIL_FROM con un remitente de dominio verificado en Resend.');
  const brevoSenderEmail = (env.BREVO_SENDER_EMAIL || adminEmail).trim().toLowerCase();
  const brevoSenderName = (env.BREVO_SENDER_NAME || 'EMA Database').trim();
  if (env.BREVO_API_KEY) {
    if (brevoSenderEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(brevoSenderEmail) || /[\r\n]/.test(env.BREVO_SENDER_EMAIL || adminEmail)) {
      throw new Error('BREVO_SENDER_EMAIL debe ser un correo válido verificado en Brevo.');
    }
    if (!brevoSenderName || brevoSenderName.length > 120 || /[\r\n]/.test(env.BREVO_SENDER_NAME || '')) {
      throw new Error('BREVO_SENDER_NAME debe tener entre 1 y 120 caracteres, sin saltos de línea.');
    }
  }
  let databaseUrl = env.DATABASE_URL || undefined;
  if (databaseUrl && env.DATABASE_SSL === 'require') {
    // pg gives connection-string SSL options precedence over the Pool's ssl
    // object. Normalize them so a URL cannot silently disable verification.
    let database;
    try { database = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL no es una URL PostgreSQL válida.'); }
    database.searchParams.delete('ssl');
    database.searchParams.delete('uselibpqcompat');
    database.searchParams.set('sslmode', 'verify-full');
    databaseUrl = database.toString();
  }
  const gmailPassword = (env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  return {
    port: Number(env.PORT || 3000), production, baseUrl: parsed.origin,
    databaseUrl, databaseSsl: env.DATABASE_SSL === 'require', adminEmail, adminPassword,
    adminName: env.ADMIN_NAME || 'Administrador',
    bcryptRounds: 12, sessionHours: 8, cookieSecure: production,
    mailProvider: env.RESEND_API_KEY ? 'resend' : env.BREVO_API_KEY ? 'brevo' : gmailPassword ? 'gmail' : env.SMTP_HOST ? 'smtp' : null,
    resendApiKey: env.RESEND_API_KEY || '', mailFrom: env.MAIL_FROM || `EMA Database <${env.GMAIL_USER || adminEmail}>`,
    brevoApiKey: env.BREVO_API_KEY || '', brevoSenderEmail, brevoSenderName,
    gmailUser: env.GMAIL_USER || adminEmail, gmailPassword,
    smtpHost: env.SMTP_HOST || '', smtpPort: Number(env.SMTP_PORT || 587), smtpSecure: env.SMTP_SECURE === 'true',
    smtpUser: env.SMTP_USER || '', smtpPassword: env.SMTP_PASSWORD || '',
    trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
  };
}

module.exports = { loadConfig };
