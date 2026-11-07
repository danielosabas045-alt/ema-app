'use strict';
const token = new URLSearchParams(location.search).get('token') || '';
const form = document.getElementById('f');
const msg = document.getElementById('msg');
if (!/^[a-f0-9]{64}$/.test(token)) {
  msg.textContent = 'Este enlace de invitación no es válido.';
  form.querySelector('button').disabled = true;
}
form.addEventListener('submit', async e => {
  e.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  msg.textContent = 'Activando cuenta...';
  try {
    const response = await fetch('/api/invite/accept', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,name:document.getElementById('name').value,password:document.getElementById('password').value})
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo activar.');
    sessionStorage.setItem('ema_session_v2',data.token);
    history.replaceState(null,'','/invite.html');
    msg.textContent = 'Cuenta activada. Entrando...';
    msg.style.color = '#35d39b';
    location.replace('/');
  } catch (error) {
    msg.textContent = error.message;
    msg.style.color = '#ff667c';
    button.disabled = false;
  }
});
