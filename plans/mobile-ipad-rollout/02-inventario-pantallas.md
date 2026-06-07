# Inventario de pantallas

Estado: 2026-06-06

## Criterio general

- Movil: consulta, acciones rapidas y operativa puntual.
- iPad: operativa diaria completa dentro del centro.
- Escritorio/Electron: debe conservar la experiencia actual.

## Pantallas criticas

| Pantalla | Prioridad | Movil | iPad | Riesgo principal |
| --- | --- | --- | --- | --- |
| Login/PublicAccess | Alta | Debe ser limpio, sin zoom, con `ID cliente` visible | Igual que escritorio | Errores al identificar tenant |
| Dashboard | Alta | Resumen compacto y acciones principales | Panel operativo completo | Cards o metricas demasiado anchas |
| Agenda | Alta | Vista dia/lista y accion rapida | Vista calendario usable | Calendario denso dificil de tocar |
| Clientas | Alta | Busqueda primero, lista compacta | Tabla/lista con filtros | Precarga pesada o filtros incomodos |
| Ficha clienta | Alta | Secciones plegables | Detalle amplio con historial | Formularios largos y acciones dispersas |
| Ventas | Alta | Flujo guiado y carrito claro | Flujo casi completo | Tablas/catalogos demasiado densos |
| Caja | Alta | Estado, cierre y movimientos esenciales | Operativa completa | Acciones criticas poco visibles |

## Pantallas medias

| Pantalla | Prioridad | Movil | iPad | Riesgo principal |
| --- | --- | --- | --- | --- |
| Servicios | Media | Lista y edicion simple | Gestion completa | Formularios en modal estrecho |
| Productos | Media | Consulta, stock y edicion simple | Gestion completa | Tablas con muchas columnas |
| Ranking | Media | Lectura resumida | Analitica basica | Graficas no responsive |
| Informes | Media | Lectura/exportacion limitada | Informes principales | Filtros y graficas densas |
| Cuentas | Media | Soporte/admin puntual | Gestion admin | Acciones peligrosas en pantallas estrechas |

## Pantallas de soporte

| Pantalla | Prioridad | Movil | iPad | Riesgo principal |
| --- | --- | --- | --- | --- |
| Settings | Baja | Solo ajustes web seguros | Ajustes principales | Mezclar opciones Electron con navegador |
| SQL | Baja | No recomendado | Solo admin puntual | Herramienta admin sensible |
| Importadores | Baja | No recomendado | Soporte puntual | File pickers y tablas de preview |

## Reglas por tipo de interfaz

- Tablas: en movil deben poder cambiar a lista o tarjetas compactas. En iPad
  horizontal pueden seguir siendo tablas si no fuerzan scroll caotico.
- Modales: en movil deben ocupar casi toda la pantalla y permitir scroll interno
  claro.
- Formularios: labels visibles, inputs de altura tactil y teclado adecuado
  (`tel`, `email`, `number`, fechas).
- Acciones destructivas: confirmacion clara y botones separados.
- Busqueda: debe estar siempre accesible en clientas, productos, ventas y agenda.
- Calendario: en movil priorizar dia/lista; en iPad permitir semana/dia si es
  usable.

