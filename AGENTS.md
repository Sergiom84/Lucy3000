# AGENTS.md

## Contexto del proyecto
Lucy3000 es una app de escritorio para gestión de estética.
La topología real actual es Electron + React/Vite + Express + Prisma + SQLite local.
Supabase sigue apareciendo en scripts y documentación histórica, pero no es la base operativa del runtime distribuido.

## Fuentes de verdad
Cuando una instrucción o documento entre en conflicto, usa este orden:
1. `ROADMAP.md`
2. `README.md`
3. `BACKUP_RESTORE.md`
4. `ARCHITECTURE.md`
5. `package.json`, `prisma/schema.prisma`, `src/backend/app.ts`, `src/main/main.ts`, `src/backend/db/compat/index.ts`, `src/shared/electron.ts`

Si algo documentado contradice al código, manda el código.

## Stack técnico
- Runtime: Node.js 18+.
- Desktop: Electron + `vite-plugin-electron`.
- Frontend: React 18, TypeScript, Vite, Tailwind, Zustand, Axios.
- Backend: Express + TypeScript + Zod.
- Datos: Prisma ORM + SQLite.
- Tests: Vitest + Supertest, con suites en backend, `tests/main` y `tests/renderer/unit`.

## Estructura importante
- `src/main/main.ts`: composition root del proceso principal de Electron; compone runtimes y registra arranque.
- `src/main/backendRuntime.ts`: arranque, parada y healthcheck del backend empaquetado.
- `src/main/runtimeData.ts`: paths, apertura de carpeta de datos y reset local.
- `src/main/backupRuntime.ts`: operaciones de backup, restore y auto-backup.
- `src/main/clientAssetsRuntime.ts`: assets locales de cliente y protocolo seguro.
- `src/main/printing.ts`: impresión PDF y tickets.
- `src/main/ipc/*`: registro de `ipcMain.handle(...)` por dominio.
- `src/main/backup.ts`: snapshots y restore del runtime local.
- `src/preload.ts`: bridge seguro con `contextBridge`.
- `src/shared/electron.ts`: contratos IPC compartidos entre `main`, `preload` y renderer.
- `src/renderer/App.tsx`: routing principal; usa `HashRouter` en `file://` y `BrowserRouter` en dev.
- `src/renderer/pages/*`: entrypoints de routing y wrappers ligeros.
- `src/renderer/features/*`: lógica de pantallas grandes, hooks, adapters y componentes puros.
- `src/renderer/utils/api.ts`: cliente HTTP oficial para la API.
- `src/backend/app.ts`: middlewares, rutas API y fallback SPA.
- `src/backend/server.ts`: arranque HTTP.
- `src/backend/routes/*`: endpoints y middleware.
- `src/backend/controllers/*`: adaptadores HTTP finos.
- `src/backend/modules/*`: lógica de negocio por dominio.
- `src/backend/services/*`: Google Calendar, recordatorios, import SQL, sincronización de agenda.
- `src/backend/validators/*`: contratos Zod.
- `src/backend/db.ts`: cliente Prisma y orquestación de compatibilidad SQLite.
- `src/backend/db/compat/*`: guards de compatibilidad SQLite por dominio o versión lógica.
- `src/shared/*`: utilidades compartidas de tickets y matching.
- `prisma/schema.prisma`: modelo persistente real.
- `prisma/migrations/*`: migraciones versionadas.

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
1. `npm install`
2. Crear `.env` a partir de `.env.example`
3. Revisar `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`
4. `npm run prisma:generate`
5. `npm run prisma:migrate`
6. `npm run dev`
7. Si no existe ningún usuario, crear el primer `ADMIN` desde login

## Entorno y secretos
- El backend carga `.env` y, fuera de producción, después `.env.development`.
- En empaquetado, Electron puede leer `.env` junto al `.exe`, en `resources/` o en `userData`.
- Variables críticas:
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
  - `SUPABASE_*` solo para flujos históricos, restore o soporte puntual

Nota importante sobre SQLite en desarrollo:
`DATABASE_URL="file:./prisma/lucy3000.db"` se resuelve relativo a `prisma/schema.prisma`, así que el fichero acaba en `prisma/prisma/lucy3000.db`.

## Estado funcional observado en código
- Login con bootstrap del primer administrador:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Roles disponibles: `ADMIN`, `MANAGER`, `EMPLOYEE`.
- Páginas activas en renderer:
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
- `Settings` centraliza:
  - impresora de tickets;
  - Google Calendar;
  - backups;
  - logs y carpeta de datos local;
  - reseteo de instalación local;
  - importadores `.xlsx`.
- Hay un asistente SQL admin para analizar e importar `01dat.sql`, pero no sustituye al flujo diario ni cubre ventas, caja ni referencias legacy de fotos.

## Convenciones de backend
Para endpoints nuevos o cambios de contrato:
1. Definir o ajustar esquema Zod en `src/backend/validators`.
2. Aplicar `validateRequest(...)` en la ruta.
3. Aplicar `authMiddleware` y `adminMiddleware` cuando corresponda.
4. Mantener códigos HTTP y mensajes claros.
5. Mantener `src/backend/controllers/*` como capa fina y mover reglas de negocio a `src/backend/modules/<dominio>` o a un servicio enfocado.
6. No introducir un patrón repository genérico sobre Prisma.
7. Añadir o actualizar tests relevantes.

Estado actual de seguridad:
- Públicos:
  - `POST /api/auth/login`
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
  - `GET /api/calendar/callback`
- Solo admin en backend:
  - `POST /api/auth/register`
  - `/api/users/*`
  - `/api/calendar/*` salvo callback
  - `/api/sql/*`
- Muchos módulos de negocio siguen protegidos solo por autenticación, no por rol fino.

## Convenciones de Electron
- Mantener `src/main/main.ts` como composition root; no reinyectar lógica de negocio en handlers inline.
- Registrar nuevos canales IPC en `src/main/ipc/*`, conservando nombres de canal y payloads salvo cambio explícito de contrato.
- Cuando un contrato IPC ya sea estable, tiparlo o reutilizarlo desde `src/shared/electron.ts`.
- Reutilizar `src/main/backup.ts` como servicio técnico de snapshots y restore; no duplicar esa lógica en `main.ts`.

## Convenciones de frontend
- Consumir backend solo mediante `src/renderer/utils/api.ts` o adapters de dominio construidos sobre ese cliente.
- El token JWT se gestiona en `authStore`.
- Mantener `src/renderer/pages/*` como shells de routing cuando exista `src/renderer/features/*` para ese dominio.
- En pantallas grandes, mover carga, filtros, acciones y estado derivado a hooks y adapters; dejar el JSX pesado en componentes puros.
- Mantener Zustand solo para estado global real; no convertir estado local de pantalla en store global por defecto.
- Mantener consistencia con utilidades globales de `src/renderer/styles/index.css`.
- Si cambia un payload de API, actualizar frontend, validadores y tests.
- En nuevas pantallas o modales, no añadir texto explicativo bajo títulos salvo necesidad funcional clara.
- En botones nuevos, evitar iconografía decorativa junto al texto salvo instrucción explícita.

## Testing
- Framework: Vitest.
- Hay suites en:
  - `tests/backend/unit`
  - `tests/backend/smoke`
  - `tests/main`
  - `tests/renderer/unit`
- Patrón frecuente en backend: mock de Prisma con `vi.mock('../../../src/backend/db', ...)`.
- Recomendación mínima:
  - cambio en controller o servicio: test unitario;
  - cambio de contrato o ruteo crítico: smoke test;
  - cambio en bridge Electron o utilidades de renderer: test específico si existe suite cercana.

## Prisma y base de datos
- No editar `dist/*`, `release/*` ni generar SQL manual para cambios persistentes normales.
- Flujo estándar:
  1. editar `prisma/schema.prisma`;
  2. `npm run prisma:generate`;
  3. `npm run prisma:migrate`;
  4. comprobar carpeta nueva en `prisma/migrations`.
- El esquema actual ya incluye, entre otros:
  - `AppointmentService`
  - `AppointmentLegend`
  - `AgendaBlock`
  - `AgendaDayNote`
  - `DashboardReminder`
  - `PendingPayment`
  - `PendingPaymentCollection`
  - `CashCount`
  - `GoogleCalendarConfig`
  - campos legacy de importación en bonos y saldo

## Compatibility migrations SQLite
`src/backend/db.ts` ya solo debe bootstrapear Prisma y orquestar compatibilidad.
Los guards viven en `src/backend/db/compat/*`.
Hoy cubren, entre otros:
- `users.username`
- `account_balance_movements.paymentMethod`
- `sales.paymentBreakdown`
- columnas de cierre y arqueo en `cash_registers`
- refs legacy en `account_balance_movements`
- `bonoTemplateId` y refs legacy en `bono_packs`
- soporte de clienta invitada en `appointments`
- `appointment_services`
- `appointment_legends`
- `agenda_blocks`
- `agenda_day_notes`
- `dashboard_reminders`
- `pending_payments`
- `pending_payment_collections`
- múltiples sesiones de bono por cita
- leyendas por defecto de agenda

No deben seguir creciendo sin una decisión explícita: lo normal es migrar por Prisma.

## Backup, restore y recuperación
- El flujo operativo diario es el backup de escritorio desde `Settings`, no scripts externos.
- El runtime local soporta:
  - backup manual completo;
  - restore desde snapshot completo o `.db`;
  - listado de backups;
  - carpeta configurable;
  - auto-backup semanal simple.
- La restauración SQL admin es un flujo aparte.
- Los scripts PowerShell heredados de PostgreSQL/Supabase siguen existiendo solo para soporte histórico.

## Qué no tocar sin necesidad
- No editar manualmente:
  - `dist/`
  - `release/`
  - `node_modules/`
- No versionar secretos ni `.env*` reales.
- No romper scripts PowerShell sin dejar alternativa equivalente.
- No usar `.claude/worktrees/*` como fuente de verdad; son copias auxiliares, no el proyecto activo.

## Riesgos y deuda activa
- Endurecimiento de permisos por rol todavía incompleto.
- Las compatibility migrations SQLite ahora están separadas, pero deben consolidarse cuando ya no hagan falta guards runtime.
- El asistente SQL tiene alcance deliberadamente parcial.
- El auto-backup guarda `cronExpression`, pero la ejecución real sigue siendo un `setInterval` semanal.
- Hay documentación histórica en carpetas auxiliares que puede no coincidir con el root actual.

## Checklist mínimo antes de cerrar cambios
1. El cambio sigue siendo coherente con `README.md`, `ROADMAP.md`, `BACKUP_RESTORE.md` y `ARCHITECTURE.md`.
2. Si toca backend, validar `npm run build:backend`.
3. Si toca desktop o empaquetado, validar `npm run build`.
4. Si cambia contrato API o IPC, actualizar validator/tipos + ruta/controller o handler + frontend/preload + tests.
5. Si cambia modelo de datos, dejar migración Prisma versionada.
6. No incluir secretos, dumps ni artefactos generados.
