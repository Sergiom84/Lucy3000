# Arquitectura de Lucy3000

Estado actualizado: 2026-06-16

## Topologia oficial

Lucy3000 se esta convirtiendo en una aplicacion SaaS web/PWA multi-tenant. Electron queda como wrapper opcional para escritorio y capacidades locales, pero la fuente de verdad vive en la API central.

Decision vigente de distribucion: una API central con PostgreSQL/Supabase
compartido por tenants. No se usara un proyecto Supabase por cliente. Ningun
cliente web/PWA/Electron debe recibir la `DATABASE_URL` compartida.

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
- iniciar backend local solo en desarrollo/legacy o apuntar a API remota segun canal;
- exponer bridge seguro al renderer;
- gestionar logs, impresion y utilidades locales;
- conservar flujos legacy de backup/restore mientras se migra a SaaS.

Riesgo actual: el runtime de Electron conserva configuracion para guardar
`DATABASE_URL` en `userData\.env`. Ese modo no puede usarse con una base
compartida real porque el cliente podria saltarse la API. Antes de incorporar un
segundo cliente al Supabase compartido hay que dejar Electron en modo API remota
o usar la PWA.

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
- `/dashboard` dashboard comercial de plataforma protegido por PIN
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
- `/api/trial-requests`
- `/api/platform-dashboard`
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
- al crear/bootstrap un tenant la licencia nace `PENDING`;
- el trial arranca despues con `POST /api/tenants/current/start-trial` o por accion interna equivalente;
- login y operaciones autenticadas consultan tenant/licencia en servidor;
- un centro bloqueado o expirado no debe depender del reloj local del cliente;
- el frontend puede mostrar el estado, pero no decide permisos.

## Autenticacion y permisos

### Flujo de login

```text
Login UI -> POST /api/auth/login -> JWT con tenantId -> authStore
```

El login admite `tenantSlug` opcional para resolver usuarios con el mismo identificador en distintos centros.

El login acepta un `ID cliente` numerico visible (`tenantCode`) ademas del
selector compatible `tenantSlug`. Ese codigo solo resuelve el tenant durante
login; no es secreto ni autorizacion. La autorizacion vive en el usuario
autenticado, el JWT con `tenantId`, el middleware tenant-aware y las validaciones
de servidor.

### Flujo de bootstrap

```text
Login UI -> GET /api/auth/bootstrap-status
          -> si required=true
          -> POST /api/auth/bootstrap-admin
          -> Tenant + TenantLicense + usuario ADMIN + JWT
```

El bootstrap crea un administrador del tenant (`role=ADMIN`) con
`isPlatformAdmin=false`. La gestion de plataforma debe usar un flujo separado y
controlado para usuarios `platformAdmin`; no debe convertir al primer cliente en
dueno de la plataforma.

Roles observados:
- `ADMIN`
- `MANAGER`
- `EMPLOYEE`

Estado actual de permisos:
- `register`, `users`, `calendar` y `sql` ya tienen guard admin explicito;
- `/api/tenants` combina ruta de licencia para usuario autenticado y endpoints internos de plataforma;
- la gestion comercial de centros ya no se muestra en el renderer del cliente; vive en `tools/lucy-admin-dashboard/` como consola local de Sergio;
- muchos modulos de negocio siguen siendo `auth only` y necesitan permisos finos.
- Supabase RLS/policies queda pendiente como defensa en profundidad. La primera
  frontera sigue siendo la API central; no exponer `DATABASE_URL` compartida en
  el cliente es obligatorio.

## Persistencia

### Modelo principal

`prisma/schema.prisma` incluye, entre otros:
- `Tenant`
- `TenantLicense`
- `User`
- `PasswordResetToken`
- `TrialRequest`
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

### Solicitudes de prueba y dashboard comercial

El portal publico usa `POST /api/trial-requests` para registrar solicitudes de
prueba. El modelo `TrialRequest` no pertenece a un tenant concreto todavia:
representa leads previos al alta.

Campos relevantes:
- `name`, `email`, `phone`;
- `normalizedEmail` unico;
- `normalizedPhone` unico cuando existe;
- `status`, por defecto `PENDING_REPLY`;
- ids y timestamps de entrega de Resend para correo interno y confirmacion al solicitante.

El dashboard comercial usa `POST /api/platform-dashboard` con
`PLATFORM_DASHBOARD_PIN`. Devuelve una lista unificada de:
- solicitudes web (`trial_requests`);
- tenants reales y su licencia;
- estados comerciales como `Correo recibido`, `Pendiente de mi contestacion`,
  `Alta creada`, `En prueba` o `Ya ha pagado`.

Este dashboard es una herramienta ligera de control comercial, no una barrera de
seguridad fuerte. Para evolucionarlo conviene sustituir el PIN por
autenticacion `platformAdmin`.

### Correo transaccional

Resend se usa desde backend para:
- confirmacion de solicitud de prueba;
- aviso interno de nueva solicitud;
- recuperacion de contrasena.

Variables de entorno:
- `RESEND_API_KEY`;
- `TRIAL_REQUEST_TO`;
- `TRIAL_REQUEST_FROM`;
- `PASSWORD_RESET_FROM`;
- `PASSWORD_RESET_BASE_URL`.

El remitente actual en produccion es `Lucy3000 <Info@sohl.dev>`. El dominio
`sohl.dev` esta verificado en Resend mediante DNS autoritativo en Cloudflare.

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

Excepcion vigente: el modo local SQLite conserva compatibilidad para probar
`tenantCode`, `password_reset_tokens` y `trial_requests` en desarrollo. Estos
guards viven en `src/backend/db/compat/tenant.ts` y no cambian el modelo
productivo PostgreSQL.

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
- portal publico, solicitudes de prueba y dashboard comercial de plataforma;
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
