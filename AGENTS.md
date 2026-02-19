# AGENTS.md

## Contexto del proyecto
Lucy3000 es una app de escritorio para gestión de estética.
Combina Electron (main/preload), React + Vite (renderer) y un backend Express con Prisma sobre PostgreSQL (Supabase).

## Estado actual y fuentes de verdad
Usa estas fuentes en este orden para decidir cómo trabajar:
1. `ROADMAP.md` para estado real, prioridades y deuda técnica activa.
2. `README.md` para onboarding general y comandos base.
3. `BACKUP_RESTORE.md` para flujos de recuperación de base de datos.
4. `ARCHITECTURE.md` para mapa técnico del sistema.

## Stack técnico
- Runtime: Node.js 18+ (Render usa Node 20).
- Frontend: React 18, TypeScript, Vite, Tailwind, Zustand, Axios.
- Desktop: Electron + `vite-plugin-electron`.
- Backend: Express + TypeScript + Zod.
- Datos: Prisma ORM + PostgreSQL (Supabase).
- Tests: Vitest + Supertest (enfocados en backend).

## Estructura importante
- `src/main/main.ts`: proceso principal de Electron.
- `src/preload.ts`: bridge seguro (`contextBridge`) entre renderer y main.
- `src/renderer/*`: UI React (pages/components/stores/utils).
- `src/backend/server.ts`: arranque HTTP.
- `src/backend/app.ts`: middlewares, rutas API y fallback SPA.
- `src/backend/routes/*`: definición de endpoints.
- `src/backend/controllers/*`: lógica de negocio.
- `src/backend/validators/*`: esquemas Zod (request validation).
- `src/backend/middleware/*`: auth y validación reusable.
- `prisma/schema.prisma`: modelo de datos principal.
- `prisma/migrations/*`: migraciones versionadas.
- `scripts/*`: utilidades operativas (dev, backup, restore, rebuild).

## Comandos operativos
- `npm run dev`: flujo local completo.
- `npm run dev:backend`: backend en watch con `ts-node` + `nodemon`.
- `npm run dev:electron`: frontend/electron por Vite.
- `npm run build`: compila backend + app Electron empaquetable.
- `npm run build:backend`: transpila solo backend a `dist/backend`.
- `npm run test`: ejecuta todos los tests.
- `npm run test:unit`: tests unitarios backend.
- `npm run test:smoke`: smoke tests API.
- `npm run prisma:generate`: genera cliente Prisma.
- `npm run prisma:migrate`: crea/aplica migración de desarrollo.
- `npm run prisma:studio`: inspección/edición manual de datos.
- `npm run backup:analyze`: auditoría de backup.
- `npm run backup:restore`: restauración desde backup.
- `npm run db:rebuild`: reconstrucción de BD Supabase (script avanzado).

## Flujo local recomendado
1. Instalar dependencias: `npm install`.
2. Configurar variables (`.env` y opcional `.env.development`).
3. Ejecutar `npm run prisma:generate`.
4. Ejecutar `npm run prisma:migrate`.
5. Crear/admin seed con `scripts/create-admin.sql` o Prisma Studio.
6. Levantar con `npm run dev`.

## Entorno y secretos
- Archivo base: `.env`.
- Override local no productivo: `.env.development`.
- Carga efectiva: primero `.env`, luego `.env.development` (override) en `src/backend/config/loadEnv.ts`.
- Variables críticas:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `PORT`
  - `NODE_ENV`
- Variables Supabase para cliente/API:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY`

## Particularidades importantes de desarrollo
- `npm run dev` ejecuta `predev`, que mata procesos en puertos `3001`, `5173`, `5174` (`scripts/kill-dev-ports.ps1`).
- Si falta `DATABASE_URL`, `scripts/dev-backend.ps1` intenta obtener credenciales temporales desde proyecto Supabase linkeado (`npx supabase db dump --dry-run --linked`).
- Si falta `JWT_SECRET` en dev backend script, usa fallback local de desarrollo.
- La app renderer usa `VITE_API_URL` o fallback `http://localhost:3001/api` (`src/renderer/utils/api.ts`).

## Convenciones de backend
Para endpoints nuevos o cambios de contrato:
1. Definir/actualizar esquema Zod en `src/backend/validators`.
2. Aplicar `validateRequest(...)` en la ruta (`src/backend/routes/*`).
3. Proteger con `authMiddleware` y `adminMiddleware` cuando aplique.
4. Implementar lógica en controller con `try/catch` y códigos HTTP claros.
5. Añadir/actualizar tests unitarios y smoke según impacto.

Reglas actuales de seguridad:
- `POST /api/auth/login` es público.
- `POST /api/auth/register` requiere auth + rol ADMIN.
- La mayoría de módulos de negocio usan `router.use(authMiddleware)`.

## Convenciones de frontend
- Consumir backend solo mediante `api` (`src/renderer/utils/api.ts`), no crear clientes HTTP paralelos.
- El token JWT se gestiona desde `authStore` (persistido con Zustand).
- Mantener consistencia visual con utilidades Tailwind globales (`btn`, `card`, `input`, `badge`) de `src/renderer/styles/index.css`.
- Si cambia payload de API, actualizar tipos/uso en páginas y componentes afectados.

## Testing
- Framework: Vitest (`vitest.config.ts`, entorno Node).
- Patrón backend tests: mock de Prisma con `vi.mock('../../../src/backend/db', ...)`.
- Helpers de test en `tests/backend/helpers` y mocks en `tests/backend/mocks`.
- Recomendación mínima por cambio backend:
  - Lógica de controller: test unitario.
  - Validación/ruteo crítico: smoke test.

## Prisma y base de datos
- No editar `dist/*` ni usar SQL manual si el cambio es de modelo persistente; preferir flujo Prisma.
- Flujo estándar:
  1. Editar `prisma/schema.prisma`.
  2. Ejecutar `npm run prisma:generate`.
  3. Ejecutar `npm run prisma:migrate`.
  4. Verificar que se crea carpeta en `prisma/migrations`.
- Evitar modificar migraciones históricas ya aplicadas salvo instrucción explícita.

## Backup, restore y reconstrucción
- Scripts clave:
  - `scripts/analyze-backup.ps1`
  - `scripts/restore-backup.ps1`
  - `scripts/rebuild-supabase-db.ps1`
  - `scripts/pull-schema-no-docker.ps1`
- Estos scripts están orientados a Windows/PowerShell y tooling PostgreSQL local (`tools/postgresql-17/...`) o PATH.

## Deployment
- Configuración de referencia: `render.yaml`.
- Build en Render genera frontend y backend; arranque ejecuta `prisma migrate deploy` + `node dist/backend/server.js`.
- Healthcheck esperado: `/health`.

## Qué no tocar sin necesidad
- No editar manualmente artefactos generados:
  - `dist/`
  - `release/`
  - `node_modules/`
- No versionar secretos ni archivos de entorno reales (`.env*`).
- No romper compatibilidad de scripts PowerShell sin validar alternativa equivalente.

## Riesgos y deuda conocidos (prioridades activas)
- Falta extender validaciones Zod a todos los módulos.
- Falta cobertura de tests para módulos restantes (`clients`, `appointments`, `services`, `reports`, `notifications`).
- Falta endurecer permisos por rol en rutas sensibles fuera de auth básica.
- Hay documentación histórica desalineada en algunos puntos; validar con código y `ROADMAP.md`.

## Checklist mínimo antes de cerrar cambios
1. El cambio compila y no rompe `npm run build:backend` (o `npm run build` si afecta desktop/build).
2. Tests relevantes pasan (`npm run test:unit` y/o `npm run test:smoke`).
3. Si cambió contrato API, se actualizaron frontend + validators + tests.
4. Si cambió modelo de datos, hay migración Prisma versionada.
5. No se incluyeron secretos, dumps ni artefactos compilados por error.
