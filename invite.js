'use strict';

(() => {
  const container = document.getElementById('invite-content');
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const token = hash.get('token') || query.get('token') || '';
  const mode = hash.get('mode') || query.get('mode') || 'invite';
  const reset = mode === 'reset';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Remove secrets from the visible URL and browser history after reading them.
  history.replaceState(null, '', location.pathname);

  async function api(path, body) {
    let response;
    try { response = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store', method: body ? 'POST' : 'GET', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'X-EMA-Request': 'true' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'); }
    const result = await response.json().catch(() => null);
    if (!result) throw new Error('Abre el enlace original recibido por correo. La activación necesita el servidor EMA.');
    if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
    return result;
  }

  function errorState(message) {
    container.innerHTML = `<div class="invite-state error"><svg class="icon" width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3L2 21h20z M12 9v5 M12 17v1"/></svg><h1>No podemos usar este enlace</h1><p>${esc(message)}</p><p>${reset ? 'Solicita otro enlace de recuperación desde el inicio de sesión.' : 'Pide al administrador que reenvíe tu invitación.'}</p><a href="./" class="btn primary">Ir al inicio de sesión</a></div>`;
  }

  async function start() {
    if (location.hostname.endsWith('.github.io')) return errorState('Esta página es la interfaz publicada en GitHub Pages. Abre el enlace enviado por el servidor EMA para continuar.');
    if (!/^[a-f0-9]{64}$/i.test(token)) return errorState('El enlace está incompleto o no es válido.');
    let invitation = null;
    try { if (!reset) invitation = (await api(`/invite?token=${encodeURIComponent(token)}`)).invitation; }
    catch (error) { return errorState(error.message); }
    const roles = { user: 'Usuario', moderator: 'Moderador' };
    container.innerHTML = `<span class="eyebrow">${reset ? 'RECUPERA TU ACCESO' : 'TU EQUIPO TE ESTÁ ESPERANDO'}</span><h1>${reset ? 'Nueva contraseña' : 'Bienvenido a EMA'}</h1><p>${reset ? 'Crea una nueva contraseña para entrar a tu espacio.' : 'Completa tu cuenta para empezar a trabajar con tu equipo.'}</p>${invitation ? `<div class="notice"><strong>${esc(invitation.email)}</strong><br>Acceso como ${esc(roles[invitation.role] || invitation.role)}.</div>` : ''}<form id="invite-form" class="form">${!reset ? `<label>Nombre<input name="name" autocomplete="name" required maxlength="120" value="${esc(invitation?.name || '')}"></label>` : ''}<label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" aria-describedby="password-help"></label><small id="password-help" class="field-help">Al menos 12 caracteres. Usa una contraseña que no uses en otro sitio.</small><label>Confirma tu contraseña<input name="confirmation" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label><div class="form-error" role="alert"></div><button type="submit" class="btn primary full">${reset ? 'Guardar nueva contraseña' : 'Activar cuenta'}</button></form><a href="./" class="text-link">Volver al inicio de sesión</a>`;
    container.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const button = form.querySelector('button'); const error = form.querySelector('.form-error'); error.textContent = '';
      if (data.password !== data.confirmation) { error.textContent = 'Las contraseñas no coinciden.'; return; }
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      try {
        await api(reset ? '/password/reset' : '/invite/accept', { token, password: data.password, ...(!reset ? { name: data.name } : {}) });
        container.innerHTML = '<div class="invite-state"><svg class="icon" width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><h1>Todo listo</h1><p>Tu acceso está activo. Abriendo tu espacio…</p><a href="./" class="btn primary">Entrar a EMA</a></div>';
        location.replace('./');
      } catch (problem) { error.textContent = problem.message; button.disabled = false; button.removeAttribute('aria-busy'); }
    });
  }
  start();
})();
