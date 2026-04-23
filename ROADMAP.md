# Roadmap Lucy3000

Estado actualizado: 2026-04-23

## Objetivo actual

Cerrar la ola de refactorización incremental ya aplicada en código y estabilizar Lucy3000 como producto de escritorio para operación local real:
- backend embebido;
- SQLite por instalación;
- backups seguros;
- upgrade razonable desde bases SQLite antiguas;
- contratos públicos estables;
- documentación raíz alineada con la estructura real del proyecto.

## Estado observado en código

La refactorización incremental de hotspots ya está materializada en el worktree actual:
- `src/backend/controllers/*` se usa como capa HTTP fina;
- la lógica de negocio extraída vive en `src/backend/modules/*`, especialmente en `appointments`, `bonos`, `sales`, `cash` y `clients`;
- `src/main/main.ts` ya actúa como composition root y registro de arranque;
- el runtime de Electron está separado en `backendRuntime.ts`, `runtimeData.ts`, `backupRuntime.ts`, `clientAssetsRuntime.ts`, `printing.ts` y `src/main/ipc/*`;
- `src/shared/electron.ts` centraliza contratos IPC compartidos;
- `src/renderer/pages/*` se conserva como capa de routing y las pantallas grandes viven en `src/renderer/features/*`;
- el wizard SQL está encapsulado bajo `src/renderer/features/sql/*`;
- las compatibility migrations SQLite se han movido a `src/backend/db/compat/*` con un único orquestador.

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

- Ejecutar la validación manual mínima de negocio sobre los flujos críticos definidos para cerrar esta ola.
- Corregir cualquier regresión detectada sin romper rutas HTTP, payloads REST, canales IPC ni esquema Prisma.
- Validar upgrade real de instalaciones SQLite antiguas con el orquestador de `src/backend/db/compat/*`.
- Revisar duplicidad o arrastre residual en hotspots refactorizados y retirarlo solo cuando no cambie comportamiento.
- Reducir riesgo de permisos:
  muchas rutas de negocio siguen protegidas solo por autenticación, no por rol fino.
- Validar de punta a punta el asistente SQL con dumps reales de `01dat.sql` y `01dat.sqlx` cuando el contenido sea SQL plano.
- Revisar flujo empaquetado de `.env` y soporte operativo para Google Calendar en instalaciones reales.
- Cerrar commit o PR de la refactorización con documentación raíz, tests y build alineados.

## Prioridad media

- Consolidar las compatibility migrations SQLite antiguas en migraciones Prisma normales cuando ya no hagan falta guards runtime.
- Ampliar cobertura de tests sobre flujos completos entre backend, `src/main`, `src/renderer/features/*` y utilidades críticas de renderer.
- Revisar si `MANAGER` necesita permisos diferenciados en backend en lugar del binomio actual `auth` frente a `admin`.
- Endurecer observabilidad y mensajes de error en restore, importaciones y runtime empaquetado.
- Seguir simplificando código legacy de importación `.xlsx` y SQL sin remezclar lógica en controllers, `main.ts` o páginas wrapper.
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
- `main.ts`, `preload.ts`, `routes/*` y `pages/*` se mantienen como fachadas estables; la refactorización ocurre detrás de esas capas.
- No se debe reintroducir lógica pesada en `src/main/main.ts`, `src/backend/controllers/*` ni `src/renderer/pages/*`.

## Riesgos conocidos

- La política de permisos todavía es desigual entre módulos.
- `src/backend/db/compat/*` sigue siendo deuda de continuidad y debe consolidarse cuando sea seguro.
- El asistente SQL omite ventas, caja y referencias legacy de fotos; no sirve como reconstrucción total.
- El auto-backup guarda `cronExpression`, pero la ejecución real sigue siendo un `setInterval` semanal.
- Existen copias documentales antiguas en carpetas auxiliares que no deben tratarse como fuente de verdad.

## Definición práctica de “cerrado”

Una pasada de estabilización debería considerarse cerrada solo si:
1. `README.md`, `ROADMAP.md`, `BACKUP_RESTORE.md`, `ARCHITECTURE.md`, `AGENTS.md` y `CLAUDE.md` están alineados entre sí.
2. `npm run build:backend`, `npm run test:unit` y, cuando aplique, `tests/main`, `tests/renderer/unit`, `npm run test:smoke` y `npm run build` siguen funcionando para el alcance tocado.
3. La validación manual mínima de negocio no detecta regresiones visibles.
4. El cambio no abre más deuda en compatibility migrations salvo motivo explícito.
5. Si cambia un contrato o flujo, el cambio queda reflejado en código, tests y documentación.
