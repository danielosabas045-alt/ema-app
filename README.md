# EMA Database

Aplicación nueva desde cero para invitar usuarios por correo y administrar una base de datos compartida.

Administrador inicial: **danielosabas045@gmail.com**

## Flujo

Administrador → Agregar usuario → correo real → Aceptar Invitación → crear contraseña → entrar → agregar registros.

## Gmail

El servidor usa Gmail SMTP con una contraseña de aplicación. Configurá:
GMAIL_USER=danielosabas045@gmail.com
GMAIL_APP_PASSWORD=...

Nunca pongas la contraseña de aplicación en el frontend ni la subas a GitHub.

## Producción

Render puede desplegar el Node.js y PostgreSQL usando render.yaml. La misma aplicación sirve el frontend y la API, por lo que la URL pública es única.

GitHub Pages puede mostrar el frontend, pero no ejecuta el backend ni manda correos.