# Roadmap Lucy3000

Estado actualizado: 2026-04-21

## Objetivo actual

Cerrar Lucy3000 como producto de escritorio estable para operación local real:
- backend embebido;
- SQLite por instalación;
- backups seguros;
- upgrade razonable desde bases SQLite antiguas;
- documentación alineada con el producto que realmente existe.

## Estado observado en código

La base actual ya incluye:
- bootstrap del primer `ADMIN` desde login;
- runtime local con base SQLite en carpeta de usuario;
- backups completos desde Electron;
- restore completo con snapshot de seguridad previo;
- reseteo de instalación local desde la propia app;
- impresora de tickets por Windows o ESC/POS por red;
- assets locales de cliente;
- Google Calendar opcional con OAuth y sincronización manual completa;
- gestión de usuarios internos y perfiles;
- agenda enriquecida con leyendas, bloques, notas diarias y múltiples servicios;
- ventas con cobros pendientes;
- caja con arqueos;
- bonos, saldo a cuenta y catálogo de bonos;
- asistente SQL admin para restauración legacy parcial.

Las migraciones recientes reflejan que el producto ha seguido creciendo en:
- agenda;
- usuarios;
- cobros pendientes;
- arqueos de caja;
- relación entre bonos y catálogo.

## Prioridad alta

- Validar upgrade real de instalaciones SQLite antiguas con las compatibility migrations actuales de `src/backend/db.ts`.
- Reducir riesgo de permisos:
  muchas rutas de negocio siguen protegidas solo por autenticación, no por rol fino.
- Consolidar las compatibility migrations SQLite en migraciones Prisma normales siempre que ya no hagan falta guards runtime.
- Validar de punta a punta el asistente SQL con dumps reales de `01dat.sql`.
- Revisar flujo empaquetado de `.env` y soporte operativo para Google Calendar en instalaciones reales.

## Prioridad media

- Ampliar cobertura de tests sobre flujos completos entre backend, `src/main` y utilidades críticas de renderer.
- Revisar si `MANAGER` necesita permisos diferenciados en backend en lugar del binomio actual `auth` frente a `admin`.
- Endurecer observabilidad y mensajes de error en restore, importaciones y runtime empaquetado.
- Simplificar o separar mejor el código de importación legacy `.xlsx` y SQL.
- Hacer más explícitas las reglas funcionales de caja, cobros pendientes y saldo a cuenta en documentación operativa.

## Prioridad baja

- Seguir refinando UX, accesibilidad y carga diferida.
- Reducir complejidad de helpers legacy que aún viven en backend.
- Revisar objetivos multiplataforma solo después de cerrar Windows como canal principal.

## Decisiones vigentes

- El runtime oficial es local y embebido, no remoto.
- La base operativa oficial es SQLite.
- El primer admin se crea por bootstrap; no hay credenciales demo distribuidas.
- Las importaciones de operación normal usan `.xlsx`.
- La restauración SQL legacy es una herramienta admin separada y de alcance parcial.
- Google Calendar es opcional y administrado desde `Settings`.
- Supabase queda como histórico o soporte puntual, no como dependencia del producto diario.

## Riesgos conocidos

- `src/backend/db.ts` acumula demasiada lógica de compatibilidad y puede acabar divergente de Prisma.
- La política de permisos todavía es desigual entre módulos.
- El asistente SQL omite ventas, caja y referencias legacy de fotos; no sirve como reconstrucción total.
- El auto-backup guarda `cronExpression`, pero la ejecución real sigue siendo un `setInterval` semanal.
- Existen copias documentales antiguas en carpetas auxiliares que no deben tratarse como fuente de verdad.

## Definición práctica de “cerrado”

Una pasada de estabilización debería considerarse cerrada solo si:
1. `README.md`, `ROADMAP.md`, `BACKUP_RESTORE.md`, `ARCHITECTURE.md`, `AGENTS.md` y `CLAUDE.md` están alineados entre sí.
2. `npm run build:backend` o `npm run build` siguen funcionando para el alcance tocado.
3. El cambio no abre más deuda en compatibility migrations salvo motivo explícito.
4. Si cambia un contrato o flujo, el cambio queda reflejado en código, tests y documentación.
