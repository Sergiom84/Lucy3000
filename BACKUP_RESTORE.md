# Backup y Restauración

Estado actualizado: 2026-04-23

## Alcance

En el repositorio conviven tres flujos distintos y no deben mezclarse:
1. backup y restore del runtime local actual;
2. restore legacy asistido desde la pantalla `SQL`;
3. scripts históricos de PostgreSQL/Supabase.

## 1. Runtime local actual

El flujo operativo normal del producto es el backup de escritorio gestionado por Electron.

### Qué expone la app

Desde `Settings` y el runtime de Electron existen estas operaciones:
- crear backup manual completo;
- restaurar un backup completo o un `.db` legacy;
- listar backups disponibles;
- elegir carpeta de backups;
- activar o desactivar auto-backup;
- abrir carpeta de datos local;
- resetear la instalación local.

La orquestación actual vive en:
- `src/main/main.ts` como composition root;
- `src/main/backupRuntime.ts` como runtime de backup y restore;
- `src/main/backup.ts` como servicio técnico de snapshots y restauración.

### Qué incluye un backup completo

Cada snapshot puede incluir:
- la base SQLite activa;
- ficheros `-wal` y `-shm` si existen;
- assets locales de cliente en disco.

Esto cubre la operativa diaria de:
- clientes;
- servicios;
- productos;
- citas;
- bonos;
- saldo a cuenta;
- ventas;
- caja;
- configuraciones persistidas en la base.

### Comportamiento actual

- los backups manuales usan prefijo `lucy3000-backup-<timestamp>`;
- los automáticos usan `lucy3000-auto-backup-<timestamp>`;
- antes de restaurar se crea `lucy3000-pre-restore-backup-<timestamp>`;
- el reset local crea `lucy3000-reset-backup-<timestamp>.db` si existía BD previa;
- en empaquetado, Electron pausa el backend mientras snapshota o restaura;
- se conservan los últimos 10 backups manuales;
- se conservan los últimos 4 auto-backups;
- el auto-backup real es semanal mediante `setInterval`.

### Dónde vive la información

- base productiva empaquetada: carpeta de datos local del usuario;
- backups: carpeta configurable desde `Settings`;
- assets de cliente: carpetas locales del usuario, fuera del bundle.

### Restore soportado

Lucy3000 distingue dos fuentes:
- carpeta de backup completo creada por la propia app;
- fichero `.db` antiguo.

Si restauras una carpeta completa:
- se restaura base + assets soportados.

Si restauras solo un `.db`:
- se restaura la base;
- los assets locales no se tocan.

### Recomendaciones operativas

- usa el restore de la propia app, no sustituyas la BD “en caliente”;
- si necesitas copia externa, apunta la carpeta de backups a OneDrive, Google Drive o similar;
- tras un restore que requiera relanzado, deja que la app se reinicie;
- usa “Restablecer instalación local” solo cuando quieras volver al bootstrap del primer administrador.

## 2. Restore SQL legacy asistido

La pantalla `SQL` es un flujo admin aparte.
No sustituye al backup diario y no es una restauración universal de todo el negocio.

### Qué hace

- analiza un `01dat.sql` o `01dat.sqlx` en formato SQL plano;
- muestra un wizard por bloques de datos;
- permite revisar, seleccionar y editar filas antes del commit;
- registra eventos de importación;
- crea un backup local de seguridad antes de escribir;
- importa a la BD vacía únicamente lo soportado.

La UI del asistente vive hoy bajo `src/renderer/features/sql/*`; la ruta visible sigue siendo `/sql`.

### Qué puede restaurar

Según el código actual, el asistente cubre:
- clientes;
- tratamientos;
- productos;
- catálogo de bonos;
- bonos de clientes;
- saldo o abonos de clientes;
- citas;
- bloqueos de agenda;
- notas de agenda;
- consentimientos y firmas como assets generados.

### Qué no cubre

- ventas;
- caja;
- referencias legacy de fotos;
- una reconstrucción total y fiel de todo el sistema antiguo.

### Reglas del flujo

- requiere rol administrador;
- está pensado para escritorio, no para navegador puro;
- asume base de negocio funcionalmente vacía antes del commit;
- usa el bridge de Electron para el backup previo y para guardar assets generados.

## 3. Scripts históricos PostgreSQL/Supabase

Estos scripts siguen en el repo para soporte o recuperación puntual, pero no forman parte del uso diario del producto.

Scripts disponibles:
- `scripts/analyze-backup.ps1`
- `scripts/restore-backup.ps1`
- `scripts/rebuild-supabase-db.ps1`
- `scripts/pull-schema-no-docker.ps1`
- `scripts/public-data-counts.sql`

Se ejecutan directamente, no desde `npm run`.

## Cuándo usar cada flujo

- Backup local de escritorio:
  para operación diaria, soporte y restore habitual.
- Pantalla `SQL`:
  para rescatar datos legacy parciales desde `01dat.sql` o `01dat.sqlx` con revisión manual, siempre que el contenido sea SQL plano.
- Scripts PostgreSQL/Supabase:
  para auditoría histórica o soporte sobre backups remotos heredados.

## Qué no hacer

- no documentes Supabase como base activa del producto actual;
- no uses el asistente SQL como si fuera backup diario;
- no reemplaces la SQLite local por fuera del flujo de restore salvo soporte muy controlado;
- no mezcles restore `.db`, restore SQL y scripts históricos como si fuesen equivalentes;
- no toques migraciones históricas ya aplicadas para “arreglar” un restore puntual.
