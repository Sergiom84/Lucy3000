# AGENTS.md

## Contexto del proyecto

Lucy3000 es una app de gestion de estetica en transicion a SaaS web/PWA multi-equipo.
La topologia real actual es React/Vite + Express + Prisma + PostgreSQL multi-tenant, con Electron como wrapper opcional para escritorio.
Supabase es una opcion de infraestructura para Postgres/Storage, no una autorizacion directa desde el frontend.
SQLite queda como legado de migracion, importacion o soporte puntual.

## Modelo de distribucion vigente (2026-05-31)

Decision de Sergio: distribuir como **app Electron instalada por cliente**, cada
instalacion contra **su propio proyecto Supabase** (datos aislados entre negocios,
sin servidor central, sin cuota ni cold start). El control de trial vive en la
tabla `tenant_licenses` del Supabase del cliente y usa **hora de servidor**
(`getServerNow()` -> `SELECT NOW()`), no el reloj del PC.

Flujo de licencia: bootstrap en modo Supabase nace `PENDING`; el admin del tenant
arranca su prueba con `POST /api/tenants/current/start-trial` (boton "Empezar
prueba"); gracia `PENDING_GRACE_DAYS` (9 dias) antes del bloqueo definitivo
(`pending-expired`). Alta por cliente: crear Supabase -> `prisma migrate deploy`
-> instalar .exe modo Supabase -> bootstrap -> empezar prueba.

<!--
  CANAL CENTRAL WEB/PWA EN RENDER (DORMIDO, no usado por el modelo vigente).
  Se monto el 2026-05-31 por si en el futuro se vuelve a un SaaS central:
    - render.yaml (Blueprint) en la raiz define lucy3000-api + lucy3000-web.
    - Workspace Render "Lucy3000" tea-d8dlksh9rddc73a25e50 (cuenta sergio.hlara84).
    - Servicio API: srv-d8dlmoojs32c73fmfee0  -> https://lucy3000-2hnv.onrender.com
    - Servicio front estatico: srv-d8dlqkvavr4c73ft9kl0 -> https://lucy3000-web.onrender.com
    - El front PWA (public/manifest.webmanifest, public/sw.js, public/_redirects)
      y los scripts build:web / deploy:web siguen en el repo, inertes para Electron.
  Si se reactiva: poner DATABASE_URL/BOOTSTRAP_TOKEN en la API y VITE_API_URL en el front.
-->


## Fuentes de verdad

Cuando una instruccion o documento entre en conflicto, usa este orden:
1. `ROADMAP.md`
2. `README.md`
3. `BACKUP_RESTORE.md`
4. `ARCHITECTURE.md`
5. `package.json`, `prisma/schema.prisma`, `src/backend/app.ts`, `src/main/main.ts`, `src/backend/db.ts`, `src/shared/electron.ts`

Si algo documentado contradice al codigo, manda el codigo.

## Stack tecnico

- Runtime: Node.js 18+.
- Web/desktop: React 18, TypeScript, Vite, Tailwind, Zustand, Axios; Electron + `vite-plugin-electron` como wrapper.
- Backend: Express + TypeScript + Zod.
- Datos: Prisma ORM + PostgreSQL.
- Legacy: SQLite solo para compatibilidad, migracion o restore antiguo.
- Tests: Vitest + Supertest, con suites en backend, `tests/main` y `tests/renderer/unit`.

## Estructura importante

- `src/main/main.ts`: composition root del proceso principal de Electron.
- `src/main/backendRuntime.ts`: arranque, parada y healthcheck del backend empaquetado.
- `src/main/runtimeData.ts`: paths, apertura de carpeta de datos y reset local legacy.
- `src/main/backupRuntime.ts`: operaciones legacy de backup, restore y auto-backup.
- `src/main/clientAssetsRuntime.ts`: assets locales legacy y protocolo seguro.
- `src/main/printing.ts`: impresion PDF y tickets.
- `src/main/ipc/*`: registro de `ipcMain.handle(...)` por dominio.
- `src/preload.ts`: bridge seguro con `contextBridge`.
- `src/shared/electron.ts`: contratos IPC compartidos entre `main`, `preload` y renderer.
- `src/renderer/App.tsx`: routing principal; usa `HashRouter` en `file://` y `BrowserRouter` en dev.
- `src/renderer/pages/*`: entrypoints de routing y wrappers ligeros.
- `src/renderer/features/*`: logica de pantallas grandes, hooks, adapters y componentes puros.
- `src/renderer/utils/api.ts`: cliente HTTP oficial para la API.
- `src/backend/app.ts`: middlewares, rutas API y fallback SPA.
- `src/backend/server.ts`: arranque HTTP.
- `src/backend/routes/*`: endpoints y middleware.
- `src/backend/controllers/*`: adaptadores HTTP finos.
- `src/backend/modules/*`: logica de negocio por dominio.
- `src/backend/services/*`: Google Calendar, recordatorios, import SQL, sincronizacion de agenda.
- `src/backend/tenant/*`: contexto multi-tenant y evaluacion de licencias.
- `src/backend/validators/*`: contratos Zod.
- `src/backend/db.ts`: cliente Prisma, middleware tenant-aware y compatibilidad SQLite legacy condicional.
- `src/backend/db/compat/*`: guards de compatibilidad SQLite por dominio o version logica.
- `src/shared/*`: utilidades compartidas de tickets y matching.
- `prisma/schema.prisma`: modelo persistente real.
- `prisma/migrations/*`: migraciones PostgreSQL versionadas.
- `prisma/migrations_sqlite_legacy/*`: migraciones SQLite antiguas archivadas.

## Scripts oficiales de npm

- `npm run dev`
- `npm run dev:backend`
- `npm run dev:electron`
- `npm run build`
- `npm run build:backend`
- `npm run build:prepare-db`
- `npm run test`
- `npm run test:unit`
- `npm run test:smoke`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`

No hay scripts `npm run backup:*` ni `npm run db:rebuild` en `package.json`.

## Scripts operativos fuera de npm

Se ejecutan directamente desde PowerShell:
- `scripts/analyze-backup.ps1`
- `scripts/restore-backup.ps1`
- `scripts/rebuild-supabase-db.ps1`
- `scripts/pull-schema-no-docker.ps1`
- `scripts/dev-backend.ps1`
- `scripts/kill-dev-ports.ps1`
- `scripts/prepare-packaged-db.js`

## Flujo local recomendado

1. Crear `.env` a partir de `.env.example`
2. `npm install`
3. Revisar `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`
4. `npm run prisma:generate`
5. `npm run prisma:migrate`
6. `npm run dev`
7. Si no existe ningun usuario, crear el primer centro y el primer `ADMIN` desde login

`DATABASE_URL` debe ser PostgreSQL, por ejemplo `postgresql://postgres:postgres@localhost:5432/lucy3000`.

## Entorno y secretos

- El backend carga `.env` y, fuera de produccion, despues `.env.development`.
- En empaquetado, Electron puede leer `.env` junto al `.exe`, en `resources/` o en `userData`.
- Variables criticas:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `PORT`
  - `NODE_ENV`
- Variables opcionales vigentes:
  - `VITE_API_URL`
  - `GOOGLE_CALENDAR_CLIENT_ID`
  - `GOOGLE_CALENDAR_CLIENT_SECRET`
  - `GOOGLE_CALENDAR_REDIRECT_URI`
  - `WHATSAPP_*`
  - `SUPABASE_*` para infra, soporte historico o recuperacion

No incluir secretos en renderer, instalador, ASAR, `.env.example`, dumps ni documentacion.

## Estado funcional observado en codigo

- Login con bootstrap del primer tenant y administrador:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Licencia del tenant actual:
  - `GET /api/tenants/current/license`
- Administracion interna de tenants:
  - `GET /api/tenants`
  - `POST /api/tenants`
  - `PUT /api/tenants/:id/license`
- Roles disponibles: `ADMIN`, `MANAGER`, `EMPLOYEE`.
- Paginas activas en renderer:
  - `Dashboard`
  - `Clients`
  - `ClientDetail`
  - `Appointments`
  - `Services`
  - `Products`
  - `Sales`
  - `Cash`
  - `Ranking`
  - `Settings`
  - `Accounts` solo admin
  - `Reports` solo admin
  - `Sql` solo admin
- `Settings` centraliza impresora, Google Calendar, backups legacy, logs, carpeta de datos local, reset local e importadores `.xlsx`.
- Hay un asistente SQL admin para analizar e importar `01dat.sql`, pero no sustituye al flujo diario ni cubre ventas, caja ni referencias legacy de fotos.

## Convenciones multi-tenant

- Todo dato de negocio nuevo debe tener `tenantId` obligatorio.
- Las unicidades de negocio deben ser compuestas por tenant cuando aplique.
- Las consultas raw deben filtrar por `tenantId` explicitamente.
- Los procesos background sin request deben pasar contexto con `runWithTenantContext(...)` o escribir `tenantId` de forma explicita.
- El frontend no debe hablar directo con Supabase para datos sensibles.
- La licencia/trial se comprueba en servidor, no en reloj local ni instalador.
- Supabase RLS puede aniadirse como segunda capa, pero la autorizacion diaria vive en la API.

## Convenciones de backend

Para endpoints nuevos o cambios de contrato:
1. Definir o ajustar esquema Zod en `src/backend/validators`.
2. Aplicar `validateRequest(...)` en la ruta.
3. Aplicar `authMiddleware`, `adminMiddleware` o `platformAdminMiddleware` cuando corresponda.
4. Mantener tenant y licencia en contexto.
5. Mantener codigos HTTP y mensajes claros.
6. Mantener `src/backend/controllers/*` como capa fina y mover reglas de negocio a `src/backend/modules/<dominio>` o a un servicio enfocado.
7. No introducir un patron repository generico sobre Prisma.
8. Aniadir o actualizar tests relevantes.

Estado actual de seguridad:
- Publicos:
  - `POST /api/auth/login`
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
  - `GET /api/calendar/callback`
- Solo plataforma/admin segun ruta:
  - `POST /api/auth/register`
  - `/api/users/*`
  - `/api/tenants/*` salvo `/current/license`
  - `/api/calendar/*` salvo callback
  - `/api/sql/*`
- Muchos modulos de negocio siguen protegidos solo por autenticacion, no por rol fino.

## Convenciones de Electron

- Mantener `src/main/main.ts` como composition root; no reinyectar logica de negocio en handlers inline.
- Registrar nuevos canales IPC en `src/main/ipc/*`, conservando nombres de canal y payloads salvo cambio explicito de contrato.
- Cuando un contrato IPC ya sea estable, tiparlo o reutilizarlo desde `src/shared/electron.ts`.
- Reutilizar `src/main/backup.ts` como servicio tecnico de snapshots legacy; no duplicar esa logica en `main.ts`.
- No asumir que Electron protege secretos. ASAR/EXE/MSI son distribucion, no seguridad.

## Convenciones de frontend

- Consumir backend solo mediante `src/renderer/utils/api.ts` o adapters de dominio construidos sobre ese cliente.
- El token JWT se gestiona en `authStore`.
- El usuario autenticado puede incluir tenant, licencia e indicador de plataforma.
- Mantener `src/renderer/pages/*` como shells de routing cuando exista `src/renderer/features/*` para ese dominio.
- En pantallas grandes, mover carga, filtros, acciones y estado derivado a hooks y adapters; dejar el JSX pesado en componentes puros.
- Mantener Zustand solo para estado global real.
- Mantener consistencia con utilidades globales de `src/renderer/styles/index.css`.
- Si cambia un payload de API, actualizar frontend, validadores y tests.

## Testing

- Framework: Vitest.
- Hay suites en:
  - `tests/backend/unit`
  - `tests/backend/smoke`
  - `tests/main`
  - `tests/renderer/unit`
- Patron frecuente en backend: mock de Prisma con `vi.mock('../../../src/backend/db', ...)`.
- Recomendacion minima:
  - cambio en controller o servicio: test unitario;
  - cambio de contrato o ruteo critico: smoke test;
  - cambio en tenant/licencia: test de aislamiento y estados;
  - cambio en bridge Electron o utilidades de renderer: test especifico si existe suite cercana.

## Prisma y base de datos

- No editar `dist/*`, `release/*` ni generar SQL manual para cambios persistentes normales.
- Flujo estandar:
  1. editar `prisma/schema.prisma`;
  2. `npm run prisma:generate`;
  3. `npm run prisma:migrate`;
  4. comprobar carpeta nueva en `prisma/migrations`.
- SQLite legacy vive en `prisma/migrations_sqlite_legacy/*` y `src/backend/db/compat/*`.
- No seguir creciendo compatibility migrations SQLite salvo decision explicita.

## Backup, restore y recuperacion

- El flujo operativo SaaS es backup de PostgreSQL y Storage en proveedor central.
- El runtime local conserva backup/restore desde `Settings` como soporte legacy.
- La restauracion SQL admin es un flujo aparte y parcial.
- Los scripts PowerShell heredados de PostgreSQL/Supabase siguen existiendo para soporte historico.

## Que no tocar sin necesidad

- No editar manualmente:
  - `dist/`
  - `release/`
  - `node_modules/`
- No versionar secretos ni `.env*` reales.
- No romper scripts PowerShell sin dejar alternativa equivalente.
- No usar `.claude/worktrees/*` como fuente de verdad; son copias auxiliares.

## Riesgos y deuda activa

- Endurecimiento de permisos por rol todavia incompleto.
- Consultas raw y procesos background requieren vigilancia extra para aislamiento por tenant.
- Migracion real desde SQLite antigua a PostgreSQL tenant-aware pendiente de validacion con copias reales.
- Assets de clienta deben moverse a Storage/S3 para SaaS.
- El asistente SQL tiene alcance deliberadamente parcial.
- El auto-backup local es legacy y no sustituye backup SaaS.
- Hay documentacion historica en carpetas auxiliares que puede no coincidir con el root actual.

## Checklist minimo antes de cerrar cambios

1. El cambio sigue siendo coherente con `README.md`, `ROADMAP.md`, `BACKUP_RESTORE.md` y `ARCHITECTURE.md`.
2. Si toca backend, validar `npm run build:backend`.
3. Si toca desktop o empaquetado, validar `npm run build` o justificar por que no.
4. Si cambia contrato API o IPC, actualizar validator/tipos + ruta/controller o handler + frontend/preload + tests.
5. Si cambia modelo de datos, dejar migracion Prisma versionada.
6. No incluir secretos, dumps ni artefactos generados.
