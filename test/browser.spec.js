'use strict';

const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createApp, initializeDatabase, loadConfig } = require('../server');

const databaseUrl = process.env.TEST_DATABASE_URL;
const baseUrl = 'http://127.0.0.1:3117';
const adminEmail = 'browser-admin@example.test';
const adminPassword = 'BrowserAdminPassword123!';
const invitedPassword = 'BrowserUserPassword456!';
const schema = `ema_browser_${process.pid}_${Date.now()}`;
let pool;
let maintenance;
let server;
const messages = [];

const activationUrl = message => {
  const match = message.text.match(/https?:\/\/[^\s<>"']+/g)?.find(value => value.includes('token='));
  expect(match).toBeTruthy();
  return match;
};

async function login(page, email = adminEmail, password = adminPassword) {
  await page.goto('/');
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.locator('#login-form input[name="password"]').fill(password);
  await page.getByRole('button', { name: /iniciar sesión|entrar/i }).click();
  await expect(page.getByRole('heading', { name: /panel|buen|hola/i }).first()).toBeVisible();
}

async function assertNoOverflow(page) {
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, viewport: innerWidth,
    overflowing: [...document.querySelectorAll('body *')].map(element => ({
      element: element.tagName, class: element.className?.baseVal ?? element.className,
      right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width),
    })).filter(element => element.right > innerWidth + 1).slice(0, 12),
  }));
  expect(layout.width <= layout.viewport, JSON.stringify(layout)).toBe(true);
}

test.describe('EMA browser workflows', () => {
  test.skip(!databaseUrl, 'Set TEST_DATABASE_URL to run browser tests against real PostgreSQL.');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
    maintenance = new Pool({ connectionString: databaseUrl });
    await maintenance.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, application_name: schema });
    const config = {
      ...loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, BASE_URL: baseUrl,
        ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, ADMIN_NAME: 'Daniel · EMA' }),
      bcryptRounds: 4,
    };
    await initializeDatabase(pool, config);
    const mailer = { async sendMail(message) { messages.push(message); return { accepted: [message.to], messageId: `browser-${messages.length}` }; } };
    const app = createApp({ pool, mailer, config });
    server = await new Promise((resolve, reject) => {
      const instance = app.listen(3117, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
  });

  test.afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (pool) await pool.end();
    if (maintenance) {
      await maintenance.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await maintenance.end();
    }
  });

  test('login and the full record workflow use the live API', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entra a tu espacio' })).toBeVisible();
    await page.getByLabel('Correo electrónico', { exact: true }).fill(adminEmail);
    await page.locator('#login-form input[name="password"]').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    await page.locator('#login-form input[name="password"]').fill(adminPassword);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Nuevo registro', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Nuevo registro' });
    await dialog.getByLabel('Título', { exact: true }).fill('Plan de lanzamiento');
    await dialog.getByLabel(/Descripción/).fill('Revisar la propuesta y compartir los próximos pasos con el equipo.');
    await dialog.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Plan de lanzamiento', exact: true })).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({ path: path.join(__dirname, '../artifacts/desktop.png'), fullPage: true });

    await page.getByRole('button', { name: 'Registros', exact: true }).click();
    await page.getByRole('button', { name: 'Editar Plan de lanzamiento', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Editar registro' });
    await dialog.getByLabel('Título', { exact: true }).fill('Plan de lanzamiento actualizado');
    await dialog.getByLabel(/Descripción/).fill('Propuesta aprobada.');
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.getByText('Propuesta aprobada.', { exact: true })).toBeVisible();
    await page.getByLabel('Buscar registros', { exact: true }).fill('lanzamiento');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar Plan de lanzamiento actualizado', exact: true })).toBeVisible();
    const csvPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
    const csv = await csvPromise;
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    expect(await fs.readFile(await csv.path(), 'utf8')).toContain('Plan de lanzamiento actualizado');
    await page.getByRole('button', { name: 'Eliminar Plan de lanzamiento actualizado', exact: true }).click();
    await page.getByRole('dialog', { name: 'Eliminar registro' }).getByRole('button', { name: 'Eliminar registro', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sin resultados', exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('an invited user activates in a separate browser and the mobile layout fits', async ({ page, browser }) => {
    await login(page);
    await page.getByRole('button', { name: 'Invitar persona', exact: true }).click();
    const invitation = page.getByRole('dialog', { name: 'Invitar a tu equipo' });
    await invitation.getByLabel('Nombre', { exact: true }).fill('Andrea Equipo');
    await invitation.getByLabel('Correo electrónico', { exact: true }).fill('andrea@example.test');
    await invitation.getByRole('combobox', { name: /^Rol/ }).selectOption('user');
    await invitation.getByRole('button', { name: 'Enviar invitación', exact: true }).click();
    await expect.poll(() => messages.filter(message => message.to === 'andrea@example.test').length).toBe(1);
    await expect(invitation).not.toBeVisible();

    const memberContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    try {
      const memberPage = await memberContext.newPage();
      const errors = [];
      memberPage.on('pageerror', error => errors.push(error.message));
      await memberPage.goto(activationUrl(messages.find(message => message.to === 'andrea@example.test')));
      await memberPage.getByLabel('Nombre', { exact: true }).fill('Andrea Equipo');
      await memberPage.getByLabel('Nueva contraseña', { exact: true }).fill(invitedPassword);
      await memberPage.getByLabel('Confirma tu contraseña', { exact: true }).fill(invitedPassword);
      await memberPage.getByRole('button', { name: 'Activar cuenta', exact: true }).click();
      await expect(memberPage.getByRole('heading', { name: /Hola, Andrea/ })).toBeVisible();
      await assertNoOverflow(memberPage);
      await memberPage.getByRole('button', { name: 'Nuevo registro', exact: true }).click();
      const record = memberPage.getByRole('dialog', { name: 'Nuevo registro' });
      await record.getByLabel('Título', { exact: true }).fill('Notas de Andrea');
      await record.getByLabel(/Descripción/).fill('Mi primer registro desde el móvil.');
      await record.getByRole('button', { name: 'Crear registro', exact: true }).click();
      await expect(memberPage.getByRole('cell', { name: 'Notas de Andrea', exact: true })).toBeVisible();
      await assertNoOverflow(memberPage);
      await memberPage.screenshot({ path: path.join(__dirname, '../artifacts/mobile.png'), fullPage: true });
      await memberPage.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      await expect(memberPage.getByRole('button', { name: 'Registros', exact: true })).toBeVisible();
      await expect(memberPage.getByRole('button', { name: 'Equipo', exact: true })).toHaveCount(0);
      await memberPage.getByRole('button', { name: 'Registros', exact: true }).click();
      await expect(memberPage.getByRole('cell', { name: 'andrea@example.test', exact: true })).toBeVisible();
      await assertNoOverflow(memberPage);
      expect(errors).toEqual([]);
    } finally {
      await memberContext.close();
    }
    await page.getByRole('button', { name: 'Equipo', exact: true }).click();
    const memberRow = page.getByRole('row').filter({ hasText: 'andrea@example.test' });
    await expect(memberRow).toContainText('Activo');
  });

  test('GitHub Pages explains server setup and preserves legacy data for export', async ({ page }) => {
    const pagesOrigin = 'https://ema-browser-test.github.io';
    const requestedApi = [];
    await page.addInitScript(() => {
      localStorage.setItem('ema_database_workspace_v3', JSON.stringify({
        users: [{ email: 'legacy@example.test' }],
        records: [{ name: 'Registro anterior', description: 'Conservar' }], invites: [],
      }));
    });
    await page.route(`${pagesOrigin}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.includes('/api/')) {
        requestedApi.push(pathname);
        return route.fulfill({ status: 500, body: 'Pages must not call a backend on this host' });
      }
      const file = pathname.replace(/^\/ema-app\//, '') || 'index.html';
      const types = { 'index.html': 'text/html', 'app.js': 'application/javascript', 'styles.css': 'text/css', 'config.json': 'application/json' };
      if (!types[file]) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ status: 200, contentType: types[file], body: await fs.readFile(path.join(__dirname, '..', file)) });
    });
    await page.goto(`${pagesOrigin}/ema-app/`);
    await expect(page.getByRole('heading', { name: 'Conecta tu servidor EMA', exact: true })).toBeVisible();
    await expect(page.getByLabel('URL pública del servidor', { exact: true })).toBeVisible();
    await page.getByLabel('URL pública del servidor', { exact: true }).fill('http://insecure.example');
    await page.getByRole('button', { name: 'Abrir EMA', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('HTTPS');
    const exportPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar copia anterior', exact: true }).click();
    const legacy = await exportPromise;
    const exported = JSON.parse(await fs.readFile(await legacy.path(), 'utf8'));
    expect(exported.records[0].name).toBe('Registro anterior');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ema_database_workspace_v3')).records.length)).toBe(1);
    await assertNoOverflow(page);
    expect(requestedApi).toEqual([]);
  });
});
