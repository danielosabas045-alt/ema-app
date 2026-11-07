'use strict';
const nodemailer = require('nodemailer');

function createMailer(config) {
  if (config.mailProvider === 'resend') {
    return { async sendMail(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      });
      if (!response.ok) throw new Error(`El proveedor de correo rechazó el envío (${response.status}).`);
      return response.json();
    } };
  }
  if (config.mailProvider === 'gmail') return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: config.gmailUser, pass: config.gmailPassword },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });
  if (config.mailProvider === 'smtp') return nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    requireTLS: Boolean(config.production) && !config.smtpSecure,
    ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });
  return null;
}

const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
function messageTemplate({ name, url, reset = false }) {
  const title = reset ? 'Restablecer contraseña' : 'Tu invitación a EMA Database';
  const body = reset ? 'Recibimos una solicitud para cambiar tu contraseña. El enlace caduca en una hora.' : 'Te invitamos a tu espacio de trabajo en EMA Database. Crea tu contraseña para comenzar. El enlace caduca en 48 horas.';
  const action = reset ? 'Crear nueva contraseña' : 'Aceptar invitación';
  return {
    subject: title,
    text: `Hola ${name}. ${body}\n\n${action}: ${url}\n\nSi no esperabas este correo, puedes ignorarlo.`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#eef3f9;font-family:Arial,sans-serif;padding:32px 12px"><main style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px"><p style="color:#2563eb;font-weight:700">EMA DATABASE</p><h1 style="font-size:26px;color:#17233b">${escape(title)}</h1><p>Hola ${escape(name)},</p><p style="line-height:1.7;color:#52627b">${escape(body)}</p><p style="padding:18px 0"><a style="background:#2563eb;color:#fff;padding:14px 22px;border-radius:9px;text-decoration:none" href="${escape(url)}">${escape(action)}</a></p><p style="font-size:12px;color:#52627b;overflow-wrap:anywhere">Si el botón no abre el enlace, copia esta dirección: ${escape(url)}</p><p style="font-size:12px;color:#52627b">Si no esperabas este correo, puedes ignorarlo.</p></main></body></html>`,
  };
}

module.exports = { createMailer, messageTemplate };
