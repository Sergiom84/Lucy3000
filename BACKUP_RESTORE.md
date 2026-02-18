# Backup y Restauración (Supabase)

Estado de revisión: 2026-02-17

## Resumen rápido
- Backup analizado: `C:\Users\sergi\Desktop\backup Lucy3000\db_cluster-08-11-2025@00-27-55.backup`
- Formato real detectado: SQL plano (texto), no `pg_dump` custom
- Proyecto Supabase actual (`mpyifvwqyakkmwdmtbhp`): reconstruido y operativo
- `supabase db pull` falla sin Docker en este entorno
- Ya hay binarios portables PostgreSQL en `tools/postgresql-17/pgsql/bin` (`psql`, `pg_restore`, `pg_dump`)
- Flujo automático disponible: `npm run db:rebuild`

## Hallazgos del backup
Inventario detectado (esquema `public`) y compatible con `prisma/schema.prisma`:
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

Enums públicos detectados:
- `UserRole`
- `AppointmentStatus`
- `StockMovementType`
- `PaymentMethod`
- `SaleStatus`
- `CashMovementType`

Filas detectadas por bloques `COPY` en backup:
- `public.users`: 1
- `public.clients`: 2
- `public.services`: 24
- Resto de tablas negocio: 0

## Entregables añadidos
- Migración base Prisma:
  - `prisma/migrations/20260217184500_initial_schema/migration.sql`
- Script de auditoría de backup:
  - `scripts/analyze-backup.ps1`
- Script de restauración con `pg_restore`:
  - `scripts/restore-backup.ps1`
- Script de extracción de esquema remoto sin Docker:
  - `scripts/pull-schema-no-docker.ps1`
- Script de reconstrucción completa (sin Docker y sin password manual):
  - `scripts/rebuild-supabase-db.ps1`
- SQL de validación post-restauración:
  - `scripts/public-data-counts.sql`

## Flujo recomendado de reconstrucción
1. Ejecutar reconstrucción completa:
```powershell
npm run db:rebuild
```
2. Validar conteos de tablas con `scripts/public-data-counts.sql`.
3. Probar login (`admin@lucy3000.com`) y flujos de negocio (clientes, servicios, ventas).

## Resultado actual de la restauración
Conteos verificados en remoto tras `db:rebuild`:
- `users`: 1
- `clients`: 2
- `services`: 24
- resto de tablas de negocio: 0

## Flujo recomendado sin Docker para "pull" de esquema remoto
Para mantener un snapshot del esquema remoto sin usar `supabase db pull`:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pull-schema-no-docker.ps1 `
  -DatabaseUrl "<SUPABASE_DATABASE_URL_CON_SSLMODE_REQUIRE>" `
  -Schemas public `
  -PgBinDir ".\tools\postgresql-17\pgsql\bin"
```
Esto genera un SQL en `supabase/migrations` con timestamp.

## Notas importantes
- El backup incluye esquemas de plataforma (`auth`, `storage`, `realtime`, `vault`), pero para Lucy3000 solo se requiere `public`.
- En el dump histórico se observan `GRANT ALL` amplios sobre tablas públicas; se recomienda revisar permisos/RLS después de restaurar.
- `scripts/rebuild-supabase-db.ps1` reutiliza `filtered_db_cluster-08-11-2025@00-27-55.sql` si existe para acelerar la carga.
