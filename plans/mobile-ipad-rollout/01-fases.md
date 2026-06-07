# Fases para movil e iPad

Estado: 2026-06-06

## Fase 0 - Preparacion sin impacto

Objetivo: dejar claro el camino antes de tocar codigo funcional.

- Mantener este plan dentro de `plans/mobile-ipad-rollout/`.
- No modificar scripts npm, Electron, Prisma, rutas ni variables de entorno.
- Confirmar que el canal oficial para movil/iPad sera web/PWA.
- Confirmar que no habra acceso directo a Supabase desde el frontend.
- Definir dispositivos base:
  - movil estrecho: 360 x 740;
  - iPhone moderno: 390 x 844;
  - movil grande: 430 x 932;
  - iPad vertical: 768 x 1024;
  - iPad horizontal: 1024 x 768;
  - escritorio control: 1366 x 768 y 1920 x 1080.

## Fase 1 - Auditoria responsive

Objetivo: saber donde se rompe la experiencia antes de redisenar.

- Levantar la app web contra API local o staging.
- Capturar cada pantalla en los tamanos base.
- Marcar problemas por severidad:
  - bloqueo: impide operar;
  - alto: operable pero lento o confuso;
  - medio: mejora visual o ergonomica;
  - bajo: detalle no critico.
- Revisar navegacion, formularios, tablas, modales, agenda, ventas, caja y ficha
  de clienta.

Entregable: checklist completo en `04-matriz-qa.md` con notas reales.

## Fase 2 - Shell responsive

Objetivo: adaptar la estructura comun sin tocar logica de negocio.

- Revisar `Layout` y navegacion principal.
- En movil, convertir navegacion lateral/ancha en patron compacto:
  - drawer;
  - barra inferior;
  - menu superior de acciones.
- En iPad, mantener una experiencia de trabajo amplia:
  - navegacion visible si cabe;
  - areas de detalle lado a lado cuando aporten valor;
  - formularios con dos columnas solo cuando no fuercen zoom.
- Asegurar targets tactiles de al menos 44 px.
- Respetar safe areas de iOS cuando la PWA vaya instalada.

Esta fase no debe cambiar rutas ni payloads de API.

Estado 2026-06-06: primera pasada aplicada. Queda pendiente QA visual con datos
reales y posible refinamiento por pantalla.

## Fase 3 - Pantallas operativas prioritarias

Objetivo: hacer usable el trabajo diario en tablet y movil.

Orden recomendado:

1. Login y seleccion de centro por `ID cliente`.
2. Dashboard.
3. Agenda.
4. Busqueda/listado de clientas.
5. Ficha de clienta.
6. Ventas.
7. Caja.
8. Servicios y productos.
9. Ranking, informes y cuentas.
10. Settings, SQL e importadores solo como soporte/admin.

En cada pantalla:

- mantener contrato API;
- extraer estado pesado a hooks si aun vive mezclado con JSX;
- sustituir tablas imposibles en movil por listas compactas o vistas de detalle;
- mantener tablas densas en iPad horizontal y escritorio;
- validar carga con datos reales o simulados grandes.

Estado 2026-06-06: aplicada una primera adaptacion en Login/PublicAccess
indirectamente por shell, Dashboard, Agenda, Clientas, Ventas y Caja. Servicios,
productos, ranking, informes, cuentas, settings e importadores quedan para una
segunda pasada.

## Fase 4 - PWA y despliegue controlado

Objetivo: activar el uso real sin tocar Electron.

- Usar el front web desplegado con `VITE_API_URL` apuntando a la API central.
- Mantener `sw.js` sin cachear llamadas a la API.
- Probar instalacion en iOS/iPadOS y Android.
- Revisar iconos, nombre, pantalla standalone y recuperacion tras cerrar app.
- Mantener logout, expiracion de token y bloqueo de licencia funcionando igual.

## Fase 5 - Seguridad, rendimiento y tenant

Objetivo: que el canal movil no abra atajos peligrosos.

- Confirmar que todos los datos sensibles pasan por `src/renderer/utils/api.ts`.
- Validar que el JWT incluye el tenant correcto.
- Probar que un usuario de un tenant no accede a otro tenant.
- Vigilar consultas pesadas en agenda, clientas, ventas y caja.
- Priorizar paginacion, busquedas bajo demanda y respuestas ligeras.
- No introducir modo offline de datos de negocio en esta fase.

## Fase 6 - Piloto

Objetivo: probar con uso real sin comprometer el proyecto actual.

- Activar el canal a un centro piloto.
- Mantener escritorio/Electron como fallback operativo.
- Registrar incidencias por pantalla y dispositivo.
- Corregir solo problemas del canal responsive/PWA.
- Despues del piloto, decidir si se amplia a mas centros.
