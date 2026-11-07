# EMA Database · V2

Aplicación de gestión multiusuario con frontend HTML/CSS/JS, API Express, PostgreSQL y envío real de invitaciones por Gmail SMTP.

**La URL de GitHub Pages no es un servidor.** Si abrís Pages, verás la pantalla de ingreso, pero el inicio de sesión, SQL y Gmail solo funcionan desde la URL HTTPS de un despliegue del servidor Node.js (por ejemplo Render). No se simulan usuarios ni correos en localStorage.

## Requisitos

- Node.js 20+ y PostgreSQL 15+ (o Docker).
- Variables privadas: DATABASE_URL, JWT_SECRET (32+ caracteres aleatorios), ADMIN_EMAIL, ADMIN_PASSWORD (12+ caracteres en el primer arranque), BASE_URL (HTTPS pública), ADMIN_NAME.
- Para correos: GMAIL_USER y GMAIL_APP_PASSWORD. Esta última es una **contraseña de aplicación** habilitada por el propietario de la cuenta (si su cuenta cumple los requisitos de Google); no es la contraseña normal de Gmail.
- Para producción, configurá las variables en el proveedor de alojamiento como **secrets**, nunca en el HTML ni en archivos subidos a GitHub.

## Inicio con Docker (local)

1. Copiá .env.example a .env y configurá credenciales seguras. Para Docker, agregá POSTGRES_PASSWORD, que es independiente de DATABASE_URL.
2. Ejecutá docker compose up --build
3. Abrí http://localhost:3000 (el servidor integra API y frontend).
4. Entrá con ADMIN_EMAIL y ADMIN_PASSWORD. La cuenta admin se crea **solo la primera vez** y no se sobrescribe al reiniciar.

El archivo docker-compose.yml configura PostgreSQL privado en la red de Docker. Para usar DATABASE_URL en localhost sin Docker, configurá una instancia PostgreSQL separada.

## Despliegue

- Usá render.yaml como punto de partida si tu proveedor admite el plan de base de datos indicado; verificá precios y disponibilidad antes de desplegar.
- BASE_URL debe coincidir exactamente con la URL HTTPS del **servidor** (sin barra final). De ahí se generan los enlaces de invitación.
- En Render, creá las variables JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, GMAIL_USER, GMAIL_APP_PASSWORD y las indicadas en render.yaml. DATABASE_URL se vincula al Postgres del proyecto.
- Después del despliegue comprobá GET /api/health: ok=true, database=connected, emailConfigured=true.
- Usá la URL del servidor en el navegador. No ingresés contraseñas en la copia alojada en GitHub Pages.
- Nunca publiques contraseñas SMTP, secretos JWT, bases de datos ni datos de usuarios reales en commits públicos.

## Funciones reales

- Inicio de sesión (JWT con vencimiento), validación de estado activo y protección por roles.
- Admin: invita por correo real, reenvía enlaces, ve historial y habilita/deshabilita cuentas.
- Invitaciones: token aleatorio de un solo uso con hash SHA-256 y validez de 48 horas; el invitado crea su contraseña (bcrypt).
- Base de datos: creación, consulta, actualización, eliminación, búsqueda y exportación CSV de registros cargados. Usuarios ven sus propios registros; moderadores y admins pueden gestionar todos.
- Auditoría de acciones básicas, validación de entradas, restricciones de acceso SQL, controles contra intentos repetidos, CSP HTTP y separación de archivos públicos.

**Sobre entrega de correos:** la respuesta del servidor confirma que SMTP aceptó un mensaje; eso no garantiza llegada a Recibidos (puede ir a Spam o ser rechazado posteriormente).

**Para producción empresarial** todavía se recomiendan pruebas E2E de correo real, respaldos y restauración, monitoreo, gestión de secretos, rotación de credenciales, HTTPS, servicio SMTP dedicado cuando corresponda, rate limiting distribuido si hay múltiples instancias, y pruebas de carga.

## API

GET /api/health · POST /api/login · GET /api/me · GET /api/dashboard · GET /api/users · POST /api/users/invite · POST /api/users/:id/resend · PATCH /api/users/:id/status · GET /api/invitations · GET/POST /api/records · PUT/DELETE /api/records/:id · POST /api/invite/accept

Las rutas privadas requieren Authorization: Bearer <token> y verifican permisos en el servidor.
