# Deployment y Distribución Local

Estado actualizado: 2026-04-21

## Alcance

Este documento cubre el canal oficial de entrega actual:
- build local del producto;
- empaquetado del instalador;
- comportamiento del runtime instalado.

El canal operativo documentado sigue siendo escritorio local, con foco práctico en Windows.

## Pipeline de build

El comando principal es:

```bash
npm run build
```

Ese pipeline ejecuta:
1. `npm run build:prepare-db`
2. `tsc`
3. `vite build`
4. `npm run build:backend`
5. `electron-builder`

## Qué produce

Salida principal:
- instalador en `release/`;
- frontend compilado en `dist/`;
- backend compilado en `dist/backend/`.

`build:prepare-db` deja lista la base empaquetada que se copiará al runtime local cuando haga falta.
Esa base no debe llevar un administrador precargado.

## Comportamiento del runtime instalado

En el primer arranque del `.exe`:
1. Electron resuelve la carpeta de datos local del usuario.
2. Busca `lucy3000.db`.
3. Si no existe, copia la base empaquetada.
4. Si no existe `jwt-secret.txt`, genera uno.
5. Arranca el backend empaquetado.
6. Espera respuesta de `/health`.
7. Carga la SPA empaquetada.

Si el runtime queda sin usuarios:
- login entra en modo bootstrap;
- el primer `ADMIN` se crea desde la propia interfaz.

## Variables de entorno en empaquetado

El runtime empaquetado puede leer `.env` desde:
- la carpeta del ejecutable;
- `resources/`;
- la carpeta de datos local del usuario.

En producción, la ruta más operativa para ajustes por instalación suele ser `userData`.

Variables críticas:

```env
DATABASE_URL="file:./prisma/lucy3000.db"
JWT_SECRET="opcional-en-empaquetado"
PORT=3001
NODE_ENV=production
```

Notas:
- en empaquetado, `JWT_SECRET` puede generarse automáticamente;
- Google Calendar requiere además `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` y `GOOGLE_CALENDAR_REDIRECT_URI`.

## Runtime supportable desde la propia app

La instalación ya permite:
- abrir carpeta de datos;
- abrir carpeta de logs;
- restaurar backups;
- configurar backups;
- restablecer instalación local;
- configurar impresora de tickets;
- gestionar Google Calendar.

Eso reduce la necesidad de intervención manual sobre ficheros internos.

## Checklist previo a distribuir

### Técnico
- `npm run build:backend`
- `npm run build`
- revisar que no se empaquetan secretos reales
- revisar que la base empaquetada no contiene usuarios de demo

### Funcional mínimo
- instalación limpia;
- arranque limpio;
- bootstrap del primer admin;
- login;
- alta de cliente;
- alta de servicio;
- creación de cita;
- venta;
- backup manual;
- restore manual;
- impresión si el hardware objetivo aplica.

## Troubleshooting

### La app no arranca
- revisar logs del proceso principal;
- comprobar que el puerto local del backend no esté ocupado;
- confirmar permisos de escritura sobre la carpeta de datos local.

### La app arranca pero login “no cuadra”
- puede que exista una instalación local anterior con otra base;
- abre la carpeta de datos desde la propia app o desde el menú de ayuda;
- si la instalación debe empezar de cero, usa “Restablecer instalación local”.

### Google Calendar no conecta
- comprobar el `.env` efectivo de esa instalación;
- validar `GOOGLE_CALENDAR_REDIRECT_URI`;
- revisar la pantalla `Settings`, que ya informa variables ausentes.

### Restore problemático
- usar primero el flujo de backup/restore propio de la app;
- evitar reemplazar la base SQLite manualmente salvo soporte controlado;
- recordar que restore de `.db` y restore de carpeta completa no son equivalentes.

## Fuera de alcance

Este documento no cubre:
- despliegues remotos como canal oficial;
- uso multiusuario sobre servidor remoto;
- automatizaciones de infraestructura fuera del instalador.
