# Arquitectura de Lucy3000

Estado actualizado: 2026-05-26

## Topologia oficial

Lucy3000 se esta convirtiendo en una aplicacion SaaS web/PWA multi-tenant. Electron queda como wrapper opcional para escritorio y capacidades locales, pero la fuente de verdad vive en la API central.

```text
Browser / PWA / Electron Wrapper
    |
    v
React Renderer
    |
    v
Express API central
    |
    +-- Auth, tenant, licencia y reglas de negocio
    |
    v
Prisma
    |
    v
PostgreSQL compartido por tenants
    |
    +-- Storage/S3 para fotos y assets
```

Google Calendar y otros servicios externos se integran desde el backend y siempre con contexto de tenant.

## Capas principales

### 1. Electron

Responsabilidades actuales:
- crear la ventana principal cuando se usa el canal escritorio;
- iniciar o apuntar al backend segun entorno;
- exponer bridge seguro al renderer;
- gestionar logs, impresion y utilidades locales;
- conservar flujos legacy de backup/restore mientras se migra a SaaS.

Archivos clave:
- `src/main/main.ts`
- `src/main/backendRuntime.ts`
- `src/main/runtimeData.ts`
- `src/main/backupRuntime.ts`
- `src/main/clientAssetsRuntime.ts`
- `src/main/printing.ts`
- `src/main/ipc/*`
- `src/main/backup.ts`
- `src/main/clientAssets.ts`
- `src/main/logging.ts`
- `src/main/escpos.ts`
- `src/preload.ts`
- `src/shared/electron.ts`

`src/main/main.ts` no debe actuar como contenedor de logica:
- compone runtimes;
- registra IPC;
- arranca backend y ventana cuando aplica;
- delega el resto en modulos especificos.

### 2. Preload

El bridge expuesto en `src/preload.ts` cubre:
- version y paths de la app;
- logs;
- backups legacy;
- impresion PDF y tickets;
- assets locales legacy;
- relanzado y cierre controlado de la app.

Los contratos compartidos del bridge viven en `src/shared/electron.ts`, de forma que `main`, `preload` y renderer compartan tipos estables.

Esto mantiene `contextIsolation` y evita acceso directo del renderer a Node.

### 3. Renderer React

Responsabilidades:
- navegacion y UI de negocio;
- estado de autenticacion, tenant y licencia;
- consumo de la API mediante `src/renderer/utils/api.ts`;
- uso del bridge Electron solo cuando existe.

Estructura actual:
- `src/renderer/pages/*` se usa como capa de routing y wrappers ligeros;
- `src/renderer/features/*` contiene containers, hooks, adapters y componentes puros para pantallas grandes;
- `src/renderer/components/*` mantiene piezas compartidas entre features;
- `Settings`, `Sales`, `Cash`, `ClientDetail`, `Appointments` y `Sql` siguen ese patron.

Rutas activas:
- `/`
- `/login`
- `/clients`
- `/clients/:id`
- `/appointments`
- `/services`
- `/products`
- `/sales`
- `/cash`
- `/ranking`
- `/settings`
- `/reports` solo admin
- `/accounts` solo admin
- `/sql` solo admin

Detalles relevantes:
- usa `BrowserRouter` en dev y `HashRouter` en `file://`;
- las rutas pesadas se cargan con `React.lazy`;
- el login soporta bootstrap del primer tenant/admin;
- `Settings` concentra impresora, backups legacy, logs, Google Calendar e importaciones.

### 4. Backend Express

Responsabilidades:
- exponer la API REST central;
- validar requests con Zod;
- autenticar con JWT;
- cargar tenant y licencia del usuario;
- aplicar aislamiento por tenant;
- ejecutar reglas de negocio;
- servir la SPA compilada como fallback cuando aplica.

Estructura actual:
- `src/backend/routes/*` conserva endpoints y middleware;
- `src/backend/controllers/*` actua como adaptador HTTP fino;
- `src/backend/modules/*` concentra logica de negocio por dominio;
- `src/backend/services/*` queda para integraciones o procesos transversales;
- `src/backend/tenant/*` concentra contexto multi-tenant y licencias;
- no se ha introducido un repository generico sobre Prisma.

Rutas montadas en `src/backend/app.ts`:
- `/api/auth`
- `/api/tenants`
- `/api/users`
- `/api/clients`
- `/api/appointments`
- `/api/services`
- `/api/products`
- `/api/sales`
- `/api/cash`
- `/api/notifications`
- `/api/reports`
- `/api/dashboard`
- `/api/reminders`
- `/api/ranking`
- `/api/bonos`
- `/api/calendar`
- `/api/quotes`
- `/api/sql`
- `/health`

## Multi-tenant y licencias

### Contexto tenant

El backend usa `AsyncLocalStorage` en `src/backend/tenant/context.ts` para asociar cada request a:
- `tenantId`;
- `userId`;
- `isPlatformAdmin`;
- `licenseStatus`.

`src/backend/db.ts` instala middleware Prisma para inyectar `tenantId` en creaciones y filtrar consultas de modelos de negocio. Las consultas raw y procesos background deben pasar contexto explicito o incluir `tenantId` manualmente.

### Licencias

`src/backend/tenant/license.ts` evalua:
- `TRIAL`;
- `ACTIVE`;
- `TRIAL_EXPIRED`;
- `BLOCKED`;
- `CANCELLED`.

Reglas actuales:
- al crear un tenant se genera una prueba de 7 dias;
- login y operaciones autenticadas consultan tenant/licencia en servidor;
- un centro bloqueado o expirado no debe depender del reloj local del cliente;
- el frontend puede mostrar el estado, pero no decide permisos.

## Autenticacion y permisos

### Flujo de login

```text
Login UI -> POST /api/auth/login -> JWT con tenantId -> authStore
```

El login admite `tenantSlug` opcional para resolver usuarios con el mismo identificador en distintos centros.

### Flujo de bootstrap

```text
Login UI -> GET /api/auth/bootstrap-status
          -> si required=true
          -> POST /api/auth/bootstrap-admin
          -> Tenant + TenantLicense + usuario ADMIN + JWT
```

Roles observados:
- `ADMIN`
- `MANAGER`
- `EMPLOYEE`

Estado actual de permisos:
- `register`, `users`, `calendar` y `sql` ya tienen guard admin explicito;
- `/api/tenants` combina ruta de licencia para usuario autenticado y administracion de plataforma;
- muchos modulos de negocio siguen siendo `auth only` y necesitan permisos finos.

## Persistencia

### Modelo principal

`prisma/schema.prisma` incluye, entre otros:
- `Tenant`
- `TenantLicense`
- `User`
- `Client`
- `ClientHistory`
- `Service`
- `Appointment`
- `AppointmentService`
- `AppointmentLegend`
- `AgendaBlock`
- `AgendaDayNote`
- `DashboardReminder`
- `Product`
- `StockMovement`
- `Sale`
- `PendingPayment`
- `PendingPaymentCollection`
- `SaleItem`
- `CashRegister`
- `CashCount`
- `CashMovement`
- `AccountBalanceMovement`
- `Notification`
- `Setting`
- `GoogleCalendarConfig`
- `BonoPack`
- `BonoSession`
- `Quote`
- `QuoteItem`

Los datos de negocio llevan `tenantId` obligatorio. Las unicidades que antes eran globales se han movido a unicidades compuestas por tenant cuando aplica.

### Migraciones Prisma

Las migraciones PostgreSQL versionadas viven en `prisma/migrations/*`.
La base actual parte de una migracion baseline multi-tenant.

Las migraciones SQLite anteriores se han movido a `prisma/migrations_sqlite_legacy/*` para referencia y soporte de migracion.

### Compatibility migrations SQLite

`src/backend/db.ts`:
- crea el cliente Prisma;
- reutiliza la instancia global en desarrollo;
- instala scoping multi-tenant;
- ejecuta `src/backend/db/compat/*` solo si `DATABASE_URL` empieza por `file:`.

La compatibilidad SQLite queda como soporte legacy y no debe seguir creciendo salvo decision explicita.

## Modulos de negocio actuales

Los modulos reales que la documentacion debe reflejar son:
- autenticacion y bootstrap inicial;
- tenants, licencias y usuarios internos;
- clientes, historial y assets;
- agenda, citas, bloques, notas y leyendas;
- servicios y productos;
- stock y movimientos;
- ventas;
- cobros pendientes;
- caja y arqueos;
- bonos, packs, sesiones y saldo a cuenta;
- dashboard y recordatorios;
- ranking y reportes;
- presupuestos;
- Google Calendar;
- importacion SQL legacy asistida.

Hotspots ya extraidos a modulos especificos:
- `appointments`;
- `bonos`;
- `sales`;
- `cash`;
- `clients`.

## Flujos de escritorio relevantes

### Arranque empaquetado

1. Electron arranca.
2. Lee configuracion y `.env` compatible desde carpeta del `.exe`, `resources/` o `userData`.
3. Lanza el backend empaquetado o apunta a la API configurada segun el canal.
4. Espera a `/health`.
5. Carga la SPA.

La preparacion de SQLite empaquetada esta desactivada por defecto.

### Backups legacy

- manuales y automaticos desde Electron;
- snapshot de seguridad antes de restore;
- soporte de backup completo con assets y backup antiguo `.db`.

Estos flujos no sustituyen backups SaaS de PostgreSQL y Storage.

### Assets de cliente

- En legacy, Electron expone un protocolo seguro para previsualizacion.
- En SaaS, las fotos y documentos deben moverse a Storage/S3 con rutas por tenant.

### Impresion

- modo Windows con impresora instalada;
- modo ESC/POS por red;
- generacion de PDF desde ventana oculta.

## Integraciones opcionales

### Google Calendar

- OAuth iniciado desde `Settings`;
- callback publico en `/api/calendar/callback`;
- estado OAuth con `tenantId`;
- sincronizacion de citas y bloqueos de agenda;
- sync manual completa desde `Settings`;
- disconnect limpia el estado local, no garantiza borrar eventos remotos ya existentes.

### WhatsApp

Existen servicios y variables `WHATSAPP_*` para recordatorios, pero no es el eje de la topologia principal.

## Testing

El proyecto tiene suites en:
- `tests/backend/*`
- `tests/main/*`
- `tests/renderer/unit/*`

Para cambios SaaS/multi-tenant, las pruebas clave son:
- scoping por tenant;
- login ambiguo por centro;
- trial activo, expirado, bloqueado y reactivado;
- consultas raw y procesos background con `tenantId`;
- pantallas principales en movil/tablet.

## Regla de mantenimiento

Si cambia un flujo real, el cambio debe mantenerse coherente en estas capas:
1. validador Zod;
2. ruta/controller o servicio backend;
3. scoping de tenant/licencia cuando aplique;
4. frontend o preload afectado;
5. documentacion raiz;
6. test relevante.
