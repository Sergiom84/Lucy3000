# Lucy3000

Aplicación de escritorio para gestión de estética con backend local embebido.

## Estado actual
- Topología oficial: Electron + React/Vite + Express + Prisma + SQLite local.
- Canal oficial de entrega: instalador de escritorio generado con `npm run build`.
- Supabase queda como soporte histórico o flujos puntuales de recuperación, no como dependencia operativa del runtime actual.
- El primer administrador ya no viene precargado: se crea por bootstrap desde login.

## Qué hace hoy la app
- Dashboard operativo.
- Gestión de clientes con historial, saldo, ranking y assets locales.
- Agenda de citas con:
  - citas normales o de clienta invitada;
  - leyendas de color;
  - múltiples servicios por cita;
  - bloqueos de agenda;
  - notas diarias.
- Servicios y productos con categorías e importación `.xlsx`.
- Ventas, cobros pendientes, caja y arqueos.
- Bonos, packs, sesiones y saldo a cuenta.
- Usuarios y cuentas internas.
- Reportes y presupuestos.
- Backups locales y restore desde escritorio.
- Integración opcional con Google Calendar.
- Asistente admin para analizar e importar un `01dat.sql` legacy.

## Autenticación y roles
- Login normal: `POST /api/auth/login`
- Bootstrap inicial:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Roles observados en código:
  - `ADMIN`
  - `MANAGER`
  - `EMPLOYEE`
- Páginas admin-only en renderer:
  - `Reports`
  - `Accounts`
  - `Sql`

## Desarrollo local

### Requisitos
- Node.js 18 o superior.
- npm.
- Windows es el entorno de referencia para scripts operativos y build del instalador.

### Arranque
1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` a partir de `.env.example`.

3. Ajusta como mínimo:

```env
DATABASE_URL="file:./prisma/lucy3000.db"
JWT_SECRET="cambia-este-valor"
PORT=3001
NODE_ENV=development
```

4. Genera Prisma y aplica migraciones:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Arranca la app:

```bash
npm run dev
```

6. Si no existe ningún usuario, crea el primer `ADMIN` desde login.

Nota:
la URL SQLite anterior se resuelve relativa a `prisma/schema.prisma`, así que el fichero termina en `prisma/prisma/lucy3000.db`.

## Scripts npm

```bash
npm run dev
npm run dev:backend
npm run dev:electron
npm run build
npm run build:backend
npm run build:prepare-db
npm run test
npm run test:unit
npm run test:smoke
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Scripts operativos fuera de npm
Se ejecutan directamente desde `scripts/`:
- `scripts/analyze-backup.ps1`
- `scripts/restore-backup.ps1`
- `scripts/rebuild-supabase-db.ps1`
- `scripts/pull-schema-no-docker.ps1`
- `scripts/dev-backend.ps1`
- `scripts/kill-dev-ports.ps1`

## Variables de entorno

### Críticas
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `NODE_ENV`

### Opcionales
- `VITE_API_URL`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `WHATSAPP_*`
- `SUPABASE_*` solo para soporte histórico o recuperación

## Arquitectura resumida
- `src/main/main.ts`: proceso principal de Electron, backend empaquetado, backups, logs, impresión y carpeta de datos local.
- `src/preload.ts`: bridge seguro con `contextBridge`.
- `src/renderer/*`: SPA React con lazy loading de rutas pesadas.
- `src/backend/*`: API Express con validación Zod.
- `prisma/schema.prisma`: modelo de datos real.
- `prisma/migrations/*`: migraciones versionadas.

## Importaciones y restauración
- Flujo operativo diario:
  - importadores `.xlsx` desde `Settings`;
  - backups locales desde `Settings`.
- Flujo legado aparte:
  - asistente SQL admin para `01dat.sql`;
  - scripts PowerShell históricos de PostgreSQL/Supabase.

El asistente SQL no cubre ventas, caja ni referencias legacy de fotos.

## Build y distribución

```bash
npm run build
```

Ese pipeline:
1. prepara la base empaquetada;
2. compila renderer y backend;
3. genera el instalador en `release/`.

En producción de escritorio, Electron:
- crea o reutiliza la base SQLite en la carpeta local del usuario;
- genera `jwt-secret.txt` si no existe;
- arranca el backend empaquetado;
- espera a `/health`;
- carga la SPA empaquetada.

## Documentación relacionada
- [ROADMAP.md](ROADMAP.md): prioridades y deuda activa.
- [ARCHITECTURE.md](ARCHITECTURE.md): topología y módulos.
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md): backups locales, restore y flujos legacy.
- [DEPLOYMENT.md](DEPLOYMENT.md): build y distribución del instalador.
- [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md): integración opcional con Google Calendar.
- [AGENTS.md](AGENTS.md): instrucciones operativas para agentes y mantenimiento técnico.

## Regla práctica
Si un markdown y el código discrepan, usa el código como referencia final y corrige la documentación antes de cerrar el cambio.
