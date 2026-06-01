# Deployment y Distribucion

Estado actualizado: 2026-05-31

## Alcance

Este documento cubre el canal objetivo actual:
- despliegue central de API y PostgreSQL;
- uso web/PWA;
- empaquetado Electron como wrapper opcional para escritorio;
- control de licencia/trial en servidor.

El instalador mejora la experiencia de escritorio, pero no protege secretos ni sustituye permisos de backend.

## Infraestructura objetivo

Componentes minimos:
- API Express en un proveedor estable;
- PostgreSQL/Supabase compartido por tenants, gestionado o administrado;
- Storage/S3 para fotos, documentos y assets de clienta;
- backups de base y Storage;
- variables de entorno por entorno;
- dominio HTTPS;
- logs y monitorizacion basica.

Supabase Pro es una opcion razonable cuando haya clientes reales. Supabase Free debe quedarse para demo o piloto. Alternativas validas son Neon, Render/Railway/Fly con Postgres gestionado, o VPS si se acepta mas operacion manual.

Decision vigente: no se creara un proyecto Supabase por cliente. El aislamiento
entre negocios vive en `tenantId`, en la API central y, como siguiente defensa,
RLS/policies en Supabase.

## Pipeline de build

El comando principal sigue siendo:

```bash
npm run build
```

Ese pipeline ejecuta:
1. `npm run build:prepare-db`
2. `tsc`
3. `vite build`
4. `npm run build:backend`
5. `electron-builder`

`build:prepare-db` ya no crea una SQLite empaquetada por defecto. Solo se activa el flujo legacy si se establece `LUCY3000_PREPARE_SQLITE=1`.

## Que produce

Salida principal:
- instalador en `release/`;
- frontend compilado en `dist/`;
- backend compilado en `dist/backend/`.

El bundle no debe incluir:
- secretos reales;
- bases de datos productivas;
- tokens de Google, Supabase, Storage o pagos;
- datos de clientes.

## Variables de entorno

Variables criticas:

```env
DATABASE_URL="postgresql://usuario:password@host:5432/lucy3000"
JWT_SECRET="valor-largo-y-secreto"
PORT=3001
NODE_ENV=production
```

Variables habituales:

```env
VITE_API_URL="https://api.tu-dominio.com"
GOOGLE_CALENDAR_CLIENT_ID="..."
GOOGLE_CALENDAR_CLIENT_SECRET="..."
GOOGLE_CALENDAR_REDIRECT_URI="https://api.tu-dominio.com/api/calendar/callback"
```

El cliente nunca debe llevar secretos. `VITE_*` es publico por definicion.
La `DATABASE_URL` productiva compartida vive solo en la API central; no debe
guardarse en Electron, ASAR, instalador ni `userData\.env` del cliente final.

## Comportamiento del wrapper Electron

En el primer arranque del `.exe`:
1. Electron abre la ventana.
2. Carga la SPA empaquetada o una URL configurada, segun canal.
3. El renderer autentica contra la API central.
4. La API valida usuario, tenant y licencia.
5. La operativa se bloquea o permite desde servidor.

El reloj local y los flags del instalador no deciden el trial.

Advertencia: el modo compartido de Electron debe configurarse como API remota,
sin guardar `DATABASE_URL` en el equipo del cliente. El modo local queda para
desarrollo, soporte controlado o legado.

## Canal Web/PWA (recomendado para clientes)

Para distribuir sin entregar un `.exe` copiable, el canal principal es la SPA
servida por HTTPS e instalable como PWA:

- el cliente abre un link (la URL del front) e inicia sesion;
- "instalar" = boton del navegador *Anadir a pantalla de inicio*; no hay binario;
- la proteccion anti-copia no depende del binario sino de la licencia en servidor.

Piezas ya incluidas en el repo:
- `public/manifest.webmanifest` e iconos en `public/icons/`;
- `public/sw.js`: service worker que sirve el shell offline y los assets
  versionados, pero **nunca** cachea llamadas a la API;
- registro del SW en `src/renderer/main.tsx`, activo solo en HTTP(S) y produccion
  (en el wrapper Electron `file:` no se registra).

Requisitos del hosting del front (Vercel, Netlify, Cloudflare Pages, etc.):
- **SPA fallback**: todas las rutas deben servir `index.html` (router del cliente);
- servir `/sw.js` y `/manifest.webmanifest` desde la raiz con su content-type;
- `VITE_API_URL` apuntando a la API central.

Supabase no sirve SPA estatica; usar un host de estaticos para el front y un
proveedor aparte (Render/Railway/Fly/VPS) para la API.

### Desplegar en Render (canal elegido)

Todo va a Render: la API como Web Service Node y el front como Static Site. El
repo incluye `render.yaml` (Blueprint) que define ambos.

Pasos:
1. En el dashboard de Render, crear/elegir el **workspace** (la API de Render no
   crea workspaces; es solo dashboard) y conectar el repo `Sergiom84/Lucy3000`.
2. New > Blueprint > seleccionar el repo. Render lee `render.yaml` y crea
   `lucy3000-api` y `lucy3000-web`.
3. Rellenar los secretos (`sync:false`):
   - `lucy3000-api`: `DATABASE_URL` (Session Pooler de Supabase), `BOOTSTRAP_TOKEN`.
     `JWT_SECRET` se autogenera.
   - `lucy3000-web`: `VITE_API_URL` = URL publica de `lucy3000-api` (visible tras
     el primer deploy de la API).
4. La API corre `prisma migrate deploy` en `preDeployCommand`; el front se sirve
   con SPA fallback (`routes` rewrite a `/index.html`).
5. Crear el primer tenant/admin con `POST https://<api>/api/auth/bootstrap-admin`
   y el `bootstrapToken` correcto. Ese admin no debe ser `platformAdmin`.
6. Definir o sembrar por canal seguro el usuario `platformAdmin` que gestionara
   `/api/tenants` y licencias.

Region `frankfurt` (cercana a Espana). Plan `starter` para la API (always-on);
el static site no tiene coste de computo.

### Desplegar el front en Cloudflare Pages (alternativa)

El repo ya trae lo necesario: `wrangler.toml` (`pages_build_output_dir = dist`),
`public/_redirects` con el fallback SPA y los scripts `build:web` / `deploy:web`.

**Dependencia previa**: el front necesita una API a la que hablar. Antes de que
la PWA sirva de algo hay que tener desplegada la API central (Express + Prisma)
contra el PostgreSQL (Supabase) y conocer su URL publica para `VITE_API_URL`.

Ruta A — conectar Git (recomendada, sin secretos locales, auto-deploy en push):
1. Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
2. Repo `Sergiom84/Lucy3000`, rama `master` (o la que publiques).
3. Build command: `npm run build:web`. Output directory: `dist`.
4. Variables de entorno (build): `VITE_API_URL=https://api.tu-dominio.com`.
5. Deploy. Cada push a la rama elegida redeploya solo.

Ruta B — wrangler CLI (deploy manual desde tu maquina):
```bash
npx wrangler login            # autentica tu cuenta Cloudflare (una vez)
set VITE_API_URL=https://api.tu-dominio.com   # PowerShell: $env:VITE_API_URL=...
npm run build:web             # genera dist/
npm run deploy:web            # wrangler pages deploy (crea el proyecto si no existe)
```

Nota: la API central NO va en Pages (Pages es solo estaticos). El gate de
licencia, el bootstrap y los datos viven en la API + PostgreSQL.

## Licencias y trial

Regla de producto:
- al crear/bootstrap un tenant, la licencia nace en estado
  `PENDING`: el trial **no** arranca en la instalacion;
- el admin del tenant puede arrancar su prueba con
  `POST /api/tenants/current/start-trial` dentro de la gracia `PENDING`;
- el usuario `platformAdmin` o la consola interna pueden activar, bloquear,
  cancelar o ajustar licencias cuando aplique;
- cada login y operacion sensible se comprueba en servidor; un tenant no activo
  recibe `402` y el cliente muestra la pantalla de estado (`LicenseBlocked`);
- el panel permite ademas ampliar prueba, bloquear y cancelar.

Estados de licencia: `PENDING`, `TRIAL`, `ACTIVE`, `TRIAL_EXPIRED`, `BLOCKED`,
`CANCELLED`. La logica vive en `src/backend/tenant/license.ts`. El admin del
tenant solo puede arrancar su propia prueba desde `PENDING`; los cambios
comerciales de licencia quedan para `platformAdmin` o consola interna.

La primera version usa activacion manual. Stripe, PayPal o transferencia pueden
entrar despues.

## Proteccion del bootstrap y plataforma

`POST /api/auth/bootstrap-admin` crea el primer tenant y un `ADMIN` de ese
tenant cuando no hay usuarios. Ese usuario debe quedar con
`isPlatformAdmin=false`. En la API central publica, define `BOOTSTRAP_TOKEN` en
el entorno: sin el token correcto en la peticion, el endpoint responde `403`.
Esto evita que alguien cree el primer centro por accidente en la ventana entre
desplegar la API y hacer el alta inicial. Sin la variable (instalaciones
locales/dev) el comportamiento no cambia.

La cuenta `platformAdmin` debe gestionarse por un flujo separado y controlado.
No debe entregarse al cliente final desde el bootstrap normal.

## ID cliente

Lucy3000 usa un codigo publico de tenant llamado en UI `ID cliente` y en codigo
`tenantCode`.

- El login pide `ID cliente`, usuario y contrasena.
- El dashboard/consola de Sergio muestra ese ID automaticamente.
- El ID es un selector, no una clave secreta.
- El JWT y las relaciones seguiran usando `tenantId`.

## Distribucion Windows

Recomendaciones:
- generar instalador con `electron-builder`;
- firmar codigo antes de enviar a clientes reales;
- valorar NSIS/MSIX/MSI como experiencia de instalacion;
- asumir que ASAR/MSI/EXE no impiden ingenieria inversa fuerte;
- mantener toda logica critica y secretos en servidor.

## Checklist previo a distribuir

### Tecnico

- `npm run build:backend`
- `npm run test:unit`
- `npm run test:smoke`
- typecheck o `npm run build` cuando cambie renderer/Electron
- revisar que no se empaquetan secretos reales
- revisar que no se empaqueta ni persiste `DATABASE_URL` compartida en Electron
- revisar que no se empaqueta una base productiva
- validar variables de entorno de produccion

### SaaS

- migraciones aplicadas en PostgreSQL;
- backup y restore probados;
- Storage configurado con rutas por tenant;
- HTTPS y CORS correctos;
- logs disponibles;
- plan de rollback documentado.

### Funcional minimo

- bootstrap del primer tenant/admin;
- login;
- alta de cliente;
- alta de servicio;
- creacion de cita;
- venta;
- caja;
- Google Calendar si el cliente lo usa;
- trial activo, expirado, bloqueado y reactivado;
- usuario de un tenant no ve datos de otro;
- movil/tablet en flujos principales.

## Troubleshooting

### La app no arranca

- revisar logs del proceso principal si es Electron;
- comprobar que la API central responde a `/health`;
- confirmar `VITE_API_URL` o URL de API configurada;
- comprobar CORS y HTTPS.

### Login no cuadra

- confirmar `tenantSlug` o, cuando este implementado, `ID cliente` si el mismo
  email/usuario existe en varios centros;
- revisar estado de licencia del tenant;
- confirmar que el usuario pertenece al tenant correcto.

### Google Calendar no conecta

- comprobar el `.env` efectivo del backend;
- validar `GOOGLE_CALENDAR_REDIRECT_URI`;
- confirmar que el callback conserva `tenantId`;
- revisar la pantalla `Settings`, que informa variables ausentes.

### Restore o importacion legacy problematica

- usar el asistente SQL solo para datos soportados;
- hacer copia/snapshot antes de importar;
- validar que la importacion corre en el tenant correcto;
- recordar que restore de `.db` y restore SaaS no son equivalentes.

## Fuera de alcance

Este documento no cubre:
- modo offline con resolucion de conflictos;
- multi-base/proyecto Supabase por cliente;
- secretos dentro del instalador;
- produccion comercial sobre planes Free sin backup/SLA adecuados.
