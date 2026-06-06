# Matriz QA movil/iPad

Estado: 2026-06-06

## Dispositivos y navegadores base

| Perfil | Tamano | Navegador | Objetivo |
| --- | --- | --- | --- |
| Movil pequeno | 360 x 740 | Chrome Android | Usabilidad minima |
| iPhone | 390 x 844 | Safari iOS | Instalacion PWA y tactil |
| Movil grande | 430 x 932 | Chrome/Safari | Operativa puntual |
| iPad vertical | 768 x 1024 | Safari iPadOS | Operativa completa |
| iPad horizontal | 1024 x 768 | Safari iPadOS | Agenda/ventas/caja |
| Escritorio control | 1366 x 768 | Chromium/Electron | No regresion |
| Escritorio amplio | 1920 x 1080 | Chromium/Electron | No regresion visual |

## Pruebas transversales

| Prueba | Movil | iPad | Escritorio | Estado |
| --- | --- | --- | --- | --- |
| Login con `ID cliente` + usuario + contrasena | Pendiente | Pendiente | Pendiente | Pendiente |
| Bloqueo por licencia vencida | Pendiente | Pendiente | Pendiente | Pendiente |
| Inicio de prueba por admin tenant | Pendiente | Pendiente | Pendiente | Pendiente |
| Logout y expiracion de sesion | Pendiente | Pendiente | Pendiente | Pendiente |
| Cambio de orientacion | Pendiente | Pendiente | No aplica | Pendiente |
| PWA instalada abre en standalone | Pendiente | Pendiente | No aplica | Pendiente |
| Recarga profunda de rutas | Pendiente | Pendiente | Pendiente | Pendiente |
| No hay llamadas directas a Supabase desde frontend | Pendiente | Pendiente | Pendiente | Pendiente |
| No se cachean llamadas de API en service worker | Pendiente | Pendiente | Pendiente | Pendiente |

## Validacion tecnica ejecutada

| Fecha | Comando | Resultado |
| --- | --- | --- |
| 2026-06-06 | `npm run build:web` | OK |
| 2026-06-06 | Preview local `http://127.0.0.1:4173/` en 390 x 844 | OK, sin overflow horizontal en acceso publico |
| 2026-06-06 | Preview local `http://127.0.0.1:4173/` en 768 x 1024 | OK, sin overflow horizontal en acceso publico |

## QA visual pendiente tras primera pasada

- Revisar login con un usuario real o staging.
- Revisar shell autenticado con API real o staging. En preview aislado sin API
  Lucy, `/login` queda esperando `bootstrap-status`, asi que no se fuerza una
  sesion falsa desde QA automatica.
- Revisar mobile drawer y bottom nav en 360 x 740, 390 x 844 y 430 x 932.
- Revisar iPad vertical y horizontal en Dashboard, Clientes, Agenda, Ventas y Caja.
- Confirmar que el calendario se desplaza horizontalmente en movil sin romper el
  scroll vertical de la pagina.
- Confirmar que modales largos, especialmente cita, cliente, venta y arqueo, no
  quedan cortados.

## Pruebas por pantalla

| Pantalla | Movil | iPad vertical | iPad horizontal | Escritorio control |
| --- | --- | --- | --- | --- |
| PublicAccess/Login | Pendiente | Pendiente | Pendiente | Pendiente |
| Dashboard | Pendiente | Pendiente | Pendiente | Pendiente |
| Agenda | Pendiente | Pendiente | Pendiente | Pendiente |
| Clientas | Pendiente | Pendiente | Pendiente | Pendiente |
| Ficha clienta | Pendiente | Pendiente | Pendiente | Pendiente |
| Ventas | Pendiente | Pendiente | Pendiente | Pendiente |
| Caja | Pendiente | Pendiente | Pendiente | Pendiente |
| Servicios | Pendiente | Pendiente | Pendiente | Pendiente |
| Productos | Pendiente | Pendiente | Pendiente | Pendiente |
| Ranking | Pendiente | Pendiente | Pendiente | Pendiente |
| Informes | Pendiente | Pendiente | Pendiente | Pendiente |
| Cuentas | Pendiente | Pendiente | Pendiente | Pendiente |
| Settings | Pendiente | Pendiente | Pendiente | Pendiente |
| SQL | No recomendado | Pendiente admin | Pendiente admin | Pendiente admin |

## Criterios de aprobado

- No aparece scroll horizontal global salvo en tablas expresamente contenidas.
- Botones y acciones tactiles son faciles de pulsar.
- Los modales no quedan cortados por el viewport.
- Los formularios no fuerzan zoom en iOS.
- La navegacion permite volver a la tarea anterior.
- Agenda, ventas y caja se pueden completar en iPad sin teclado fisico.
- El escritorio conserva rutas, layout funcional y rendimiento previo.
- `npm run build:web` funciona cuando se toque frontend web.
- `npm run build` se valida si se toca Electron, empaquetado o behavior comun.
