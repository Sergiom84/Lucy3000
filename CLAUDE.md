# CLAUDE.md

## Estado
Este archivo existe para evitar que la documentación para agentes vuelva a divergir.
La guía detallada vive en `AGENTS.md`.

## Orden de lectura
1. `ROADMAP.md`
2. `README.md`
3. `BACKUP_RESTORE.md`
4. `ARCHITECTURE.md`
5. `AGENTS.md`

## Resumen operativo
- Runtime oficial: Electron + React + Express + Prisma + SQLite local.
- Canal oficial: instalador de escritorio generado con `npm run build`.
- Bootstrap inicial:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Estructura vigente tras la refactorización:
  - `src/main/main.ts` es composition root y el IPC vive en `src/main/ipc/*`;
  - `src/backend/controllers/*` es capa HTTP fina y la lógica va en `src/backend/modules/*`;
  - `src/backend/db.ts` bootstrapea Prisma y la compatibilidad vive en `src/backend/db/compat/*`;
  - `src/renderer/pages/*` es routing y la lógica de pantallas grandes vive en `src/renderer/features/*`.
- Scripts npm oficiales:
  - `dev`, `dev:backend`, `dev:electron`
  - `build`, `build:backend`, `build:prepare-db`
  - `test`, `test:unit`, `test:smoke`
  - `prisma:generate`, `prisma:migrate`, `prisma:studio`
- Scripts PowerShell históricos y de soporte se ejecutan directamente desde `scripts/`.

## Reglas rápidas
- Si la documentación contradice al código, manda el código.
- Si `ROADMAP.md` contradice otro markdown, manda `ROADMAP.md`.
- No tomes `.claude/worktrees/*` como fuente de verdad.
- No reintroduzcas lógica pesada en `src/main/main.ts`, `src/backend/controllers/*` ni `src/renderer/pages/*`.
- Usa `AGENTS.md` para convenciones de backend, frontend, migraciones, testing y riesgos activos.
