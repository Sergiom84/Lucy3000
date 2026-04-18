# Roadmap Lucy3000

Estado actualizado: 2026-04-16

## Objetivo actual

Cerrar el lanzamiento de Lucy3000 como software de escritorio instalable por `.exe`, con backend embebido, SQLite local y documentación coherente con el producto real.

La prioridad ya no es diseñar variantes remotas; la prioridad es reducir riesgo operativo en el canal que realmente se distribuye.

## Estado del release

Puerta de calidad verificada en esta pasada:

- `npm run test` pasa.
- `npm run build` pasa.
- `npm audit --omit=dev` pasa sin vulnerabilidades abiertas.

Resultado: el proyecto queda en estado de release candidate técnico para escritorio local. Falta validación manual completa del instalador y de los flujos de negocio en un entorno limpio.

## Cerrado en esta pasada

- Estabilización de tests sensibles al tiempo en citas y bonos.
- Eliminación del admin precargado en la base empaquetada.
- Flujo de bootstrap del primer admin por UI y por API:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/bootstrap-admin`
- Sustitución de `xlsx` por `exceljs`.
- Contrato oficial de importación reducido a `.xlsx`.
- Actualización de dependencias críticas con fixes disponibles:
  - `axios`
  - `react-router-dom`
  - `express`
  - `multer`
  - `jsonwebtoken`
- Limpieza de dependencias muertas no usadas en producción.
- Validación Zod añadida a `clients`, `services`, `notifications`, `reports` y `quotes`.
- Validación explícita de uploads: presencia de fichero, extensión, MIME y tamaño.
- Carga diferida del renderer en rutas pesadas y separación de chunks relevantes.
- Corrección de la configuración PostCSS para evitar advertencias de formato.
- Consolidación de la documentación raíz y eliminación de duplicados.

## Pendiente de alta prioridad

- Validación manual del instalador en entorno limpio:
  - instalación;
  - primer arranque;
  - bootstrap del admin;
  - login;
  - cliente;
  - servicio;
  - cita;
  - venta;
  - importación `.xlsx`;
  - backup y restore local;
  - impresión de ticket si el hardware aplica.
- Endurecer permisos por rol en rutas sensibles más allá de la autenticación básica.
- Ampliar cobertura de integración y E2E con base de datos de prueba real.
- Revisar si las compatibility migrations de `src/backend/db.ts` ya deben convertirse en migraciones Prisma definitivas.

## Pendiente de prioridad media

- Exportación real en reportes; hoy sigue siendo parcial o placeholder según módulo.
- Más cobertura de tests sobre flujos completos de `appointments`, `notifications`, `reports` y `calendar`.
- Mejorar observabilidad y consistencia de errores en runtime de escritorio.
- Hacer más explícita la configuración funcional en `Settings` para negocio, impuestos y usuarios.
- Sustituir el auto-backup semanal basado en `setInterval` por una programación más declarativa si se mantiene como funcionalidad crítica.

## Pendiente de prioridad baja

- Seguir reduciendo peso de chunks cargados bajo demanda.
- Mejoras UX finas en filtros, accesibilidad y confirmaciones.
- Revisar integraciones opcionales solo después de cerrar la base operativa local.

## Decisiones vigentes

- El producto distribuido no lleva credenciales conocidas.
- El primer admin se crea siempre por bootstrap.
- La importación masiva soportada es solo `.xlsx`.
- El stack oficial actual sigue siendo Electron + React + Express + Prisma + SQLite.
- No hay canal remoto oficial de release en esta versión.

## Riesgos conocidos

- SQLite es adecuada para la distribución local actual, pero obliga a ser rigurosos con migraciones y compatibilidad histórica.
- La deuda de compatibilidad SQLite en runtime existe porque protege instalaciones previas; no debe crecer sin control.
- El instalador pasa en build, pero sigue pendiente una validación manual completa de instalación limpia y operación real.
