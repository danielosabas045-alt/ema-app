'use strict';

(() => {
  const root = document.getElementById('root');
  const state = { user: null, page: 'dashboard', data: {}, search: '', recordPage: 1, health: null, request: 0 };
  const roles = { admin: 'Administrador', moderator: 'Moderador', user: 'Usuario' };
  const labels = { dashboard: 'Vista general', records: 'Registros', users: 'Equipo', invitations: 'Invitaciones', settings: 'Configuración' };
  const paths = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    records: 'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3 M8 2h8v4H8z M7 11h10 M7 16h7',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    invitations: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M22 6l-10 7L2 6',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3l-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3z',
    plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
    arrow: 'M5 12h14 M12 5l7 7-7 7', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
    close: 'M6 6l12 12 M6 18L18 6', menu: 'M3 6h18 M3 12h18 M3 18h18',
    check: 'M20 6L9 17l-5-5', shield: 'M12 3l9 4v6c0 5-9 9-9 9s-9-4-9-9V7z M8 12l3 3 5-5',
    download: 'M12 3v12 M7 10l5 5 5-5 M5 16v5h14v-5', edit: 'M12 20H4V12 M16 3l5 5-11 11-5 1 1-5z',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7', refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4', alert: 'M12 3L2 21h20z M12 9v5 M12 17v1',
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.records}"/></svg>`;
  const date = value => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'; };
  const initials = name => String(name || 'EMA').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const isAdmin = () => state.user?.role === 'admin';
  const button = (action, text, cls = 'btn', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
  const loading = () => '<div class="loading" role="status"><span class="spinner"></span><span>Cargando información…</span></div>';
  const empty = (name, title, text, action = '') => `<div class="empty"><span class="empty-icon">${icon(name)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

  function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function hasLegacy() { const text = storageGet('ema_database_workspace_v3'); if (!text) return false; try { const data = JSON.parse(text); return ['users', 'records', 'invites'].some(key => data[key]?.length); } catch { return true; } }

  async function api(path, { method = 'GET', body, signal } = {}) {
    let response;
    try {
      response = await fetch(`/api${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-EMA-Request': 'true' } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}) });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    }
    const data = await response.json().catch(() => null);
    if (!data) throw new Error('El servidor no respondió como se esperaba. Comprueba que estás usando la dirección de tu servidor EMA.');
    if (!response.ok) { const error = new Error(data.error || 'No se pudo completar la operación.'); error.status = response.status; error.code = data.code; throw error; }
    return data;
  }

  function toast(message, type = 'success') {
    const box = document.createElement('div'); box.className = `toast ${type}`; box.setAttribute('role', type === 'error' ? 'alert' : 'status');
    box.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span></span>`; box.querySelector('span').textContent = message;
    document.getElementById('toasts').append(box); setTimeout(() => box.remove(), 6500);
  }

  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function authLayout(content) {
    root.innerHTML = `<main id="main-content" class="auth-layout"><section class="auth-story"><a class="brand brand-light" href="./"><span class="brand-mark">E<span>·</span></span><span>EMA<span class="brand-caption">DATABASE</span></span></a><div class="story-content"><div class="eyebrow light">UN ESPACIO PARA AVANZAR</div><h1>Tu información,<br>en buena compañía.</h1><p>Organiza tus registros, conecta a tu equipo y mantén todo en un solo lugar.</p><div class="story-visual" aria-hidden="true"><div class="visual-top"><span></span><span></span><span></span></div><div class="visual-heading"><span class="mini-avatar">E</span><div><b>Todo en su lugar</b><small>Un equipo. Un espacio.</small></div><span class="mini-badge">✓</span></div><div class="visual-row"><span class="visual-line long"></span><span class="visual-pill"></span></div><div class="visual-row"><span class="visual-line medium"></span><span class="visual-pill"></span></div><div class="visual-row"><span class="visual-line short"></span><span class="visual-pill"></span></div><div class="visual-footer">${icon('shield')} Acceso seguro · Información compartida</div></div></div><p class="story-bottom">Menos desorden. Más claridad.</p></section><section class="auth-panel">${content}</section></main>`;
  }

  function login(message = '') {
    state.user = null;
    authLayout(`<div class="auth-box"><span class="eyebrow">BIENVENIDO A EMA</span><h2>Entra a tu espacio</h2><p class="muted">Ingresa con el correo de tu cuenta.</p>${message ? `<div class="notice">${esc(message)}</div>` : ''}<form id="login-form" class="form"><label>Correo electrónico<input name="email" type="email" autocomplete="username" placeholder="tu@correo.com" required maxlength="254"></label><label><span class="label-row">Contraseña<button type="button" class="text-btn" data-action="forgot">¿La olvidaste?</button></span><span class="password-field"><input name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="Tu contraseña"><button type="button" data-action="toggle-password" aria-label="Mostrar contraseña">Ver</button></span></label><div class="form-error" role="alert"></div><button class="btn primary full" type="submit">Entrar ${icon('arrow')}</button></form><div class="auth-note">${icon('lock')} Tu sesión se protege con una cookie segura.</div><p class="auth-help">¿Aún no tienes cuenta? Pide una invitación al administrador de tu equipo.</p></div>`);
  }

  function forgot() {
    authLayout(`<div class="auth-box"><span class="eyebrow">RECUPERA EL ACCESO</span><h2>¿Olvidaste tu contraseña?</h2><p class="muted">Te enviaremos un enlace si el correo pertenece a una cuenta activa.</p><form id="forgot-form" class="form"><label>Correo electrónico<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="tu@correo.com"></label><div class="form-error" role="alert"></div><button type="submit" class="btn primary full">Enviar enlace ${icon('arrow')}</button></form><button type="button" class="text-btn auth-back" data-action="login">Volver al inicio de sesión</button></div>`);
  }

  function validServer(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname.endsWith('.github.io') || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Usa la URL HTTPS principal de tu servidor, por ejemplo https://tu-ema.onrender.com.');
    return url.origin;
  }

  async function connection() {
    let configured = '';
    try { const config = await fetch('config.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}); configured = config.serverUrl || ''; } catch { /* An empty configuration keeps setup available. */ }
    const saved = storageGet('ema_server_url') || configured;
    authLayout(`<div class="auth-box connection-box"><span class="eyebrow">EL SIGUIENTE PASO PARA TU ESPACIO</span><h2>Conecta tu servidor EMA</h2><p class="muted">Esta dirección de GitHub Pages muestra la interfaz. Para guardar datos en SQL, iniciar sesión y enviar invitaciones, abre EMA desde su servidor.</p><div class="connection-features"><span>${icon('records')} Base de datos compartida</span><span>${icon('invitations')} Invitaciones por correo</span><span>${icon('shield')} Cuentas y permisos</span></div><form id="server-form" class="form"><label>URL pública del servidor<input name="server" type="url" placeholder="https://tu-ema.onrender.com" value="${esc(saved)}" required autocomplete="url"></label><div class="form-error" role="alert"></div><button type="submit" class="btn primary full">Abrir EMA ${icon('arrow')}</button></form><div class="setup-help"><h3>¿Todavía no tienes servidor?</h3><p>El repositorio incluye la instalación de EMA y PostgreSQL para Render. Configura allí el correo y las claves privadas.</p><a class="text-link" href="https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fdanielosabas045-alt%2Fema-app" target="_blank" rel="noopener noreferrer">Preparar servidor en Render ${icon('arrow')}</a><small>Revisa el plan y los costes en Render antes de desplegar.</small></div>${hasLegacy() ? `<div class="legacy-note"><p>Hay datos de la versión anterior en este navegador. Descarga una copia para conservarlos.</p>${button('legacy-export', `${icon('download')} Descargar copia anterior`, 'btn secondary full')}</div>` : ''}<a class="quiet-link" href="https://github.com/danielosabas045-alt/ema-app#readme" target="_blank" rel="noopener noreferrer">Ver guía de instalación</a></div>`);
  }

  function shell(content = loading()) {
    const nav = ['dashboard', 'records', ...(isAdmin() ? ['users', 'invitations'] : []), 'settings'];
    root.innerHTML = `<div class="app"><aside class="sidebar" id="sidebar" aria-label="Navegación principal"><a class="brand brand-light" href="./"><span class="brand-mark">E<span>·</span></span><span>EMA<span class="brand-caption">DATABASE</span></span></a><div class="workspace-label"><span class="workspace-dot"></span> ESPACIO DE TRABAJO</div><nav class="nav">${nav.map(page => `<button type="button" data-page="${page}" class="nav-link ${state.page === page ? 'selected' : ''}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(page)}<span>${labels[page]}</span>${state.page === page ? '<span class="nav-selected-dot"></span>' : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-note">${icon('shield')}<p>Un espacio seguro<br><span>para tu equipo y tus datos.</span></p></div><div class="sidebar-profile"><span class="avatar">${esc(initials(state.user.name))}</span><div><b>${esc(state.user.name)}</b><small>${esc(roles[state.user.role] || state.user.role)}</small></div>${button('logout', icon('logout'), 'icon-btn logout-btn', 'aria-label="Cerrar sesión" title="Cerrar sesión"')}</div></div></aside><button type="button" class="sidebar-overlay" data-action="close-menu" aria-label="Cerrar menú"></button><div class="main"><header class="topbar"><div class="topbar-start">${button('menu', icon('menu'), 'icon-btn mobile-menu', 'aria-label="Abrir menú" aria-controls="sidebar" aria-expanded="false"')}<div class="breadcrumb">Espacio de trabajo<span>/</span><b>${labels[state.page]}</b></div></div><div class="topbar-account"><span class="online-label"><span class="status-dot"></span> Conectado</span><span class="avatar small">${esc(initials(state.user.name))}</span></div></header><main class="content" id="main-content" tabindex="-1">${content}</main><footer class="app-footer"><span>EMA Database</span><span>Claridad para tu día a día.</span></footer></div></div>`;
  }

  const pageHeading = (eyebrow, title, subtitle, actions = '') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
  const badge = (value, statusClass = '') => `<span class="badge ${statusClass}"><span></span>${esc(value)}</span>`;

  function recordRows(records, compact = false) {
    return records.map(record => `<tr><td><div class="record-title">${icon('records')}<div><b>${esc(record.title)}</b>${!compact ? `<span class="record-description">${esc(record.description || 'Sin descripción')}</span>` : ''}</div></div></td><td><span class="owner-cell">${esc(record.owner_email || state.user.email)}</span></td><td class="date-cell">${date(record.created_at)}</td>${!compact ? `<td><div class="table-actions">${button('record-edit', icon('edit'), 'icon-btn', `data-id="${esc(record.id)}" aria-label="Editar ${esc(record.title)}" title="Editar"`)}${button('record-delete', icon('trash'), 'icon-btn danger-text', `data-id="${esc(record.id)}" aria-label="Eliminar ${esc(record.title)}" title="Eliminar"`)}</div></td>` : ''}</tr>`).join('');
  }

  function dashboard(data) {
    const recent = data.recentRecords || data.recent_records || [];
    return pageHeading('TU ESPACIO, DE UN VISTAZO', `Hola, ${esc(state.user.name.split(' ')[0])} <span class="greeting-dot">.</span>`, 'Todo lo que necesitas para seguir avanzando.', button('record-new', `${icon('plus')} Nuevo registro`, 'btn primary')) +
      `<div class="stats-grid"><article class="stat-card"><div class="stat-label">Registros ${icon('records')}</div><strong>${Number(data.records) || 0}</strong><span>${state.user.role === 'user' ? 'Tus registros guardados' : 'En el espacio de trabajo'}</span><div class="stat-accent teal"></div></article><article class="stat-card"><div class="stat-label">${!isAdmin() ? 'Tu cuenta' : 'Miembros del equipo'} ${icon('users')}</div><strong>${!isAdmin() ? 'Activa' : Number(data.users) || 0}</strong><span>${!isAdmin() ? esc(roles[state.user.role]) : 'Personas en tu equipo'}</span><div class="stat-accent blue"></div></article><article class="stat-card"><div class="stat-label">${isAdmin() ? 'Invitaciones' : 'Tu espacio'} ${icon(isAdmin() ? 'invitations' : 'shield')}</div><strong>${isAdmin() ? Number(data.invitations) || 0 : 'En línea'}</strong><span>${isAdmin() ? 'Historial de invitaciones' : 'Conexión con el servidor activa'}</span><div class="stat-accent amber"></div></article></div><div class="dashboard-grid"><section class="card recent-card"><div class="card-heading"><div><h2>Registros recientes</h2><p>La información más reciente de tu espacio.</p></div>${button('go-records', `Ver todos ${icon('arrow')}`, 'text-btn')}</div>${recent.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Registro</th><th>Creado por</th><th>Fecha</th></tr></thead><tbody>${recordRows(recent.slice(0, 5), true)}</tbody></table></div>` : empty('records', 'Tu próximo paso empieza aquí', 'Crea tu primer registro y mantén la información organizada.', button('record-new', `${icon('plus')} Crear registro`, 'btn secondary'))}</section><section class="card welcome-card"><div class="welcome-symbol">${icon('users')}</div><span class="eyebrow">MEJOR EN EQUIPO</span><h2>Un lugar para<br>trabajar juntos.</h2><p>${isAdmin() ? 'Invita a tu equipo por correo y comparte un espacio con acceso controlado.' : 'Tu equipo y tus registros, conectados en un mismo espacio.'}</p>${isAdmin() ? button('invite-new', `Invitar persona ${icon('arrow')}`, 'btn primary') : button('go-settings', `Mi cuenta ${icon('arrow')}`, 'btn secondary')}<div class="welcome-footer">${icon('shield')} Cada persona, con su propio acceso.</div></section></div><div class="tip-bar">${icon('check')}<span>Los cambios se guardan en la base de datos del servidor.</span><span class="tip-tag">Todo en su lugar</span></div>`;
  }

  function recordsPage(data) {
    const list = data.records || []; const total = Number(data.total) || 0; const pages = Math.max(1, Math.ceil(total / (data.limit || 20)));
    return pageHeading('TU INFORMACIÓN ORGANIZADA', 'Registros', state.user.role === 'user' ? 'Crea y administra tus registros.' : 'Consulta y administra los registros de tu equipo.', button('records-export', `${icon('download')} Exportar CSV`, 'btn secondary') + button('record-new', `${icon('plus')} Nuevo registro`, 'btn primary')) + `<section class="card records-card"><div class="table-toolbar"><form id="search-form" class="search-form" role="search">${icon('search')}<input type="search" name="search" placeholder="Buscar registros…" aria-label="Buscar registros" value="${esc(state.search)}" maxlength="160"><button class="btn small-btn" type="submit">Buscar</button></form><span class="count-label">${total} ${total === 1 ? 'registro' : 'registros'}</span></div>${list.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Registro</th><th>Creado por</th><th>Fecha</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${recordRows(list)}</tbody></table></div>` : empty('records', state.search ? 'Sin resultados' : 'Aún no hay registros', state.search ? 'Prueba con otra palabra o limpia la búsqueda.' : 'Agrega tu primer registro para comenzar.', !state.search ? button('record-new', `${icon('plus')} Crear registro`, 'btn secondary') : button('search-clear', 'Limpiar búsqueda', 'btn secondary'))}<div class="pagination"><span>Página ${state.recordPage} de ${pages}</span><div>${button('records-prev', 'Anterior', 'btn small-btn secondary', state.recordPage <= 1 ? 'disabled' : '')}${button('records-next', 'Siguiente', 'btn small-btn secondary', state.recordPage >= pages ? 'disabled' : '')}</div></div></section>`;
  }

  function userStatus(user) { return ({ active: ['Activo', 'green'], pending: ['Pendiente', 'amber'], suspended: ['Suspendido', 'red'] })[user.status] || [user.status, 'neutral']; }
  function usersPage(data) {
    const users = data.users || [];
    return pageHeading('PERSONAS QUE SUMAN', 'Tu equipo', 'Gestiona las personas y los permisos de tu espacio.', button('invite-new', `${icon('plus')} Invitar persona`, 'btn primary')) + `<section class="card"><div class="card-heading"><div><h2>Miembros del equipo <span class="number-pill">${users.length}</span></h2><p>Las personas invitadas crean su contraseña desde el correo.</p></div></div>${users.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Invitado el</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${users.map(user => `<tr><td><div class="person-cell"><span class="avatar table-avatar">${esc(initials(user.name))}</span><div><b>${esc(user.name)}</b><small>${esc(user.email)}</small></div></div></td><td>${esc(roles[user.role] || user.role)}</td><td>${badge(...userStatus(user))}</td><td class="date-cell">${date(user.created_at)}</td><td><div class="table-actions">${user.status === 'pending' ? button('invite-resend', icon('refresh'), 'icon-btn', `data-id="${esc(user.id)}" aria-label="Reenviar invitación a ${esc(user.email)}" title="Reenviar invitación"`) : ''}${user.role !== 'admin' ? button('user-edit', icon('edit'), 'icon-btn', `data-id="${esc(user.id)}" aria-label="Editar ${esc(user.name)}" title="Editar persona"`) : ''}</div></td></tr>`).join('')}</tbody></table></div>` : empty('users', 'Tu equipo empieza contigo', 'Invita a una persona para compartir este espacio.', button('invite-new', `${icon('plus')} Invitar persona`, 'btn secondary'))}</section><div class="tip-bar">${icon('shield')}<span>Los administradores gestionan el equipo. Los moderadores gestionan todos los registros. Cada usuario gestiona los suyos.</span></div>`;
  }

  function invitationStatus(invitation) {
    if (invitation.accepted_at || invitation.status === 'accepted') return ['Aceptada', 'green'];
    if (invitation.status === 'failed' || invitation.last_error) return ['Envío fallido', 'red'];
    if (invitation.status === 'revoked' || invitation.status === 'superseded') return ['Reemplazada', 'neutral'];
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) return ['Expirada', 'neutral'];
    if (invitation.status === 'sending' || invitation.status === 'pending') return ['En proceso', 'amber'];
    return ['Enviada', 'blue'];
  }

  function invitationsPage(data) {
    const list = data.invitations || [];
    return pageHeading('ACCESOS QUE CONECTAN', 'Invitaciones', 'Sigue el estado de las invitaciones de tu equipo.', button('invite-new', `${icon('plus')} Invitar persona`, 'btn primary')) + `<div class="notice info-notice">${icon('invitations')}<span>“Enviada” indica que el proveedor de correo aceptó el mensaje. La entrega puede depender de Gmail y del filtro de spam. Los enlaces vencen a las 48 horas.</span></div><section class="card section-gap">${list.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Correo electrónico</th><th>Rol</th><th>Estado</th><th>Fecha</th><th>Aceptación</th></tr></thead><tbody>${list.map(invitation => `<tr><td><b>${esc(invitation.email)}</b>${invitation.last_error ? '<small class="table-note danger-text">No se pudo enviar. Puedes reintentar desde Equipo.</small>' : ''}</td><td>${esc(roles[invitation.role] || invitation.role)}</td><td>${badge(...invitationStatus(invitation))}</td><td class="date-cell">${date(invitation.sent_at || invitation.created_at)}</td><td class="date-cell">${date(invitation.accepted_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('invitations', 'Aún no hay invitaciones', 'Las invitaciones y su estado aparecerán aquí.')}</section>`;
  }

  function settingsPage() {
    const health = state.health;
    return pageHeading('TU ESPACIO, A TU MANERA', 'Configuración', 'Tu cuenta, seguridad y estado del espacio.') + `<div class="settings-grid"><section class="card"><div class="card-heading"><div><h2>Tu cuenta</h2><p>Información de tu acceso a EMA.</p></div><span class="avatar">${esc(initials(state.user.name))}</span></div><dl class="details-list"><div><dt>Nombre</dt><dd>${esc(state.user.name)}</dd></div><div><dt>Correo</dt><dd>${esc(state.user.email)}</dd></div><div><dt>Rol</dt><dd>${esc(roles[state.user.role])}</dd></div><div><dt>Sesión</dt><dd>${badge('Activa', 'green')}</dd></div></dl><div class="card-footer">${button('logout', `${icon('logout')} Cerrar sesión`, 'btn secondary')}</div></section><section class="card"><div class="card-heading"><div><h2>Seguridad</h2><p>Actualiza tu contraseña de acceso.</p></div>${icon('lock')}</div><form id="password-form" class="form"><label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>Nueva contraseña<input name="newPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128" aria-describedby="password-help"></label><small id="password-help" class="field-help">Usa al menos 12 caracteres. Combina palabras, números y símbolos.</small><label>Confirma la nueva contraseña<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label><div class="form-error" role="alert"></div><button class="btn primary" type="submit">Guardar contraseña</button></form></section><section class="card"><div class="card-heading"><div><h2>Estado del sistema</h2><p>Servicios de tu espacio de trabajo.</p></div>${button('refresh-health', icon('refresh'), 'icon-btn', 'aria-label="Actualizar estado"')}</div><dl class="details-list"><div><dt>Servidor</dt><dd>${health?.ok ? badge('Disponible', 'green') : badge('Revisar conexión', 'amber')}</dd></div><div><dt>Base de datos SQL</dt><dd>${health?.ok ? badge('Conectada', 'green') : badge('Sin confirmar', 'amber')}</dd></div><div><dt>Correo de invitaciones</dt><dd>${health?.emailConfigured ? badge('Configurado', 'green') : badge('Pendiente de configurar', 'amber')}</dd></div><div><dt>Versión</dt><dd>${esc(health?.version || '—')}</dd></div></dl>${!health?.emailConfigured ? '<div class="notice">El administrador del servidor debe configurar un proveedor de correo antes de enviar invitaciones.</div>' : '<div class="notice">Los proveedores de correo pueden aplicar límites de envío. Revisa Invitaciones para ver el resultado de cada solicitud.</div>'}</section>${hasLegacy() ? `<section class="card"><div class="card-heading"><div><h2>Datos de la versión anterior</h2><p>Copia local de este navegador.</p></div>${icon('download')}</div><p class="muted">Estos datos no se han enviado automáticamente al servidor. Descarga el archivo para conservar una copia y revisar su contenido.</p>${button('legacy-export', `${icon('download')} Descargar copia JSON`, 'btn secondary')}</section>` : ''}</div>`;
  }

  async function loadPage(page = state.page, { keepFocus = false } = {}) {
    state.page = page; const request = ++state.request;
    shell();
    try {
      let data;
      if (page === 'records') {
        data = await api(`/records?search=${encodeURIComponent(state.search)}&page=${state.recordPage}&limit=20`);
        const lastPage = Math.max(1, Math.ceil(Number(data.total) / (Number(data.limit) || 20)));
        if (state.recordPage > lastPage) { state.recordPage = lastPage; return loadPage(page); }
      }
      else if (page === 'settings') { state.health = await api('/health'); data = {}; }
      else data = await api(`/${page}`);
      if (request !== state.request) return;
      state.data = data;
      const renderers = { dashboard, records: recordsPage, users: usersPage, invitations: invitationsPage, settings: settingsPage };
      shell(renderers[page](data));
      if (!keepFocus) document.getElementById('main-content').focus({ preventScroll: true });
    } catch (error) {
      if (request !== state.request) return;
      if (error.status === 401) return login('Tu sesión terminó. Vuelve a entrar para continuar.');
      if (error.status === 403) { state.page = 'dashboard'; toast('No tienes permiso para ver esa sección.', 'error'); return loadPage(); }
      shell(`<div class="error-state">${icon('alert')}<h1>No pudimos cargar esta sección</h1><p>${esc(error.message)}</p>${button('retry-page', `${icon('refresh')} Volver a intentar`, 'btn primary')}</div>`);
    }
  }

  function modal(title, subtitle, content, kind, submitLabel = 'Guardar cambios', extra = '') {
    closeModal(); const dialog = document.createElement('dialog'); dialog.id = 'modal'; dialog.className = 'modal'; dialog.innerHTML = `<div class="modal-heading"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div>${button('modal-close', icon('close'), 'icon-btn', 'aria-label="Cerrar"')}</div><form id="modal-form" data-kind="${kind}" ${extra} class="form">${content}<div class="form-error" role="alert"></div><div class="modal-actions">${button('modal-close', 'Cancelar', 'btn secondary')}<button type="submit" class="btn primary">${submitLabel}</button></div></form>`;
    dialog.setAttribute('aria-labelledby', 'modal-title'); document.body.append(dialog); dialog.showModal(); dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
  }
  function closeModal() { const dialog = document.getElementById('modal'); if (dialog) { dialog.close(); dialog.remove(); } }

  function recordModal(record) {
    modal(record ? 'Editar registro' : 'Nuevo registro', 'La información se guardará en tu espacio de trabajo.', `<label>Título<input name="title" required maxlength="160" value="${esc(record?.title || '')}" placeholder="Dale un nombre claro a tu registro"></label><label>Descripción<textarea name="description" maxlength="10000" rows="6" placeholder="Agrega la información que necesitas conservar…">${esc(record?.description || '')}</textarea></label><small class="field-help">Título de hasta 160 caracteres. Descripción de hasta 10.000.</small>`, record ? 'record-edit' : 'record-new', record ? 'Guardar cambios' : 'Crear registro', record ? `data-id="${esc(record.id)}"` : '');
  }

  function inviteModal() {
    modal('Invitar a tu equipo', 'Enviaremos un enlace para que cree su propia contraseña.', '<label>Nombre<input name="name" required maxlength="120" autocomplete="name" placeholder="Nombre de la persona"></label><label>Correo electrónico<input name="email" type="email" required maxlength="254" autocomplete="email" placeholder="persona@gmail.com"></label><label>Rol<select name="role"><option value="user">Usuario · administra sus registros</option><option value="moderator">Moderador · administra todos los registros</option></select></label><div class="notice">El enlace de acceso es personal y vence a las 48 horas. La cuenta se activa al aceptar la invitación.</div>', 'invite-new', 'Enviar invitación');
  }

  async function exportRecords(target) {
    target.disabled = true;
    try {
      const records = []; let page = 1; let total = Infinity;
      while (records.length < total) { const data = await api(`/records?search=${encodeURIComponent(state.search)}&page=${page}&limit=100`); records.push(...data.records); total = Number(data.total); if (!data.records.length) break; page++; }
      const cell = value => { let text = String(value ?? ''); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
      const rows = [['ID', 'Título', 'Descripción', 'Correo del propietario', 'Fecha de creación'], ...records.map(r => [r.id, r.title, r.description, r.owner_email, r.created_at])];
      download('\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'), `ema-registros-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); toast(`Exportados ${records.length} registros.`);
    } catch (error) { toast(error.message, 'error'); } finally { target.disabled = false; }
  }

  document.addEventListener('click', async event => {
    const nav = event.target.closest('[data-page]');
    if (nav) { state.search = ''; state.recordPage = 1; return loadPage(nav.dataset.page); }
    const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
    const action = target.dataset.action;
    try {
      if (action === 'login') return login();
      if (action === 'forgot') return forgot();
      if (action === 'toggle-password') { const input = target.previousElementSibling; const showing = input.type === 'password'; input.type = showing ? 'text' : 'password'; target.textContent = showing ? 'Ocultar' : 'Ver'; target.setAttribute('aria-label', showing ? 'Ocultar contraseña' : 'Mostrar contraseña'); return; }
      if (action === 'menu' || action === 'close-menu') { const open = action === 'menu' && !document.querySelector('.app').classList.contains('menu-open'); document.querySelector('.app').classList.toggle('menu-open', open); document.querySelector('[data-action="menu"]').setAttribute('aria-expanded', String(open)); return; }
      if (action === 'modal-close') return closeModal();
      if (action === 'retry-page' || action === 'refresh-health') return loadPage();
      if (action === 'retry-start') return start();
      if (action === 'logout') { await api('/logout', { method: 'POST' }); state.user = null; state.request++; closeModal(); return login('Has cerrado sesión.'); }
      if (action === 'go-records') return loadPage('records');
      if (action === 'go-settings') return loadPage('settings');
      if (action === 'record-new') return recordModal();
      if (action === 'record-edit') return recordModal(state.data.records?.find(r => String(r.id) === target.dataset.id));
      if (action === 'invite-new') return inviteModal();
      if (action === 'records-export') return exportRecords(target);
      if (action === 'records-prev' || action === 'records-next') { state.recordPage += action === 'records-prev' ? -1 : 1; return loadPage(); }
      if (action === 'search-clear') { state.search = ''; state.recordPage = 1; return loadPage(); }
      if (action === 'legacy-export') { const content = storageGet('ema_database_workspace_v3'); if (!content) throw new Error('No se encontraron datos anteriores en este navegador.'); download(content, `ema-copia-local-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'); return; }
      if (action === 'record-delete') { const record = state.data.records?.find(r => String(r.id) === target.dataset.id); if (!record) return; return modal('Eliminar registro', 'Esta acción no se puede deshacer.', `<p class="confirm-text">¿Quieres eliminar <strong>${esc(record.title)}</strong> de la base de datos?</p>`, 'record-delete', 'Eliminar registro', `data-id="${esc(record.id)}"`); }
      if (action === 'invite-resend') { const user = state.data.users?.find(u => String(u.id) === target.dataset.id); return modal('Reenviar invitación', 'Se generará un nuevo enlace con vigencia de 48 horas.', `<p class="confirm-text">Enviaremos otra invitación a <strong>${esc(user?.email || '')}</strong>. El enlace anterior dejará de funcionar.</p>`, 'invite-resend', 'Reenviar invitación', `data-id="${esc(target.dataset.id)}"`); }
      if (action === 'user-edit') { const user = state.data.users?.find(u => String(u.id) === target.dataset.id); if (!user) return; return modal('Editar persona', esc(user.email), `<label>Nombre<input name="name" required maxlength="120" value="${esc(user.name)}"></label><label>Rol<select name="role"><option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option><option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderador</option></select></label>${user.status !== 'pending' ? `<label>Estado<select name="status"><option value="active" ${user.status === 'active' ? 'selected' : ''}>Activo</option><option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspendido · sin acceso</option></select></label>` : '<div class="notice">La cuenta está pendiente hasta que acepte la invitación. Si cambias su rol, reenvía la invitación para actualizar el correo.</div>'}`, 'user-edit', 'Guardar cambios', `data-id="${esc(user.id)}"`); }
    } catch (error) { if (error.status === 401) login('Tu sesión terminó. Vuelve a entrar.'); else toast(error.message, 'error'); }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelector('.app')?.classList.remove('menu-open'); const menu = document.querySelector('[data-action="menu"]'); if (menu) menu.setAttribute('aria-expanded', 'false'); } });

  document.addEventListener('submit', async event => {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const submit = form.querySelector('[type="submit"]'); const errorBox = form.querySelector('.form-error');
    if (errorBox) errorBox.textContent = '';
    if (form.id === 'search-form') { state.search = data.search.trim(); state.recordPage = 1; return loadPage(); }
    if (form.id === 'server-form') { try { const url = validServer(data.server.trim()); try { localStorage.setItem('ema_server_url', url); } catch { /* Navigation still works without storage. */ } location.assign(url); } catch (error) { errorBox.textContent = error.message; } return; }
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      if (form.id === 'login-form') { const result = await api('/login', { method: 'POST', body: data }); state.user = result.user; state.page = 'dashboard'; return loadPage(); }
      if (form.id === 'forgot-form') { const result = await api('/password/forgot', { method: 'POST', body: data }); form.innerHTML = `<div class="notice success-notice">${esc(result.message || 'Si existe una cuenta activa con ese correo, recibirás un enlace para recuperar el acceso. Revisa también la carpeta de spam.')}</div>`; return; }
      if (form.id === 'password-form') { if (data.newPassword !== data.confirmPassword) throw new Error('Las contraseñas nuevas no coinciden.'); await api('/password/change', { method: 'POST', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } }); form.reset(); toast('Contraseña actualizada.'); return; }
      if (form.id === 'modal-form') {
        const kind = form.dataset.kind; const id = form.dataset.id;
        if (kind === 'record-new') await api('/records', { method: 'POST', body: data });
        else if (kind === 'record-edit') await api(`/records/${id}`, { method: 'PATCH', body: data });
        else if (kind === 'record-delete') await api(`/records/${id}`, { method: 'DELETE' });
        else if (kind === 'invite-new') await api('/users/invite', { method: 'POST', body: data });
        else if (kind === 'invite-resend') await api(`/users/${id}/resend`, { method: 'POST' });
        else if (kind === 'user-edit') await api(`/users/${id}`, { method: 'PATCH', body: data });
        closeModal(); toast(({ 'record-new': 'Registro creado.', 'record-edit': 'Registro actualizado.', 'record-delete': 'Registro eliminado.', 'invite-new': 'El proveedor de correo aceptó la invitación para su envío.', 'invite-resend': 'El proveedor de correo aceptó el reenvío de la invitación.', 'user-edit': 'Persona actualizada.' })[kind]);
        if (kind === 'record-new' && state.page === 'records') { state.search = ''; state.recordPage = 1; }
        return loadPage();
      }
    } catch (error) {
      if (error.status === 401 && !['login-form', 'forgot-form'].includes(form.id)) { closeModal(); return login('Tu sesión terminó. Vuelve a entrar.'); }
      if (errorBox) errorBox.textContent = error.message; else toast(error.message, 'error');
      if (error.status === 502 && form.id === 'modal-form' && state.page === 'users') {
        const snapshot = await api('/users').catch(() => null);
        if (snapshot && state.page === 'users' && state.user) { state.data = snapshot; shell(usersPage(snapshot)); }
      }
    } finally { if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } }
  });

  async function start() {
    if (location.hostname.endsWith('.github.io') || location.protocol === 'file:') return connection();
    try { const data = await api('/me'); state.user = data.user; return loadPage('dashboard'); }
    catch (error) {
      if (error.status === 401) return login();
      authLayout(`<div class="auth-box"><span class="eyebrow">CONEXIÓN CON EMA</span><h2>Tu espacio no está disponible</h2><p class="muted">${esc(error.message)}</p>${button('retry-start', `${icon('refresh')} Volver a intentar`, 'btn primary full')}<p class="auth-help">Si el servidor acaba de iniciarse, espera unos instantes y vuelve a probar.</p></div>`);
    }
  }

  start();
})();
