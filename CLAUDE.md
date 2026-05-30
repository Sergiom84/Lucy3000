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

## Resumen operativo

- Runtime oficial de datos: API central Express + Prisma + PostgreSQL multi-tenant.
- Cliente: React/Vite web/PWA; Electron queda como wrapper opcional de escritorio.
- Supabase puede usarse como infraestructura de Postgres/Storage, pero el frontend no debe saltarse la API para datos sensibles.
- SQLite queda como legado de migracion, importacion o soporte puntual.
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
- Usa `AGENTS.md` para convenciones de backend, frontend, migraciones, testing y riesgos activos.
