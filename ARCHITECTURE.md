# Arquitectura de Lucy3000

Estado actualizado: 2026-04-21

## Topología oficial

Lucy3000 se distribuye como aplicación de escritorio con backend local embebido.

```text
Electron Main
    |
    +-- arranca backend empaquetado
    +-- expone bridge seguro al renderer
    +-- gestiona backups, logs, impresión y assets
    |
    v
React Renderer
    |
    v
Express API local
    |
    v
Prisma
    |
    v
SQLite local por instalación
```

En desarrollo puede ejecutarse por piezas, pero el producto real se usa como escritorio local.

## Capas principales

### 1. Electron

Responsabilidades:
- crear la ventana principal;
- iniciar el backend empaquetado;
- localizar o crear la base SQLite en `userData`;
- generar `jwt-secret.txt` si falta;
- exponer logs, backups, impresión y carpeta de datos;
- servir el protocolo seguro de assets de cliente.

Archivos clave:
- `src/main/main.ts`
- `src/main/backup.ts`
- `src/main/clientAssets.ts`
- `src/main/logging.ts`
- `src/main/escpos.ts`
- `src/preload.ts`

El runtime de escritorio también permite:
- abrir carpeta de datos;
- abrir logs;
- restaurar backups;
- resetear la instalación local y volver al bootstrap inicial.

### 2. Preload

El bridge expuesto en `src/preload.ts` cubre:
- versión y paths de la app;
- logs;
- backups;
- impresión PDF y tickets;
- assets locales de cliente;
- relanzado y cierre controlado de la app.

Esto mantiene `contextIsolation` y evita acceso directo del renderer a Node.

### 3. Renderer React

Responsabilidades:
- navegación y UI de negocio;
- estado de autenticación y tema;
- consumo de la API solo mediante `src/renderer/utils/api.ts`;
- uso del bridge Electron cuando existe.

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
- el login soporta bootstrap del primer admin;
- `Settings` concentra impresora, backups, logs, Google Calendar e importaciones.

### 4. Backend Express

Responsabilidades:
- exponer la API REST local;
- validar requests con Zod;
- autenticar con JWT;
- ejecutar reglas de negocio;
- servir la SPA compilada como fallback.

Rutas montadas en `src/backend/app.ts`:
- `/api/auth`
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

## Módulos de negocio actuales

Los módulos reales que la documentación debe reflejar son:
- autenticación y bootstrap inicial;
- usuarios internos y cuentas;
- clientes, historial y assets locales;
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
- backups y restore local;
- Google Calendar;
- restauración SQL legacy asistida.

## Autenticación y permisos

### Flujo de login

```text
Login UI -> POST /api/auth/login -> JWT -> authStore
```

### Flujo de bootstrap

```text
Login UI -> GET /api/auth/bootstrap-status
          -> si required=true
          -> POST /api/auth/bootstrap-admin
          -> usuario ADMIN + JWT
```

Roles observados:
- `ADMIN`
- `MANAGER`
- `EMPLOYEE`

Estado actual de permisos:
- `register`, `users`, `calendar` y `sql` ya tienen guard admin explícito;
- muchos módulos de negocio siguen siendo `auth only`.

## Persistencia

### Modelo principal

`prisma/schema.prisma` incluye, entre otros:
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

### Migraciones Prisma

Las migraciones versionadas viven en `prisma/migrations/*`.
Las más recientes cubren:
- leyendas de cita;
- bloqueos y notas de agenda;
- múltiples servicios por cita;
- usernames;
- recordatorios de dashboard;
- cobros pendientes;
- arqueos de caja;
- vínculo de packs con catálogo de bonos.

### Compatibility migrations SQLite

`src/backend/db.ts` todavía ejecuta guards runtime para instalaciones antiguas.
Hoy cubren:
- `users.username`;
- `account_balance_movements.paymentMethod`;
- refs legacy en saldo;
- refs legacy y `bonoTemplateId` en bonos;
- soporte de clienta invitada;
- `appointment_services`;
- `appointment_legends`;
- `agenda_blocks`;
- `agenda_day_notes`;
- `dashboard_reminders`;
- `pending_payments`;
- `pending_payment_collections`;
- leyendas por defecto.

Son útiles para continuidad, pero no deben sustituir al flujo normal de Prisma.

## Flujos de escritorio relevantes

### Arranque empaquetado
1. Electron arranca.
2. Busca o crea `lucy3000.db` en `userData`.
3. Genera `jwt-secret.txt` si no existe.
4. Lee `.env` compatible desde carpeta del `.exe`, `resources/` o `userData`.
5. Lanza el backend empaquetado con `ELECTRON_RUN_AS_NODE=1`.
6. Espera a `/health`.
7. Carga la SPA.

### Backups
- manuales y automáticos desde Electron;
- snapshot de seguridad antes de restore;
- soporte de backup completo con assets y backup antiguo `.db`.

### Assets de cliente
- Electron expone un protocolo seguro para previsualización;
- los ficheros viven fuera del bundle, en carpetas locales del usuario.

### Impresión
- modo Windows con impresora instalada;
- modo ESC/POS por red;
- generación de PDF desde ventana oculta.

## Integraciones opcionales

### Google Calendar
- OAuth iniciado desde `Settings`;
- callback público en `/api/calendar/callback`;
- sincronización de citas y bloqueos de agenda;
- sync manual completa desde `Settings`;
- disconnect limpia el estado local, no garantiza borrar eventos remotos ya existentes.

### WhatsApp
Existen servicios y variables `WHATSAPP_*` para recordatorios, pero no es el eje de la topología principal.

## Testing

El proyecto ya no tiene solo tests de backend.
Hay suites en:
- `tests/backend/*`
- `tests/main/*`
- `tests/renderer/unit/*`

## Regla de mantenimiento

Si cambia un flujo real, el cambio debe mantenerse coherente en estas capas:
1. validador Zod;
2. ruta/controller o servicio backend;
3. frontend o preload afectado;
4. documentación raíz;
5. test relevante cuando aplique.
