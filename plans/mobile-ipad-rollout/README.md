# Plan mobile/iPad rollout

Estado: 2026-06-06

## Objetivo

Preparar Lucy3000 para uso en movil e iPad sin afectar el canal actual de uso
local/equipo. Este directorio es deliberadamente documental: no cambia builds,
rutas, Electron, Prisma, variables de entorno ni comportamiento de la app.

## Principio de aislamiento

- El canal actual local/Electron sigue funcionando como hasta ahora.
- El canal movil/iPad se apoya en la web/PWA contra la API central.
- Ningun dispositivo movil recibe `DATABASE_URL`, claves Supabase secretas ni
  acceso directo a datos sensibles fuera de la API.
- La adaptacion se hace por fases sobre UI responsive, performance y QA, no con
  una segunda app separada salvo decision futura explicita.

## Archivos de este plan

- `01-fases.md`: orden recomendado para llevarlo a produccion.
- `02-inventario-pantallas.md`: pantallas a revisar y criterio movil/iPad.
- `03-guardrails-no-regresion.md`: reglas para no romper local, Electron ni SaaS.
- `04-matriz-qa.md`: pruebas manuales y tecnicas antes de activar el canal.

## Estado tecnico ya favorable

- Ya existe canal web con `build:web`.
- Ya existe `public/manifest.webmanifest`.
- Ya existe `public/sw.js` minimo para PWA.
- El service worker se registra solo en produccion y sobre HTTP(S), no en
  `file://` ni en desarrollo.
- `VITE_API_URL` permite apuntar el frontend web/PWA a la API central.

## Resultado esperado

Al terminar las fases, Sergio puede ofrecer:

- iPad como herramienta operativa principal dentro del centro.
- Movil como consulta rapida y acciones frecuentes.
- Escritorio/Electron intacto para equipos actuales.
- Una unica API central con aislamiento por `tenantId`.

## Aplicado en la primera pasada

Fecha: 2026-06-06

- Shell responsive en `src/renderer/components/Layout.tsx`:
  - sidebar de escritorio preservada en `lg+`;
  - drawer lateral en movil/tablet estrecha;
  - navegacion inferior movil para Dashboard, Clientes, Citas, Ventas y Caja.
- `Navbar` adaptado a movil con boton de menu, titulo truncado y dropdown de
  notificaciones que no desborda.
- `Modal` adaptado a movil como panel de pantalla completa con safe area.
- Estilos globales tactiles:
  - botones e inputs con altura minima tactil;
  - cards con padding menor en movil y padding original en pantallas grandes;
  - tablas con padding responsive;
  - ajustes responsive para `react-big-calendar`.
- Pantallas ajustadas:
  - Dashboard: tipografia y bloques principales mas compactos en movil;
  - Clientes: vista de tarjetas en movil, tabla preservada en `lg+`;
  - Agenda: header responsive y calendario desplazable en movil;
  - Ventas: pestañas y filtros del TPV adaptados a ancho estrecho;
  - Caja: acciones superiores con wrapping.

Validacion ejecutada:

- `npm run build:web`
