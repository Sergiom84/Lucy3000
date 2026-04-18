# Backup y Restauración

Estado actualizado: 2026-04-16

## Alcance

Este documento cubre dos cosas distintas:

- backups y restauración del runtime actual de escritorio basado en SQLite;
- restauración histórica apoyada en scripts PostgreSQL/Supabase heredados.

No son el mismo flujo y no deben mezclarse.

## 1. Runtime actual de escritorio

El escritorio usa SQLite local. Los backups operativos diarios se resuelven copiando el fichero `.db`.

### Qué hace hoy la app

Desde Electron, `src/main/main.ts` expone:

- creación manual de backup;
- restauración desde un backup seleccionado;
- listado de backups existentes;
- configuración de carpeta de backups;
- auto-backup simple semanal.

Comportamiento actual:

- los backups manuales generan `lucy3000-backup-<timestamp>.db`;
- se conservan los últimos 10 backups manuales;
- la restauración crea antes una copia de seguridad adicional `*.pre-restore`;
- el auto-backup conserva los últimos 4 backups automáticos.

### Dónde viven

Por defecto, la app usa el directorio de datos del usuario. La carpeta de destino puede cambiarse desde `Settings`.

### Recomendación operativa

- usa una carpeta sincronizada si quieres réplica externa, por ejemplo OneDrive o Google Drive;
- no reemplaces la base en caliente fuera del flujo de restauración de la app;
- después de restaurar, reinicia la aplicación.

## 2. Restauración histórica

El repositorio conserva tooling para analizar y reconstruir un backup histórico PostgreSQL/Supabase. Esto no convierte a Supabase en la base activa del producto; es un flujo separado de auditoría o recuperación.

Scripts relevantes:

- `scripts/analyze-backup.ps1`
- `scripts/restore-backup.ps1`
- `scripts/rebuild-supabase-db.ps1`
- `scripts/pull-schema-no-docker.ps1`
- `scripts/public-data-counts.sql`

## Resumen del backup histórico auditado

- Backup analizado: `db_cluster-08-11-2025@00-27-55.backup`
- Formato detectado: SQL plano
- Flujo automático disponible: `npm run db:rebuild`
- Binarios PostgreSQL portables disponibles en `tools/postgresql-17/pgsql/bin`

Inventario de negocio detectado:

- `users`
- `clients`
- `client_history`
- `services`
- `appointments`
- `products`
- `stock_movements`
- `sales`
- `sale_items`
- `cash_registers`
- `cash_movements`
- `notifications`
- `settings`

Conteos auditados en el histórico:

- `users`: 1
- `clients`: 2
- `services`: 24
- resto de tablas de negocio: 0

## Flujo recomendado para reconstrucción histórica

```powershell
npm run db:rebuild
```

Después:

- valida conteos con `scripts/public-data-counts.sql`;
- revisa permisos del entorno restaurado;
- valida login y flujos básicos antes de usar ese entorno para soporte o migración.

## Snapshot de esquema remoto sin Docker

Si necesitas extraer un snapshot de esquema remoto sin `supabase db pull`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pull-schema-no-docker.ps1 `
  -DatabaseUrl "<DATABASE_URL>" `
  -Schemas public `
  -PgBinDir ".\tools\postgresql-17\pgsql\bin"
```

## Qué no hacer

- no trates el flujo histórico PostgreSQL como si fuera el runtime diario del escritorio;
- no documentes Supabase como dependencia obligatoria del producto actual;
- no restaures un backup antiguo sobre una instalación activa sin conservar copia previa del `.db` local;
- no toques migraciones históricas ya aplicadas para “arreglar” un restore puntual.
