# Lucy3000

Aplicación de escritorio para gestión de estética construida con Electron, React, Express, Prisma y SQLite.

Canal oficial de producto actual:

- instalación local mediante `.exe`;
- backend embebido dentro de la app de escritorio;
- persistencia local SQLite por instalación.

Quedan fuera del canal oficial de release:

- backend remoto como topología recomendada;
- Supabase como dependencia activa del runtime.

Las referencias a Supabase o despliegues remotos se conservan solo como histórico, soporte o recuperación puntual.

## Estado actual

Baseline verificado en esta pasada:

- `npm run test` pasa.
- `npm run build` pasa y genera instalador.
- `npm audit --omit=dev` queda en `0 vulnerabilities`.
- El producto ya no distribuye credenciales conocidas ni un admin precargado.
- El primer administrador se crea mediante bootstrap desde la pantalla de login.
- Las importaciones soportadas oficialmente son solo `.xlsx`.

La fuente de verdad del estado funcional y la deuda activa es [ROADMAP.md](ROADMAP.md).

## Qué hace la aplicación

- Dashboard con métricas operativas.
- Gestión de clientes con historial, saldo a cuenta, ranking, fotos, consentimientos y documentos.
- Agenda de citas con calendario y soporte de clienta invitada.
- Servicios, productos e inventario.
- Ventas, tickets y caja.
- Bonos, packs, sesiones y abonos.
- Presupuestos.
- Notificaciones y reportes.
- Backups locales desde la propia app.
- Integración opcional con Google Calendar.

## Arquitectura resumida

- `src/main/main.ts`: proceso principal de Electron, arranque del backend empaquetado, backups, impresión y assets locales.
- `src/preload.ts`: bridge seguro con `contextBridge`.
- `src/renderer/*`: SPA React con Zustand, Axios y lazy loading en rutas pesadas.
- `src/backend/*`: API Express con validación Zod, controladores y Prisma.
- `prisma/schema.prisma`: modelo de datos principal.
- `prisma/migrations/*`: migraciones versionadas.

La app de escritorio empaqueta frontend y backend. En producción local, Electron arranca el backend internamente y la UI React consume esa API local.

## Bootstrap del primer administrador

La distribución ya no incluye usuario demo ni seed de credenciales.

Si la base de datos está vacía:

- `GET /api/auth/bootstrap-status` devuelve `{ "required": true }`;
- la pantalla de login muestra el formulario de creación del primer admin;
- `POST /api/auth/bootstrap-admin` crea ese usuario `ADMIN` y devuelve el payload de autenticación.

Cuando ya existe al menos un usuario:

- `bootstrap-admin` devuelve `409`;
- `POST /api/auth/register` sigue siendo un alta administrada y requiere un `ADMIN` autenticado.

## Arranque local en desarrollo

### Requisitos

- Node.js 18 o superior.
- npm.
- Windows es el entorno de referencia para scripts operativos y build del instalador.

### Configuración mínima

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` a partir de `.env.example`.

3. Ajusta como mínimo:

```env
DATABASE_URL="file:./prisma/lucy3000.db"
JWT_SECRET="cambia-este-valor"
PORT=3001
NODE_ENV=development
```

4. Si necesitas overrides locales no productivos, usa `.env.development`. El backend carga primero `.env` y después `.env.development`.

5. Genera Prisma y aplica migraciones:

```bash
npm run prisma:generate
npm run prisma:migrate
```

6. Arranca la app:

```bash
npm run dev
```

7. Si no hay usuarios, crea el primer admin desde la pantalla de login.

## Scripts principales

```bash
npm run dev
npm run dev:backend
npm run dev:electron
npm run build
npm run build:backend
npm run test
npm run test:unit
npm run test:smoke
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run backup:analyze
npm run backup:restore
npm run db:rebuild
```

## Variables de entorno

Variables críticas:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `NODE_ENV`

Variables opcionales según integración:

- `VITE_API_URL` para desarrollo específico;
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `WHATSAPP_*`
- `SUPABASE_*` solo para histórico o reconstrucción puntual

## Importaciones Excel

Los importadores oficiales de:

- clientes;
- servicios;
- productos;
- catálogo de bonos;

aceptan únicamente archivos `.xlsx`. La validación se hace tanto en frontend como en backend, con control de extensión, MIME y tamaño.

## Build y distribución local

```bash
npm run build
```

Esto:

- prepara la base empaquetada sin crear un admin por defecto;
- compila renderer y backend;
- genera el instalador en `release/`.

En producción de escritorio, Electron:

- copia una base SQLite inicial a la carpeta de usuario si todavía no existe;
- genera un `JWT_SECRET` local si no existe;
- arranca el backend empaquetado;
- abre la SPA local en la ventana de la app.

La guía de distribución local está en [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentación operativa

- [ROADMAP.md](ROADMAP.md): estado real, deuda y prioridades.
- [ARCHITECTURE.md](ARCHITECTURE.md): topología y módulos.
- [DEPLOYMENT.md](DEPLOYMENT.md): build, empaquetado y distribución local del `.exe`.
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md): backups locales y restauración histórica.
- [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md): integración opcional con Google Calendar.

## Contribución

Si vas a tocar código o docs:

- mantén alineados contrato API, validadores, frontend y tests;
- usa `npm run test` y `npm run build` como puerta mínima antes de cerrar cambios;
- no documentes como hecho nada que no haya sido verificado en código o ejecución real.

## Licencia

MIT.
