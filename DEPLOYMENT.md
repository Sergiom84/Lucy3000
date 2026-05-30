# Deployment y Distribucion

Estado actualizado: 2026-05-26

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
- PostgreSQL gestionado o administrado;
- Storage/S3 para fotos, documentos y assets de clienta;
- backups de base y Storage;
- variables de entorno por entorno;
- dominio HTTPS;
- logs y monitorizacion basica.

Supabase Pro es una opcion razonable cuando haya clientes reales. Supabase Free debe quedarse para demo o piloto. Alternativas validas son Neon, Render/Railway/Fly con Postgres gestionado, o VPS si se acepta mas operacion manual.

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

## Comportamiento del wrapper Electron

En el primer arranque del `.exe`:
1. Electron abre la ventana.
2. Carga la SPA empaquetada o la URL configurada, segun canal.
3. El renderer autentica contra la API central.
4. La API valida usuario, tenant y licencia.
5. La operativa se bloquea o permite desde servidor.

El reloj local y los flags del instalador no deciden el trial.

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

## Licencias y trial

Regla de producto:
- al crear un tenant (`POST /api/tenants`), la licencia nace en estado
  `PENDING`: el trial **no** arranca en la instalacion;
- el platform admin da el OK desde el panel `/tenants` cuando termina la
  migracion/config: "Iniciar prueba 7 dias" pone `TRIAL` y recalcula
  `trialEndsAt = now + 7 dias` (el reloj empieza ahi), o "Activar (pago)" pone
  `ACTIVE`;
- cada login y operacion sensible se comprueba en servidor; un tenant no activo
  recibe `402` y el cliente muestra la pantalla de estado (`LicenseBlocked`);
- el panel permite ademas ampliar prueba, bloquear y cancelar.

Estados de licencia: `PENDING`, `TRIAL`, `ACTIVE`, `TRIAL_EXPIRED`, `BLOCKED`,
`CANCELLED`. La logica vive en `src/backend/tenant/license.ts` y solo el
`platformAdmin` puede cambiarla (`PUT /api/tenants/:id/license`).

La primera version usa activacion manual. Stripe, PayPal o transferencia pueden
entrar despues.

## Proteccion del bootstrap

`POST /api/auth/bootstrap-admin` crea el primer platform admin cuando no hay
usuarios. En la API central publica, define `BOOTSTRAP_TOKEN` en el entorno: sin
el token correcto en la peticion, el endpoint responde `403`. Esto evita que
alguien se registre como dueno de la plataforma en la ventana entre desplegar la
API y crear tu cuenta. Sin la variable (instalaciones locales/dev) el
comportamiento no cambia.

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

- confirmar `tenantSlug` si el mismo email/usuario existe en varios centros;
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
- multi-base por cliente;
- secretos dentro del instalador;
- produccion comercial sobre planes Free sin backup/SLA adecuados.
