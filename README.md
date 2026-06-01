# Lucy3000

Lucy3000 es una app de gestion de estetica orientada a SaaS multi-equipo: una API central, una base PostgreSQL compartida y clientes web/PWA, con Electron como wrapper opcional para escritorio.

## Estado actual

- Topologia oficial: React/Vite + Express + Prisma + PostgreSQL multi-tenant.
- Electron se mantiene como canal opcional de escritorio, no como propietario de los datos.
- Cada centro vive en un `Tenant`; los datos de negocio se aislan por `tenantId`.
- El alta inicial crea el primer centro, su licencia `PENDING` y el primer `ADMIN` de tenant.
- Supabase encaja como proveedor inicial de Postgres/Storage/infra, pero el backend sigue siendo el duenio de la logica y de los permisos.
- Decision vigente: una base Supabase/PostgreSQL compartida, no un proyecto Supabase por cliente.
- El cliente final no debe recibir la `DATABASE_URL` compartida. Web/PWA o Electron deben hablar con la API central.
- El login usa `ID cliente` visible como alias publico del tenant (`tenantCode`). Internamente se mantiene `tenantId`.
- La antigua ruta SQLite queda como legado de importacion, restore o soporte puntual.

## Estado de la refactorizacion

- `src/main/main.ts` es composition root; el runtime de Electron esta separado en modulos e IPC por dominio.
- `src/backend/controllers/*` actua como capa HTTP fina y la logica de negocio vive en `src/backend/modules/*`.
- `src/backend/db.ts` crea Prisma, aplica el contexto tenant-aware y solo ejecuta compatibilidad SQLite cuando `DATABASE_URL` es `file:`.
- `src/backend/tenant/*` centraliza contexto multi-tenant y evaluacion de licencia.
- `src/renderer/pages/*` se conserva como entrypoint de routing; la logica de pantallas grandes vive en `src/renderer/features/*`.
- `src/shared/electron.ts` centraliza contratos IPC compartidos entre `main`, `preload` y renderer.

## Que hace hoy la app

- Dashboard operativo.
- Gestion de clientes con historial, saldo, ranking y assets.
- Agenda de citas con clienta invitada, leyendas, multiples servicios, bloqueos y notas diarias.
- Servicios y productos con categorias e importacion `.xlsx`.
- Ventas, cobros pendientes, caja y arqueos.
- Bonos, packs, sesiones y saldo a cuenta.
- Usuarios, cuentas internas, roles y tenant asociado.
- Licencia por centro con prueba de 7 dias, bloqueo y estados de suscripcion.
- Reportes y presupuestos.
- Integracion opcional con Google Calendar aislada por tenant.
- Asistente admin para analizar e importar un `01dat.sql` o `01dat.sqlx` legacy, siempre que el contenido sea SQL plano.

## Autenticacion, tenants y licencias

- Login normal: `POST /api/auth/login`
- Bootstrap inicial:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Licencia del centro actual:
  - `GET /api/tenants/current/license`
- Endpoints internos de centros/licencias, sin pantalla `Centros` en la app del cliente:
  - `GET /api/tenants`
  - `POST /api/tenants`
  - `PUT /api/tenants/:id/license`
- Consola local de Sergio para control comercial y supervision:
  - `npm run admin:dashboard`
  - `tools/lucy-admin-dashboard/`

Roles observados en codigo:
- `ADMIN`
- `MANAGER`
- `EMPLOYEE`

Páginas admin-only en renderer:
- `Reports`
- `Accounts`
- `Sql`

La licencia se valida en servidor en login y en operaciones autenticadas. Cuando un trial expira o una licencia queda bloqueada, el backend limita el acceso operativo y conserva rutas necesarias para login, estado de licencia, soporte y administracion.

### ID cliente y tenant

El codigo actual tiene `Tenant.id` como UUID interno, `Tenant.slug` como
selector compatible y `Tenant.tenantCode` como codigo humano mostrado en UI como
`ID cliente`:

- Lucy Lara podria ser `ID cliente = 1`; nuevos centros, `2`, `3`, etc.
- Ese ID solo sirve para elegir el centro en login junto a usuario y contrasena.
- La seguridad real no depende de ocultar ese numero, sino de la API central,
  el JWT con `tenantId`, el middleware tenant-aware, validaciones por tenant y
  una capa pendiente de RLS/policies en Supabase.
- Si Electron guarda una `DATABASE_URL` compartida en `userData\.env`, el cliente
  podria saltarse la API. Ese modo no es apto para multi-tenant compartido.

## Desarrollo local

### Requisitos

- Node.js 18 o superior.
- npm.
- Una base PostgreSQL accesible, local o gestionada.
- Windows sigue siendo el entorno de referencia para scripts operativos y build del instalador.

### Arranque

1. Crea `.env` a partir de `.env.example`.

2. Ajusta como minimo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lucy3000"
JWT_SECRET="cambia-este-valor"
PORT=3001
NODE_ENV=development
```

3. Instala dependencias:

```bash
npm install
```

4. Genera Prisma y aplica migraciones:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Arranca la app:

```bash
npm run dev
```

6. Si no existe ningun usuario, crea el primer centro y el primer `ADMIN` desde login.

## Scripts npm

```bash
npm run dev
npm run dev:backend
npm run dev:electron
npm run build
npm run build:backend
npm run build:prepare-db
npm run test
npm run test:unit
npm run test:smoke
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Scripts operativos fuera de npm

Se ejecutan directamente desde `scripts/`:
- `scripts/analyze-backup.ps1`
- `scripts/restore-backup.ps1`
- `scripts/rebuild-supabase-db.ps1`
- `scripts/pull-schema-no-docker.ps1`
- `scripts/dev-backend.ps1`
- `scripts/kill-dev-ports.ps1`
- `scripts/prepare-packaged-db.js`

`build:prepare-db` ya no prepara una SQLite empaquetada salvo que se fuerce con `LUCY3000_PREPARE_SQLITE=1`.

## Variables de entorno

### Criticas

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `NODE_ENV`

### Opcionales

- `VITE_API_URL`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `WHATSAPP_*`
- `SUPABASE_*` para infra, soporte historico o recuperacion

## Arquitectura resumida

- `src/main/main.ts`: composition root del proceso principal de Electron.
- `src/main/*Runtime.ts` y `src/main/ipc/*`: runtimes tecnicos e IPC por dominio.
- `src/preload.ts`: bridge seguro con `contextBridge`.
- `src/shared/electron.ts`: contratos IPC compartidos.
- `src/renderer/pages/*`: entrypoints de routing.
- `src/renderer/features/*`: feature containers, hooks, adapters y componentes presentacionales.
- `src/backend/controllers/*`: adaptadores HTTP finos.
- `src/backend/modules/*`: logica de negocio por dominio.
- `src/backend/tenant/*`: contexto de tenant y licencias.
- `src/backend/db.ts` y `src/backend/db/compat/*`: bootstrap Prisma, scoping multi-tenant y compatibilidad SQLite legacy.
- `prisma/schema.prisma`: modelo persistente real.
- `prisma/migrations/*`: migraciones PostgreSQL versionadas.
- `prisma/migrations_sqlite_legacy/*`: historico SQLite conservado para referencia.

## Importaciones, backups y restauracion

- La base productiva SaaS es PostgreSQL; backups de produccion deben hacerse en el proveedor de base de datos o con snapshots/dumps controlados.
- Los assets de clienta deben ir a Storage/S3 equivalente, no dentro de la base.
- El asistente SQL admin sigue siendo un flujo legacy parcial para `01dat.sql` o `01dat.sqlx`.
- Los backups locales de Electron quedan como soporte de escritorio/legacy, no como backup operativo del SaaS.

El asistente SQL no cubre ventas, caja ni referencias legacy de fotos.

## Build y distribucion

```bash
npm run build
```

Ese pipeline:
1. omite la preparacion de SQLite empaquetada por defecto;
2. compila renderer y backend;
3. genera el instalador en `release/`.

En produccion, la proteccion real esta en el servidor:
- no incluir secretos en el cliente;
- no incluir `DATABASE_URL` compartida en Electron/ASAR/instalador;
- validar tenant, usuario, rol y licencia en la API;
- firmar el instalador cuando se distribuya a clientes;
- usar Electron/NSIS/MSIX solo como experiencia de instalacion, no como barrera de secreto.

## Documentacion relacionada

- [ROADMAP.md](ROADMAP.md): prioridades y deuda activa.
- [ARCHITECTURE.md](ARCHITECTURE.md): topologia y modulos.
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md): backups SaaS, restore y flujos legacy.
- [DEPLOYMENT.md](DEPLOYMENT.md): despliegue central y wrapper de escritorio.
- [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md): integracion opcional con Google Calendar.
- [AGENTS.md](AGENTS.md): instrucciones operativas para agentes y mantenimiento tecnico.

## Regla practica

Si un markdown y el codigo discrepan, usa el codigo como referencia final y corrige la documentacion antes de cerrar el cambio.
