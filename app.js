'use strict';
/* EMA — interfaz conectada a la API. Sin datos simulados ni claves en el cliente. */
const root = document.getElementById('root');
const TOKEN_KEY = 'ema_session_v2';
const state = { user: null, page: 'dashboard', stats: null, users: [], invitations: [], records: [], query: '', offset: 0, more: false, health: null, busy: false };
let token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem('ema_token') || '';
localStorage.removeItem('ema_token');
if (token) sessionStorage.setItem(TOKEN_KEY, token);

function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = String(v ?? '');
    else if (k === 'onclick') n.addEventListener('click', v);
    else if (k === 'onsubmit') n.addEventListener('submit', v);
    else if (k === 'oninput') n.addEventListener('input', v);
    else if (k === 'onchange') n.addEventListener('change', v);
    else if (k === 'disabled') n.disabled = !!v;
    else n.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    n.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return n;
}
const div = (className, ...children) => el('div', {class: className}, ...children);
const heading = (text, tag = 'h2') => el(tag, {text});
const button = (text, onClick, cls = 'btn') => el('button', {type:'button', class:cls, onclick:onClick, text});
const para = (text) => el('p', {text});
function notice(text, type = '') { return div('notice ' + type, text); }
function setLoading(text) { root.replaceChildren(div('auth-wrap', div('auth-card', heading('EMA Database', 'h1'), para(text)))); }
function message(text, isError = false) {
  const old = document.getElementById('ema-toast');
  if (old) old.remove();
  const toast = el('div', {id:'ema-toast', class:'toast' + (isError ? ' error' : ''), role:'status'}, text);
  document.body.append(toast);
  toast.addEventListener('click', () => toast.remove());
}
async function api(url, options = {}) {
  const headers = {'Accept':'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(token ? {'Authorization':'Bearer ' + token} : {})};
  let response;
  try {
    response = await fetch(url, { ...options, headers:{...headers, ...options.headers}, cache:'no-store' });
  } catch {
    throw Error('No se puede conectar al servidor de EMA. GitHub Pages no ejecuta la API; usá la URL del servicio Node.js.');
  }
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/login') {
      token = '';
      sessionStorage.removeItem(TOKEN_KEY);
      state.user = null;
    }
    throw Error(payload.error || (response.status === 404 ? 'No se encontró la API. Abrí la URL del servidor de EMA.' : 'Error del servidor (' + response.status + ').'));
  }
  return payload;
}
function inputField(label, type = 'text', value = '', required = false, maxLength = 200) {
  const i = el(type === 'select' ? 'select' : 'input', type === 'select' ? {} : {type, value, maxlength:String(maxLength), required: required ? '' : null});
  if (type !== 'select') { i.value = value; i.required = required; }
  return {wrap: el('label', {}, label, i), input:i};
}
function selectField(label, values, selected) {
  const f = inputField(label,'select');
  for (const [v,t] of values) {
    const option = el('option', {value:v}, t);
    option.selected = v === selected;
    f.input.append(option);
  }
  return f;
}
function modal(title, fields, onSubmit, submitLabel = 'Guardar') {
  document.getElementById('ema-modal')?.remove();
  const msg = div('msg');
  const form = el('form', {class:'form'});
  for (const f of fields) form.append(f.wrap);
  const close = () => overlay.remove();
  form.append(msg, div('modal-actions', button('Cancelar', close, 'btn'), el('button',{class:'primary',type:'submit'},submitLabel)));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    msg.textContent = 'Procesando...';
    try { await onSubmit(); close(); }
    catch (error) { msg.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  const overlay = div('modal',div('modalbox',heading(title),form));
  overlay.id = 'ema-modal';
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.body.append(overlay);
  form.querySelector('input,select')?.focus();
}
function badge(value) { return el('span',{class:'badge ' + (value === 'active' ? 'active' : 'pending')}, ({active:'Activo', pending:'Pendiente',disabled:'Deshabilitado',user:'Usuario',moderator:'Moderador',admin:'Administrador',sent:'Enviada',failed:'Error'}[value] || value)); }
function table(headers, rows) {
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const cell of row) {
      const td = el('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell == null ? '' : String(cell);
      tr.append(td);
    }
    body.append(tr);
  }
  return el('div',{class:'table-scroll'},el('table',{class:'table'},el('thead',{},el('tr',{},headers.map(x=>el('th',{},x)))),body));
}
const dateText = v => v ? new Date(v).toLocaleString('es-GT') : '—';
function logout() { token = ''; sessionStorage.removeItem(TOKEN_KEY); state.user = null; renderLogin(); }
function renderLogin() {
  const email = inputField('Correo electrónico','email','',true,254);
  const pass = inputField('Contraseña','password','',true,150);
  const msg = div('msg');
  const submit = el('button',{type:'submit',class:'primary'},'Iniciar sesión');
  const form = el('form',{class:'form'},email.wrap,pass.wrap,submit,msg);
  form.addEventListener('submit', async ev => {
    ev.preventDefault(); submit.disabled = true; msg.textContent = 'Verificando credenciales...';
    try {
      const d = await api('/api/login',{method:'POST',body:JSON.stringify({email:email.input.value.trim(),password:pass.input.value})});
      token = d.token; sessionStorage.setItem(TOKEN_KEY,token); state.user = d.user;
      state.page = 'dashboard'; await navigate('dashboard');
    } catch (error) { msg.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  root.replaceChildren(div('auth-wrap',div('auth-card',div('brand-big','E'),div('eyebrow','EMA DATABASE · ACCESO SEGURO'),heading('Bienvenido a EMA','h1'),para('Ingresá con tu cuenta para trabajar con la base de datos real.'),form)));
}
function shell(title, subtitle, body) {
  const admin = state.user.role === 'admin';
  const navItems = [['dashboard','Panel principal'], ...(admin ? [['users','Usuarios'],['invites','Invitaciones']] : []),['records','Base de datos'],['settings','Configuración']];
  const nav = div('nav',...navItems.map(([id,label])=>button(label,()=>navigate(id),state.page === id ? 'active' : '')));
  const side = el('aside',{class:'sidebar'},div('brand',div('mark','E'),div(el('b',{},'EMA DATABASE'),el('small',{},'Sistema de gestión'))),nav,div('adminbox',el('b',{},state.user.name),el('small',{},state.user.email),el('small',{},'Rol: '+state.user.role)),button('Cerrar sesión',logout,'btn logout'));
  const top = el('header',{class:'top'},div('',heading(title,'h1'),para(subtitle)),div('account',div(el('b',{},state.user.name),el('small',{},state.user.email)),div('avatar',state.user.name.slice(0,2).toUpperCase())));
  root.replaceChildren(div('app',side,el('main',{class:'main'},top,el('section',{class:'content'},body))));
}
async function navigate(page, reset = true) {
  state.page = page;
  if (reset && page === 'records') { state.offset = 0; state.records = []; state.query = ''; }
  setLoading('Cargando información real...');
  try {
    if (page === 'dashboard') {
      state.stats = await api('/api/dashboard');
      try { state.health = await api('/api/health'); } catch { state.health = null; }
    }
    if (page === 'users') state.users = (await api('/api/users')).users;
    if (page === 'invites') state.invitations = (await api('/api/invitations')).invitations;
    if (page === 'records') await loadRecords();
    if (page === 'settings') state.health = await api('/api/health');
    renderPage();
  } catch (error) {
    if (!state.user) return renderLogin();
    shell('Sin conexión','EMA requiere la API y PostgreSQL',div('card',notice(error.message,'error'),button('Reintentar',()=>navigate(page),'primary'),button('Cerrar sesión',logout)));
  }
}
function renderPage() {
  if (state.page === 'dashboard') return renderDashboard();
  if (state.page === 'users') return renderUsers();
  if (state.page === 'invites') return renderInvites();
  if (state.page === 'records') return renderRecords();
  renderSettings();
}
function metric(label, value, detail) { return div('card kpi',el('small',{},label),el('strong',{},String(value)),el('span',{},detail)); }
function renderDashboard() {
  const s = state.stats || {};
  const metrics = div('grid',
    metric('Registros',s.records ?? 0,'Datos reales'),
    metric('Usuarios',s.users ?? '—','Cuentas registradas'),
    metric('Invitaciones',s.invitations ?? '—','Envíos registrados'),
    metric('Servidor','ONLINE','API conectada')
  );
  const actions = div('card',
    heading('Acciones rápidas'),para('Trabajo diario'),
    div('actions',button('Nuevo registro',()=>openRecord(),'primary'),
      ...(state.user.role === 'admin' ? [button('Invitar usuario',openInvite)] : []))
  );
  const services = div('card',
    heading('Estado del sistema'),para('Base de datos: conectada'),
    para('Correo saliente: '+(state.health?.emailConfigured ? (state.health.mailProvider === 'resend_https' ? 'Resend HTTPS' : 'Gmail SMTP') : 'pendiente de configurar')),
    notice('Los cambios se guardan en el servidor y son visibles según los permisos de cada cuenta.')
  );
  shell('Panel principal','Información sincronizada desde PostgreSQL',div('',metrics,div('two section',actions,services)));
}
function openInvite() {
  const name = inputField('Nombre','text','',true,120), email = inputField('Correo Gmail o de otro proveedor','email','',true,254);
  const role = selectField('Permisos',[['user','Usuario'],['moderator','Moderador']],'user');
  modal('Invitar usuario',[name,email,role],async () => {
    const result = await api('/api/users/invite',{method:'POST',body:JSON.stringify({name:name.input.value,email:email.input.value,role:role.input.value})});
    message(result.message || 'El servidor de correo aceptó la invitación.');
    await navigate(state.page);
  },'Enviar invitación real');
}
async function resend(id) {
  if (!confirm('¿Enviar una nueva invitación a esta persona?')) return;
  try { const d=await api('/api/users/'+encodeURIComponent(id)+'/resend',{method:'POST'}); message(d.message || 'Invitación procesada.'); await navigate(state.page); }
  catch(error){ message(error.message,true); }
}
async function changeStatus(u) {
  const status = u.status === 'active' ? 'disabled' : 'active';
  if (!confirm((status === 'disabled' ? '¿Deshabilitar' : '¿Habilitar')+' a '+u.email+'?')) return;
  try { await api('/api/users/'+encodeURIComponent(u.id)+'/status',{method:'PATCH',body:JSON.stringify({status})}); message('Estado actualizado.'); await navigate(state.page); }
  catch(error){ message(error.message,true); }
}
function renderUsers() {
  const rows = state.users.map(u => [u.name,u.email,badge(u.role),badge(u.status),dateText(u.created_at),div('actions',...(u.status === 'pending' ? [button('Reenviar',()=>resend(u.id))] : []),...(u.status !== 'pending' ? [button(u.status === 'active'?'Desactivar':'Activar',()=>changeStatus(u))] : []))]);
  shell('Usuarios','Gestión de cuentas y acceso',div('',div('head',div(heading('Personal'),para('Las cuentas nuevas deben aceptar su invitación.')),button('+ Agregar usuario',openInvite,'primary')),div('card section',rows.length?table(['Nombre','Correo','Rol','Estado','Creación','Acciones'],rows):div('empty',heading('Todavía no hay usuarios'),para('Invitá al primero para comenzar.')))));
}
function renderInvites() {
  const rows = state.invitations.map(x => [x.email,badge(x.role),dateText(x.sent_at),x.accepted_at ? badge('active') : x.last_error ? badge('failed') : badge('pending'),dateText(x.accepted_at),x.last_error ? 'Error de envío' : '—']);
  shell('Invitaciones','Historial real de correos',div('',div('head',heading('Invitaciones'),button('+ Nueva invitación',openInvite,'primary')),div('card section',rows.length?table(['Destino','Rol','Creación','Estado','Aceptada','Entrega'],rows):div('empty',heading('Sin invitaciones todavía'))),notice('El servidor confirma la aceptación por SMTP, no garantiza que Gmail lo coloque en la bandeja de entrada.')));
}
async function loadRecords() {
  const params = new URLSearchParams({limit:'100',offset:String(state.offset)});
  if (state.query) params.set('search',state.query);
  const rows = (await api('/api/records?'+params)).records;
  state.records = state.offset ? state.records.concat(rows) : rows;
  state.more = rows.length === 100;
}
async function fetchMore() {
  state.offset += 100;
  try { await loadRecords(); renderRecords(); } catch(error) { state.offset -= 100; message(error.message,true); }
}
function openRecord(rec = null) {
  const title = inputField('Título','text',rec?.title || '',true,160);
  const description = inputField('Descripción','text',rec?.description || '',false,4000);
  modal(rec ? 'Editar registro' : 'Nuevo registro',[title,description],async()=>{
    await api(rec?'/api/records/'+encodeURIComponent(rec.id):'/api/records',{method:rec?'PUT':'POST',body:JSON.stringify({title:title.input.value,description:description.input.value})});
    message('Registro guardado en PostgreSQL.');
    await navigate('records');
  },rec?'Guardar cambios':'Crear registro');
}
async function deleteRecord(rec) {
  if (!confirm('¿Eliminar permanentemente el registro "'+rec.title+'"?')) return;
  try { await api('/api/records/'+encodeURIComponent(rec.id),{method:'DELETE'});message('Registro eliminado.'); await navigate('records'); }
  catch(error){message(error.message,true);}
}
function exportVisibleCSV() {
  const csv = [['ID','Título','Descripción','Propietario','Creado'],...state.records.map(r=>[r.id,r.title,r.description,r.owner_email,r.created_at])].map(row=>row.map(c=>{
    let s=String(c??'');
    if (/^[\s]*[=+\-@]/.test(s)) s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
  const a=el('a',{href:url,download:'ema-registros-visibles.csv'});document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderRecords() {
  const search = el('input',{type:'search',placeholder:'Buscar por título o descripción',value:state.query,'aria-label':'Buscar registros'});
  search.value=state.query;
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}});
  async function runSearch(){state.query=search.value.trim();state.offset=0;try{await loadRecords();renderRecords();}catch(e){message(e.message,true);}}
  const rows = state.records.map(r=>[r.id,r.title,r.description,r.owner_email,dateText(r.created_at),div('actions',button('Editar',()=>openRecord(r)),button('Eliminar',()=>deleteRecord(r),'btn danger'))]);
  shell('Base de datos','Registros reales con permisos por usuario',div('',div('head',heading('Registros'),div('actions',button('Exportar visibles CSV',exportVisibleCSV),button('+ Agregar registro',()=>openRecord(),'primary'))),div('card section',div('actions searchbar',search,button('Buscar',runSearch)),rows.length?table(['ID','Título','Descripción','Usuario','Fecha','Acciones'],rows):div('empty',heading('Sin registros'),para('Creá uno nuevo o cambiá la búsqueda.')),state.more ? button('Cargar 100 más',fetchMore,'btn load-more') : null),notice('La exportación CSV incluye los registros cargados en pantalla.')));
}
function renderSettings() {
  const account = div('card',
    heading('Mi cuenta'),para('Nombre: '+state.user.name),para('Correo: '+state.user.email),
    para('Rol: '+state.user.role),button('Cerrar sesión',logout,'btn danger')
  );
  const services = div('card',
    heading('Servicios'),para('API: '+location.origin),para('PostgreSQL: conectado'),
    para('Correo saliente: '+(state.health?.emailConfigured ? (state.health.mailProvider === 'resend_https' ? 'Resend HTTPS' : 'Gmail SMTP') : 'sin configurar')),
    notice('Las contraseñas de Gmail, SQL y JWT se configuran únicamente en el servidor. Nunca en GitHub Pages.')
  );
  shell('Configuración','Estado y cuenta actual',div('two',account,services));
}
(async function start() {
  if (!token) return renderLogin();
  setLoading('Validando sesión...');
  try { state.user = (await api('/api/me')).user; await navigate('dashboard'); }
  catch { logout(); }
})();
