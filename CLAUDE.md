# CLAUDE.md

## Estado

Este archivo existe para evitar que la documentacion para agentes vuelva a divergir.
La guia detallada vive en `AGENTS.md`.

## Orden de lectura

1. `ROADMAP.md`
2. `README.md`
3. `BACKUP_RESTORE.md`
4. `ARCHITECTURE.md`
5. `AGENTS.md`

## Distribucion vigente (2026-05-31)

- Modelo elegido: API central + PostgreSQL/Supabase compartido multi-tenant. No se usara un proyecto Supabase por cliente.
- Cliente: web/PWA como canal recomendado; Electron queda como wrapper opcional, pero no debe guardar `DATABASE_URL` compartida en el PC del cliente.
- Trial controlado en `tenant_licenses` con hora de servidor; bootstrap nace `PENDING`, el cliente arranca con `start-trial`, gracia de 9 dias.
- Render ya no debe tratarse como canal dormido: es el camino natural para API central + front estatico cuando se configuren secretos y dominio.
- El `ID cliente` visible en login/dashboard ya existe como alias publico del tenant (`tenantCode`). No sustituye a `tenantId`.

## Resumen operativo

- Runtime oficial de datos: API central Express + Prisma + PostgreSQL multi-tenant.
- Cliente: React/Vite web/PWA; Electron queda como wrapper opcional de escritorio.
- Supabase puede usarse como infraestructura de Postgres/Storage, pero el frontend no debe saltarse la API para datos sensibles.
- SQLite queda como legado de migracion, importacion o soporte puntual.
- `tenantId` es la frontera interna real. `tenantSlug` existe como selector compatible; `ID cliente` numerico usa `tenantCode`.
- Bootstrap inicial:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Licencia tenant:
  - `GET /api/tenants/current/license`
- Estructura vigente:
  - `src/main/main.ts` es composition root y el IPC vive en `src/main/ipc/*`;
  - `src/backend/controllers/*` es capa HTTP fina y la logica va en `src/backend/modules/*`;
  - `src/backend/tenant/*` gestiona contexto multi-tenant y licencias;
  - `src/backend/db.ts` bootstrapea Prisma, aplica scoping tenant-aware y compatibilidad SQLite condicional;
  - `src/renderer/pages/*` es routing y la logica de pantallas grandes vive en `src/renderer/features/*`.
- Scripts npm oficiales:
  - `dev`, `dev:backend`, `dev:electron`
  - `build`, `build:backend`, `build:prepare-db`
  - `test`, `test:unit`, `test:smoke`
  - `prisma:generate`, `prisma:migrate`, `prisma:studio`
- Scripts PowerShell historicos y de soporte se ejecutan directamente desde `scripts/`.

## Reglas rapidas

- Si la documentacion contradice al codigo, manda el codigo.
- Si `ROADMAP.md` contradice otro markdown, manda `ROADMAP.md`.
- No tomes `.claude/worktrees/*` como fuente de verdad.
- No reintroduzcas logica pesada en `src/main/main.ts`, `src/backend/controllers/*` ni `src/renderer/pages/*`.
- Todo dato de negocio nuevo debe tener `tenantId`.
- Toda licencia/trial se decide en servidor.
- No entregar `DATABASE_URL` ni secretos de Supabase dentro de Electron/ASAR/instalador.
- Antes de meter un segundo cliente real en la base compartida: desplegar API central, aplicar migraciones, probar modo API remota para Electron y revisar RLS/aislamiento.
- Usa `AGENTS.md` para convenciones de backend, frontend, migraciones, testing y riesgos activos.
