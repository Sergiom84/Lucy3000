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

## Licencias y trial

Regla de producto:
- al crear un tenant, `trialEndsAt = now + 7 dias`;
- cada login y operacion sensible se comprueba en servidor;
- si expira, se bloquea la operativa y se conservan rutas de login, licencia, soporte y administracion;
- un administrador interno puede activar, cancelar, ampliar prueba o bloquear.

La primera version puede usar activacion manual. Stripe, PayPal o transferencia pueden entrar despues.

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
