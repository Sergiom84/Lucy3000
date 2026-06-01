# Roadmap Lucy3000

Estado actualizado: 2026-05-31

## Objetivo actual

Convertir Lucy3000 en producto SaaS web/PWA multi-equipo, manteniendo Electron como wrapper opcional para escritorio:
- API central Express;
- PostgreSQL compartido con aislamiento por `tenantId`;
- una unica base Supabase/PostgreSQL compartida para varios centros, no un proyecto por cliente;
- licencia/trial controlado en servidor;
- Google Calendar sincronizado por tenant;
- migracion controlada desde el historico SQLite local.

## Estado observado en codigo

La base tecnica ya refleja el giro multi-tenant:
- `prisma/schema.prisma` usa PostgreSQL y contiene `Tenant` y `TenantLicense`;
- los modelos de negocio tienen `tenantId` y relaciones con `Tenant`;
- las migraciones PostgreSQL viven en `prisma/migrations/*`;
- las migraciones SQLite anteriores quedan archivadas en `prisma/migrations_sqlite_legacy/*`;
- `src/backend/tenant/context.ts` encapsula el contexto por request;
- `src/backend/tenant/license.ts` evalua trial, licencia activa, bloqueo, cancelacion y expiracion;
- `src/backend/db.ts` aplica scoping tenant-aware en Prisma y solo ejecuta compatibilidad SQLite si la URL es `file:`;
- `authMiddleware` carga usuario, tenant y licencia, y bloquea operativa cuando corresponde;
- el bootstrap crea centro, licencia `PENDING` y primer `ADMIN`; la prueba arranca despues con `start-trial`;
- `/api/tenants/*` expone estado de licencia y endpoints internos, pero la pantalla `Centros` ya no vive en el renderer del cliente;
- `tools/lucy-admin-dashboard/` contiene la consola local de Sergio para listar clientes/Supabase y activar, bloquear o cancelar licencias;
- Google Calendar guarda estado OAuth con `tenantId`;
- el login del renderer acepta centro opcional y muestra el bloqueo de licencia;
- `build:prepare-db` ya no prepara SQLite empaquetada por defecto.
- El ultimo cambio de seguridad separo admin de tenant y admin de plataforma:
  el bootstrap crea `ADMIN` con `isPlatformAdmin=false`.
- Se redujo carga pesada en ventas/caja: usan catalogo ligero de clientas bajo demanda
  en vez de precargar miles de clientas.

La refactorizacion incremental previa sigue vigente:
- `src/backend/controllers/*` se usa como capa HTTP fina;
- la logica de negocio extraida vive en `src/backend/modules/*`, especialmente en `appointments`, `bonos`, `sales`, `cash` y `clients`;
- `src/main/main.ts` actua como composition root;
- el runtime de Electron esta separado en `backendRuntime.ts`, `runtimeData.ts`, `backupRuntime.ts`, `clientAssetsRuntime.ts`, `printing.ts` y `src/main/ipc/*`;
- `src/shared/electron.ts` centraliza contratos IPC compartidos;
- `src/renderer/pages/*` se conserva como capa de routing y las pantallas grandes viven en `src/renderer/features/*`.

## Prioridad alta

- Antes de dar de alta el segundo cliente real en la base compartida:
  desplegar la API central, aplicar migraciones, probar `ID cliente` en login y
  comprobar Electron en modo API remota.
- Definir un flujo seguro para crear/gestionar `platformAdmin` sin que el primer
  admin de cliente sea admin de plataforma.
- Probar migracion/importacion real desde instalaciones SQLite antiguas hacia PostgreSQL tenant-aware.
- Endurecer permisos por rol en rutas de negocio, no solo autenticacion.
- Evolucionar la consola local interna si hace falta ampliacion de trial, auditoria o facturacion.
- Preparar despliegue central: API, base PostgreSQL, Storage/S3, logs, backups, monitorizacion y dominios.
- Mover fotos/assets de clienta a Storage/S3 con claves por tenant.
- Revisar todas las consultas pesadas para paginacion, indices por `tenantId`, fechas y busquedas frecuentes.
- Validar aislamiento: un usuario de un centro nunca ve ni modifica datos de otro.
- Ejecutar prueba de carga funcional con 7 centros equivalentes: clientas, productos, servicios, ventas, caja, bonos, citas y fotos simuladas.
- Validar UX movil/tablet en agenda, venta, caja, ficha de clienta y busqueda.

## Prioridad media

- Aniadir RLS en PostgreSQL/Supabase como segunda capa defensiva cuando el scoping de API este estabilizado.
- Definir exportacion de datos por tenant para soporte, baja o portabilidad.
- Integrar proveedor de pago o flujo semiautomatico de facturacion.
- Revisar el instalador Electron: firma, actualizaciones, URL de API remota y eliminacion de supuestos locales.
- Separar backups SaaS de flujos legacy en la UI para evitar confusion operativa.
- Ampliar cobertura de tests sobre contratos entre backend, renderer y Electron.
- Seguir simplificando codigo legacy de importacion `.xlsx` y SQL sin remezclar logica en controllers, `main.ts` o paginas wrapper.

## Prioridad baja

- Seguir refinando UX, accesibilidad y carga diferida.
- Revisar si hace falta modo offline real; de momento el supuesto es producto principalmente online.
- Reducir complejidad de helpers legacy que aun viven en backend.
- Explorar empaquetados multiplataforma solo despues de estabilizar el canal SaaS.

## Decisiones vigentes

- El runtime oficial de datos es remoto y multi-tenant.
- La base operativa oficial es PostgreSQL.
- Electron es wrapper opcional, no fuente de verdad ni barrera de proteccion.
- El primer admin de tenant se crea por bootstrap junto con el primer tenant y su licencia, pero no debe ser `platformAdmin`.
- La licencia/trial se comprueba en servidor; no depende del reloj local ni de flags del instalador.
- El `ID cliente` sera un alias publico para login/dashboard; el aislamiento real
  sigue siendo `tenantId` en servidor.
- Las importaciones de operacion normal usan `.xlsx`.
- La restauracion SQL legacy es una herramienta admin separada y de alcance parcial.
- Google Calendar es opcional y debe permanecer aislado por tenant.
- Supabase es una opcion recomendada para empezar con Postgres/Storage/infra, pero Free solo debe usarse como demo o piloto.
- `main.ts`, `preload.ts`, `routes/*` y `pages/*` se mantienen como fachadas estables; la refactorizacion ocurre detras de esas capas.
- No se debe reintroducir logica pesada en `src/main/main.ts`, `src/backend/controllers/*` ni `src/renderer/pages/*`.

## Riesgos conocidos

- La politica de permisos todavia es desigual entre modulos.
- El scoping tenant-aware de Prisma reduce riesgo, pero las consultas raw y procesos background requieren revision continua.
- Mientras Electron pueda guardar `DATABASE_URL` compartida, no es seguro entregarlo a un segundo cliente contra la misma base.
- Falta RLS/policies en Supabase como defensa en profundidad para base compartida.
- La migracion de datos desde SQLite real todavia necesita una pasada operativa con copias de clientes.
- El asistente SQL omite ventas, caja y referencias legacy de fotos; no sirve como reconstruccion total.
- El auto-backup local es deuda legacy y no sustituye backups SaaS de PostgreSQL/Storage.
- Supabase Free puede servir como piloto, no como produccion comercial estable.
- Existen copias documentales antiguas en carpetas auxiliares que no deben tratarse como fuente de verdad.

## Definicion practica de cerrado

Una pasada de estabilizacion deberia considerarse cerrada solo si:
1. `README.md`, `ROADMAP.md`, `BACKUP_RESTORE.md`, `ARCHITECTURE.md`, `AGENTS.md` y `CLAUDE.md` estan alineados entre si.
2. `npm run build:backend`, `npm run test:unit` y `npm run test:smoke` siguen funcionando para el alcance tocado.
3. Si cambia frontend o Electron, se valida al menos TypeScript completo o `npm run build` cuando el alcance lo exige.
4. La validacion manual minima de negocio no detecta regresiones visibles.
5. Si cambia un contrato o flujo, el cambio queda reflejado en codigo, tests y documentacion.
