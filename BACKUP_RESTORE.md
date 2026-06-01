# Backup y Restauracion

Estado actualizado: 2026-05-31

## Alcance

En el repositorio conviven tres flujos distintos y no deben mezclarse:
1. backup SaaS de PostgreSQL y Storage;
2. restore legacy asistido desde la pantalla `SQL`;
3. backup/restore local de Electron para instalaciones antiguas o soporte puntual.

## 1. Backup SaaS actual

La fuente de verdad del producto multi-equipo es PostgreSQL/Supabase compartido
por tenants. En produccion, el backup operativo debe vivir en la infraestructura
central:
- snapshots o backups gestionados del proveedor PostgreSQL;
- dumps controlados por entorno;
- backups de Storage/S3 para fotos y documentos;
- retencion y restauracion probadas por tenant o por instancia completa.

Si se usa Supabase, Neon, Render, Railway, Fly o VPS, la decision de backup debe documentarse junto al despliegue real. Supabase Free puede valer para demo o piloto, pero no debe tratarse como canal comercial estable. No hay un proyecto Supabase por cliente; las restauraciones deben respetar `tenantId` y evitar pisar datos de otros centros.

### Que debe cubrir

- tenants y licencias;
- usuarios y roles;
- clientas, historial, saldo y ranking;
- servicios, productos y stock;
- citas, agenda, bloqueos y notas;
- bonos y sesiones;
- ventas, cobros pendientes, caja y arqueos;
- ajustes y configuracion de Google Calendar;
- assets en Storage/S3.

### Recomendaciones operativas

- automatizar backups diarios como minimo;
- probar restore antes de vender el servicio;
- medir tamano de base, Storage y egress con datos equivalentes a 6 o 7 centros;
- mantener exportacion por tenant para soporte, baja o portabilidad;
- probar restauracion puntual por tenant antes de vender el modelo compartido;
- no guardar fotos o documentos binarios dentro de PostgreSQL.

## 2. Restore SQL legacy asistido

La pantalla `SQL` es un flujo admin aparte.
No sustituye al backup diario y no es una restauracion universal de todo el negocio.

### Que hace

- analiza un `01dat.sql` o `01dat.sqlx` en formato SQL plano;
- muestra un wizard por bloques de datos;
- permite revisar, seleccionar y editar filas antes del commit;
- registra eventos de importacion;
- importa a la base del tenant actual unicamente lo soportado.

La UI del asistente vive bajo `src/renderer/features/sql/*`; la ruta visible sigue siendo `/sql`.

### Que puede restaurar

Segun el codigo actual, el asistente cubre:
- clientes;
- tratamientos;
- productos;
- catalogo de bonos;
- bonos de clientes;
- saldo o abonos de clientes;
- citas;
- bloqueos de agenda;
- notas de agenda;
- consentimientos y firmas como assets generados.

### Que no cubre

- ventas;
- caja;
- referencias legacy de fotos;
- una reconstruccion total y fiel de todo el sistema antiguo.

### Reglas del flujo

- requiere rol administrador;
- debe ejecutarse con contexto de tenant;
- esta pensado para rescatar datos legacy parciales;
- asume que el destino esta preparado para recibir esa importacion;
- no debe saltarse validaciones ni scoping multi-tenant.

## 3. Backup/restore local de Electron legacy

El runtime de escritorio conserva operaciones de backup local porque eran el flujo normal de la etapa SQLite y siguen siendo utiles para soporte.

Desde `Settings` y el runtime de Electron existen estas operaciones:
- crear backup manual completo;
- restaurar un backup completo o un `.db` legacy;
- listar backups disponibles;
- elegir carpeta de backups;
- activar o desactivar auto-backup;
- abrir carpeta de datos local;
- resetear la instalacion local.

La orquestacion vive en:
- `src/main/main.ts` como composition root;
- `src/main/backupRuntime.ts` como runtime de backup y restore;
- `src/main/backup.ts` como servicio tecnico de snapshots y restauracion.

### Que incluye un backup local completo

Cada snapshot legacy puede incluir:
- la base SQLite activa;
- ficheros `-wal` y `-shm` si existen;
- assets locales de cliente en disco.

Este flujo no cubre por si solo el SaaS central ni reemplaza backups de PostgreSQL/Storage.

### Comportamiento legacy

- los backups manuales usan prefijo `lucy3000-backup-<timestamp>`;
- los automaticos usan `lucy3000-auto-backup-<timestamp>`;
- antes de restaurar se crea `lucy3000-pre-restore-backup-<timestamp>`;
- el reset local crea `lucy3000-reset-backup-<timestamp>.db` si existia BD previa;
- en empaquetado, Electron pausa el backend mientras snapshota o restaura;
- se conservan los ultimos 10 backups manuales;
- se conservan los ultimos 4 auto-backups;
- el auto-backup real es semanal mediante `setInterval`.

## Scripts historicos PostgreSQL/Supabase

Estos scripts siguen en el repo para soporte o recuperacion puntual.

Scripts disponibles:
- `scripts/analyze-backup.ps1`
- `scripts/restore-backup.ps1`
- `scripts/rebuild-supabase-db.ps1`
- `scripts/pull-schema-no-docker.ps1`
- `scripts/public-data-counts.sql`

Se ejecutan directamente, no desde `npm run`.

## Cuando usar cada flujo

- Backup SaaS:
  para produccion, clientes reales y recuperacion operativa.
- Pantalla `SQL`:
  para rescatar datos legacy parciales desde `01dat.sql` o `01dat.sqlx` con revision manual.
- Backup local de Electron:
  para instalaciones antiguas, soporte puntual o migracion desde SQLite.
- Scripts PostgreSQL/Supabase:
  para auditoria historica o soporte sobre backups remotos heredados.

## Que no hacer

- no uses backup local de Electron como backup principal del SaaS;
- no uses el asistente SQL como si fuera backup diario;
- no reemplaces datos de otro tenant durante importaciones;
- no guardes secretos ni credenciales de proveedor dentro del cliente;
- no guardes la `DATABASE_URL` compartida en Electron o en backups entregados a clientes;
- no confies en MSI/EXE/ASAR como barrera real de proteccion;
- no toques migraciones historicas ya aplicadas para arreglar un restore puntual.
