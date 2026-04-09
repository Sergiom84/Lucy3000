# Roadmap Lucy3000

Estado actualizado: 2026-02-17

## Objetivo
Consolidar Lucy3000 como herramienta de operación diaria para estética: clientes, servicios, ventas, caja, inventario y reportes, con app de escritorio estable y base de datos local SQLite en el runtime actual.

## Hecho
- Build TypeScript estabilizado (frontend + backend).
- `build` ahora compila también backend antes de empaquetar Electron.
- Carga de `index.html` corregida para producción en Electron.
- Arranque automático de backend en producción desde Electron (sin requerir servidor externo manual).
- Seguridad de auth reforzada:
- Registro protegido por `auth + admin`.
- Eliminado fallback inseguro de JWT (`'secret'`).
- Validaciones mínimas en login/register.
- Validación de payloads con Zod aplicada en `auth`, `sales`, `cash` y `products` (body/query/params).
- Suite inicial de tests automáticos:
- Unit tests backend para `sales`, `cash` y `products`.
- Smoke tests API para salud, validación y flujos críticos de alta.
- Auditoría del backup Supabase histórico (`db_cluster-08-11-2025@00-27-55.backup`) con inventario de esquema y conteo estimado de filas.
- Scripts de recuperación añadidos:
- `scripts/analyze-backup.ps1` (auditoría/inventario).
- `scripts/restore-backup.ps1` (restauración adaptable `pg_restore`/`psql`).
- `scripts/rebuild-supabase-db.ps1` (reconstrucción remota completa sin Docker).
- Reconstrucción de BD ejecutada en Supabase (`mpyifvwqyakkmwdmtbhp`) con conteos validados:
- `users: 1`, `clients: 2`, `services: 24`.
- Usuario admin garantizado por upsert (`admin@lucy3000.com`).
- Ventas con lógica transaccional:
- Numeración de venta con lock transaccional.
- Aplicación y reversión de efectos de stock/puntos en cambios de estado y eliminación.
- Rango de fechas corregido a fin de día en reportes/ventas/caja.
- Caja: listado de movimientos con usuario incluido (coherencia API/UI).
- Stock:
- Ajustes permiten positivos/negativos.
- Bloqueo de stock negativo.
- Notificaciones de stock bajo sin duplicación masiva.
- Hash de `admin123` corregido en `scripts/create-admin.sql`.
- Se habilita versionado de migraciones (quitando exclusión de `prisma/migrations` en `.gitignore`).

## En Curso
- Limpieza de documentación duplicada/obsoleta.
- Alineación de docs con estado real del producto (sin marketing desfasado).
- Endurecer validaciones de negocio por módulo (clientes, citas, caja, productos).

## Pendiente (Prioridad Alta)
- Ampliar cobertura de tests automáticos:
- Unit tests restantes (`clients`, `appointments`, `services`, `reports`, `notifications`).
- Smoke/E2E de flujos completos con BD de prueba real.
- Control de permisos por rol en rutas sensibles (más allá de auth básica).
- Extender validación de payloads con Zod al resto de módulos (`clients`, `appointments`, `services`, `reports`, `notifications`).
- Auditoría de dependencias vulnerables (`npm audit`), especialmente:
- `axios`, `react-router-dom`, `express/qs`, `xlsx`.
- Resolver empaquetado Electron en Windows sin privilegios de symlink (problema local de entorno en `electron-builder`).

## Pendiente (Prioridad Media)
- Exportación real en Reportes (PDF/Excel), hoy es placeholder.
- Página de Configuración funcional (empresa, impuestos, caja, backups, usuarios).
- Backups operativos desde IPC (hoy stub).
- Gestión de errores de negocio consistente (mensajes + códigos + trazas).
- Mejorar performance del dashboard (evitar múltiples consultas secuenciales por día).

## Pendiente (Prioridad Baja)
- Optimización de bundle frontend (>500kB por chunk).
- Mejoras UX (filtros avanzados, accesibilidad, confirmaciones).
- Integración opcional con Google Calendar.

## Propuesta Técnica (sin romper continuidad)
1. Mantener stack actual en Fase 1:
- Prisma + SQLite local + Electron + React.
- Motivo: es el runtime que usa hoy este repo para desarrollo y escritorio.
2. Endurecer backend en Fase 2:
- Capa de validación (Zod), capa de servicios y transacciones más explícitas.
3. Evaluar alternativa a medio plazo (solo si el negocio escala):
- Opción A: Electron -> Tauri (menos consumo, empaquetado más ligero).
- Opción B: App web + PWA + acceso privado (si se prioriza movilidad).
- Opción C: Prisma -> Drizzle/SQL nativo solo si se necesita control SQL fino.

Recomendación actual: no cambiar Prisma ni Electron todavía. Primero consolidar operación y calidad sobre la base SQLite local existente.
