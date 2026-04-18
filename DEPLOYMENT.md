# Deployment y Distribución Local

Estado actualizado: 2026-04-16

## Alcance

Este documento cubre el canal oficial de entrega de Lucy3000:

- build local del producto;
- empaquetado del instalador;
- distribución del `.exe`;
- comportamiento del runtime local una vez instalado.

No existe despliegue remoto como canal oficial de esta versión.

## Pipeline de build

El build principal es:

```bash
npm run build
```

Ese comando ejecuta:

1. `npm run build:prepare-db`
2. `tsc`
3. `vite build`
4. `npm run build:backend`
5. `electron-builder`

## Qué produce el build

Salida principal:

- instalador Windows en `release/`;
- backend compilado en `dist/backend`;
- SPA compilada en `dist/`.

La preparación de base de datos:

- deja la base empaquetada lista para usarse como semilla técnica;
- no crea un usuario admin por defecto;
- mantiene solo datos de soporte necesarios para arrancar.

## Comportamiento del runtime instalado

En el primer arranque del `.exe`:

1. Electron busca la base SQLite del usuario.
2. Si no existe, copia la base semilla empaquetada.
3. Si no existe un `JWT_SECRET`, genera uno local.
4. Arranca el backend empaquetado.
5. Espera a `/health`.
6. Abre la interfaz React.

Cuando la base está vacía, la pantalla de login entra en modo bootstrap y permite crear el primer `ADMIN`.

## Variables de entorno en el empaquetado

El runtime puede leer `.env` desde ubicaciones de ejecución relevantes. En escritorio interesa sobre todo:

- `.env` junto al ejecutable;
- `.env` en recursos de la app;
- `.env` en el directorio de trabajo cuando aplique.

En entornos no productivos, `.env.development` puede sobreescribir `.env`.

Variables mínimas útiles:

```env
DATABASE_URL="file:./prisma/lucy3000.db"
JWT_SECRET="cambia-este-valor"
PORT=3001
NODE_ENV=production
```

En un build empaquetado normal, la app puede generar el `JWT_SECRET` si no lo encuentra.

## Checklist previo a distribución

### Verificación técnica

- `npm run test`
- `npm run build`
- revisar que no se empaquetan secretos reales
- revisar que no se incluyen dumps o artefactos accidentales

### Verificación funcional mínima

- instalación limpia;
- arranque limpio;
- bootstrap del primer admin;
- login;
- alta de cliente;
- alta de servicio;
- creación de cita;
- venta;
- importación `.xlsx`;
- backup manual;
- restore manual;
- impresión de ticket si el hardware objetivo existe.

## Entrega del instalador

Canal esperado:

- entregar el `.exe` generado en `release/`;
- acompañarlo solo de la documentación operativa necesaria;
- no entregar bases de datos con usuarios reales;
- no entregar `.env` con secretos reales embebidos.

## Troubleshooting

### El instalador compila pero la app no abre

- revisar logs del proceso principal;
- confirmar que el backend empaquetado responde a `/health`;
- revisar permisos de escritura en el directorio de datos del usuario.

### La app abre pero no deja iniciar sesión

- comprobar si la base está vacía y el login debería mostrar bootstrap;
- revisar `JWT_SECRET`;
- revisar que la base local no esté corrupta.

### Fallos de base de datos

- confirmar que `DATABASE_URL` resuelve a un fichero SQLite escribible;
- revisar migraciones;
- usar backup/restore antes de intervenir manualmente.

### Problemas de impresión

- revisar configuración de impresora en `Settings`;
- validar que el equipo objetivo tenga acceso real a la impresora;
- si se usa impresora de red, revisar host y puerto.

## Fuera de alcance

Este documento no cubre:

- despliegues remotos como canal oficial;
- topologías multiusuario remotas;
- migraciones del producto a otra base de datos.
