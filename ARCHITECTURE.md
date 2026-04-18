# Arquitectura de Lucy3000

Estado actualizado: 2026-04-16

## Topología oficial

Lucy3000 se distribuye como aplicación de escritorio.

Topología real del producto:

```text
Electron Main
    |
    +-- arranca backend local empaquetado
    +-- expone bridge seguro al renderer
    +-- gestiona backups, impresión y assets de cliente
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
SQLite local
```

Aunque el backend puede ejecutarse standalone en desarrollo, el canal oficial de release es el `.exe` local, no un despliegue remoto.

## Capas principales

### 1. Electron

Responsabilidad:

- crear la ventana principal;
- arrancar el backend empaquetado en producción local;
- gestionar backups;
- gestionar assets locales de cliente;
- gestionar impresión de tickets;
- exponer APIs seguras al renderer.

Archivos clave:

- `src/main/main.ts`
- `src/preload.ts`
- `src/main/clientAssets.ts`
- `src/main/escpos.ts`

### 2. Renderer React

Responsabilidad:

- UI de negocio;
- navegación por rutas;
- estado de autenticación y tema;
- consumo del backend a través de `src/renderer/utils/api.ts`;
- integración con bridge de Electron cuando corre como escritorio.

Páginas principales:

- `Login`
- `Dashboard`
- `Clients`
- `ClientDetail`
- `Appointments`
- `Services`
- `Products`
- `Sales`
- `Cash`
- `Reports`
- `ClientRanking`
- `Settings`

Detalles actuales:

- Las rutas pesadas se cargan con `React.lazy`.
- El login incluye bootstrap del primer admin cuando no existen usuarios.
- Los importadores soportan solo `.xlsx`.

### 3. Backend Express

Responsabilidad:

- exponer la API REST local;
- autenticar y autorizar;
- validar requests con Zod;
- ejecutar reglas de negocio;
- servir la SPA compilada cuando la app se ejecuta empaquetada.

Rutas montadas actualmente:

- `/api/auth`
- `/api/clients`
- `/api/appointments`
- `/api/services`
- `/api/products`
- `/api/sales`
- `/api/cash`
- `/api/notifications`
- `/api/reports`
- `/api/dashboard`
- `/api/ranking`
- `/api/bonos`
- `/api/calendar`
- `/api/quotes`
- `/health`

Archivos clave:

- `src/backend/app.ts`
- `src/backend/server.ts`
- `src/backend/routes/*`
- `src/backend/controllers/*`
- `src/backend/validators/*`

## Módulos de negocio reales

Los módulos activos que debe reflejar cualquier documentación o cambio futuro son:

- autenticación y usuarios;
- clientes e historial;
- assets de cliente: fotos, consentimientos y documentos;
- citas y calendario;
- servicios;
- productos, stock y movimientos;
- ventas y tickets;
- caja y movimientos privados sin ticket;
- bonos, packs y sesiones;
- saldo a cuenta;
- presupuestos;
- ranking de clientes;
- reportes;
- notificaciones;
- backups locales;
- integración opcional con Google Calendar.

## Flujo de autenticación

### Login normal

```text
Login UI -> Axios -> POST /api/auth/login -> Prisma user lookup -> JWT -> authStore
```

### Bootstrap inicial

```text
Login UI -> GET /api/auth/bootstrap-status
          -> si required=true
          -> formulario inicial
          -> POST /api/auth/bootstrap-admin
          -> JWT + usuario ADMIN
```

El producto ya no crea un admin por seed de distribución.

## Flujo de arranque en producción local

En el build empaquetado:

1. Electron arranca.
2. `src/main/main.ts` localiza o crea la base SQLite del usuario.
3. Si no existe `JWT_SECRET`, genera uno en el directorio de datos del usuario.
4. Arranca el backend empaquetado con `ELECTRON_RUN_AS_NODE=1`.
5. Espera a que `/health` responda.
6. Carga la SPA en la ventana principal.

Esto evita depender de un servidor externo para el uso diario.

## Persistencia

### Modelo

La persistencia está en `prisma/schema.prisma` y cubre, entre otros:

- `User`
- `Client`
- `Appointment`
- `Service`
- `Product`
- `StockMovement`
- `Sale`
- `SaleItem`
- `CashRegister`
- `CashMovement`
- `AccountBalanceMovement`
- `Notification`
- `Setting`
- `GoogleCalendarConfig`
- `BonoPack`
- `BonoSession`
- `Quote`
- `QuoteItem`

### Migraciones

Regla general:

- cambios de modelo en `prisma/schema.prisma`;
- migración versionada en `prisma/migrations/*`;
- `prisma generate` y `prisma migrate` según entorno.

### Compatibility migrations en runtime

`src/backend/db.ts` mantiene guards de compatibilidad para SQLite histórica en runtime:

- `account_balance_movements.paymentMethod`;
- soporte de `guestName` y `guestPhone` en `appointments`.

Estas guards existen para continuidad de instalaciones previas. No deben convertirse en mecanismo general para cambios de esquema nuevos; lo correcto es seguir usando migraciones Prisma versionadas.

## Seguridad y límites

- JWT para autenticación.
- `contextIsolation` activado en Electron.
- `contextBridge` en `preload`.
- Validación Zod en rutas críticas y ya extendida a `clients`, `services`, `notifications`, `reports` y `quotes`.
- Uploads validados en backend con `multer` y middleware específico.
- Sin credenciales demo distribuidas.

Límites vigentes:

- el runtime oficial es local por instalación;
- la base es SQLite;
- la impresión y backups dependen del entorno de escritorio.

## Integraciones de escritorio

El bridge expuesto en `src/preload.ts` cubre:

- versión y paths de la app;
- apertura de carpeta de logs;
- creación, restauración y listado de backups;
- configuración e impresión de tickets;
- gestión de assets locales de cliente.

Esto separa lo que pertenece al entorno de escritorio de lo que pertenece a la API.

## Build y empaquetado

`npm run build` ejecuta:

1. `build:prepare-db`
2. `tsc`
3. `vite build`
4. `build:backend`
5. `electron-builder`

Resultado:

- instaladores en `release/`;
- backend compilado en `dist/backend`;
- SPA compilada en `dist/`.

## Regla de mantenimiento

Si cambia un contrato de API o un flujo de negocio, el cambio debe mantenerse coherente en cuatro capas:

1. validador Zod;
2. ruta o controlador backend;
3. consumo en frontend;
4. test o smoke relevante.
