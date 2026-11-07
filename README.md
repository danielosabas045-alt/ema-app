# EMA Database

Espacio de trabajo multiusuario en español con PostgreSQL, sesiones seguras e invitaciones por correo. La interfaz y la API se ejecutan en el mismo servidor Node.js; los datos se comparten entre dispositivos.

[Desplegar en Render](https://render.com/deploy?repo=https://github.com/danielosabas045-alt/ema-app)

## Activar la aplicación pública

1. Conecta este repositorio en Render como Blueprint usando `render.yaml`. **El PostgreSQL `0.1c-256mb` con 1 GB de almacenamiento tiene coste**: revisa la tarifa antes de crear recursos. El servidor web usa el plan Free y puede tardar en despertar; puedes cambiarlo por un plan con funcionamiento continuo.
2. Render genera automáticamente `ADMIN_PASSWORD` y la conserva como variable privada. Consulta su valor en Environment para el primer inicio de sesión y luego cambia la contraseña desde EMA. Para activar el correo configura allí `RESEND_API_KEY` y `MAIL_FROM`. En Resend, `MAIL_FROM` debe pertenecer a un dominio verificado. No uses el remitente de prueba para enviar a destinatarios arbitrarios. `DATABASE_URL` se conecta automáticamente a PostgreSQL. La URL pública se toma de `RENDER_EXTERNAL_URL`; puedes definir `BASE_URL` si usas un dominio propio.
3. Abre la URL HTTPS de **ese servidor**. Entra con `danielosabas045@gmail.com` y la contraseña inicial generada por Render. El administrador se crea solo al primer inicio; reiniciar el servicio nunca reemplaza su contraseña. `/api/health` debe responder `ok: true`, `database: "connected"` y, una vez configurado el proveedor de correo, `emailConfigured: true`. Sin proveedor configurado SQL y el acceso funcionan, pero las invitaciones y la recuperación muestran que el correo está pendiente.
4. Invita a un correo de prueba que controles. Comprueba la recepción y activa la cuenta desde el enlace. Entra desde otro navegador y crea un registro para confirmar la persistencia compartida.

GitHub Pages sirve solo los archivos del navegador. Su pantalla permite abrir el servidor configurado; **no ejecuta SQL ni envía correos**. En `config.json`, `serverUrl` puede contener la URL HTTPS pública de tu servidor para ofrecer el acceso. Ese archivo nunca contiene contraseñas ni credenciales.

No es necesario conectar un complemento de Gmail para que la aplicación envíe correos: el envío se configura en el servidor. Una integración de Render en ChatGPT permite revisar/desplegar recursos desde el chat cuando esté conectada.

## Prueba gratuita en Render

Para probar el servidor sin un plan PostgreSQL de pago, usa `render-free.yaml` como ruta del Blueprint. Conserva las mismas funciones SQL y genera la contraseña inicial en Render, pero **la base caduca a los 30 días**. El servidor Free se suspende tras 15 minutos sin tráfico y el siguiente acceso puede tardar aproximadamente un minuto. Antes de guardar información permanente, cambia la base a un plan persistente y configura respaldos.

El correo requiere configurar `RESEND_API_KEY` y `MAIL_FROM` privadamente después de crear el servicio. Sin esas credenciales no se envían invitaciones. El plan gratuito no permite Gmail SMTP.

## Proveedor de correo

Elige una opción:

| Servicio | Variables privadas | Uso |
| --- | --- | --- |
| Resend por HTTPS | `RESEND_API_KEY`, `MAIL_FROM` | Recomendado en Render Free; remitente con dominio verificado |
| Gmail SMTP | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Requiere contraseña de aplicación de Google y salida SMTP permitida |

**Render Free bloquea los puertos SMTP**: una contraseña correcta de Gmail no elimina ese bloqueo. Usa Resend por HTTPS o un alojamiento compatible con SMTP. El destinatario puede ser Gmail con cualquiera de los dos proveedores, sujeto a los permisos y límites del proveedor.

La aplicación registra aceptación o rechazo por el proveedor y permite reenviar invitaciones pendientes. Una respuesta aceptada no garantiza entrega a Recibidos: el servidor del destinatario puede filtrar o rechazar el mensaje después. La prueba de recepción real se hace con las credenciales del despliegue; las pruebas automatizadas usan un proveedor simulado.

## Funciones

- Inicio y cierre de sesión con cookies HttpOnly, expiración y revocación en PostgreSQL.
- Invitaciones personales de 48 horas, tokens guardados como hash, activación de un solo uso y reenvío.
- Recuperación y cambio de contraseña, contraseñas con bcrypt y revocación de sesiones.
- Administración de usuarios, roles y suspensión sin reinvitar ni alterar cuentas activas accidentalmente.
- Registros con creación, búsqueda, paginación, edición, eliminación y exportación CSV.
- Admin y moderadores administran todos los registros; usuarios acceden a los propios. Solo admin administra usuarios e invitaciones.
- Formularios accesibles, estados de carga/error/vacío, confirmación de eliminación y diseño adaptable a móvil.
- Validación en servidor, SQL parametrizado, límites de peticiones, control de origen/CSRF y archivos públicos permitidos explícitamente.
- Migraciones idempotentes para las tablas anteriores; nunca se borran datos al arrancar.

La información de la versión antigua guardada en `ema_database_workspace_v3` permanece en el navegador y puede descargarse para recuperarla. Esos datos nunca se presentan como si ya estuvieran en PostgreSQL.

## Desarrollo local

Requiere Node.js 22+ y PostgreSQL 15+; CI y la imagen Docker usan Node.js 24.

```sh
cp .env.example .env
npm ci
```

Edita `.env` localmente: configura `DATABASE_URL`, `ADMIN_PASSWORD` y, para enviar correo, uno de los proveedores. Después:

```sh
npm start
```

Abre `http://localhost:3000`. Sin correo configurado puedes entrar y administrar registros; las invitaciones muestran un error de configuración, nunca un envío simulado.

### Docker Compose

En `.env` configura `POSTGRES_PASSWORD` y `ADMIN_PASSWORD`, ambas privadas y diferentes. Para correo añade las mismas variables del proveedor. Compose usa las variables `PGHOST`, `PGUSER`, `PGPASSWORD` y `PGDATABASE`, sin interpolar una contraseña en una URL.

```sh
docker compose up --build -d
```

La aplicación se publica solo en `127.0.0.1:3000` y PostgreSQL queda en la red privada de Compose, con un volumen persistente. Para exponerla en Internet configura un proxy HTTPS y ejecuta con `NODE_ENV=production` y `BASE_URL` HTTPS del servidor. No elimines el volumen si quieres conservar los datos.

### Variables de conexión

- `BASE_URL`: origen de la aplicación sin rutas, por ejemplo `https://ema.ejemplo.com`; obligatorio en producción salvo que Render aporte `RENDER_EXTERNAL_URL`.
- `DATABASE_URL`: conexión PostgreSQL; alternativamente variables nativas `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
- `DATABASE_SSL=require`: TLS con verificación del certificado para bases externas. `disable` solo para localhost o la red privada del alojamiento. Si tu proveedor usa su propia CA, configura esa CA; no desactives la verificación.
- `TRUST_PROXY=1`: solo cuando hay exactamente un proxy de confianza delante de la aplicación, como en Render. No usar confianza global indiscriminada.
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`: cuenta inicial. No se publica ninguna contraseña por defecto.

## Comprobar cambios

```sh
npm run check
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ema_test npm test
npm audit --omit=dev
# Primera vez: instalar Chromium de Playwright si no está disponible
npx playwright install chromium
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ema_test npm run test:browser
```

Las pruebas de integración crean y eliminan un esquema aislado dentro de la base de pruebas. Verifican sesiones, permisos entre usuarios, SQL/CRUD, invitaciones, fallos de correo, aceptación única, recuperación de contraseñas y reinicios. Si falta `TEST_DATABASE_URL`, las pruebas SQL se omiten; CI siempre aporta PostgreSQL. Usa una base exclusiva para pruebas.

GitHub Actions ejecuta las comprobaciones antes de revisar un cambio. El flujo de Pages comprueba la sintaxis de los scripts y respeta el modo de publicación existente. Si eliges GitHub Actions en Settings → Pages, publicará únicamente los archivos públicos; si mantienes la publicación desde una rama, GitHub seguirá publicando desde esa rama. El repositorio es público y nunca debe contener secretos.

## Respaldos

Mantén respaldos automáticos en el proveedor de PostgreSQL y comprueba periódicamente una restauración en una base separada. Para obtener un respaldo local de Compose:

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U ema -d ema_database -Fc > backups/ema.dump
```

Los respaldos contienen datos personales: guárdalos cifrados y fuera de GitHub. `.gitignore` excluye `.env`, volcados, respaldos y archivos de pruebas. No ejecutes comandos de borrado de volúmenes sobre datos que quieras conservar.

## API

Las peticiones que modifican datos usan JSON, la cookie de sesión y `X-EMA-Request: true`; el origen debe coincidir con el servidor. No se guardan tokens de sesión en JavaScript ni en localStorage.

- Sesión: `POST /api/login`, `POST /api/logout`, `GET /api/me`.
- Contraseña: `POST /api/password/change`, `POST /api/password/forgot`, `POST /api/password/reset`.
- Panel: `GET /api/dashboard`, `GET /api/health`.
- Usuarios: `GET /api/users`, `POST /api/users/invite`, `POST /api/users/:id/resend`, `PATCH /api/users/:id`.
- Invitaciones: `GET /api/invitations`, `GET /api/invite?token=…`, `POST /api/invite/accept`.
- Registros: `GET /api/records?search=&page=1&limit=20`, `POST /api/records`, `PATCH /api/records/:id`, `DELETE /api/records/:id`.

Antes de considerar el despliegue terminado, verifica acceso HTTPS, conexión SQL, invitación y recuperación con un correo real, permisos desde dos cuentas y restauración de un respaldo. No se afirma disponibilidad ni entrega de correo sin esas comprobaciones en el alojamiento real.
