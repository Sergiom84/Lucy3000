# Google Calendar Setup

Estado actualizado: 2026-04-16

## Qué integra Lucy3000

La integración sincroniza citas con Google Calendar:

- crea eventos al crear citas;
- actualiza eventos cuando cambia la cita;
- elimina eventos cuando la cita se borra;
- puede enviar invitaciones al cliente si existe email y la opción está activada.

Lucy3000 no usa SMTP para esto. Las invitaciones las envía Google Calendar cuando el cliente se añade como invitado.

## Requisitos

- cuenta de Google con acceso a Calendar;
- usuario `ADMIN` en Lucy3000;
- variables de entorno configuradas;
- backend local accesible en la URL usada como callback.

## Variables de entorno

```env
GOOGLE_CALENDAR_CLIENT_ID="tu-client-id"
GOOGLE_CALENDAR_CLIENT_SECRET="tu-client-secret"
GOOGLE_CALENDAR_REDIRECT_URI="http://localhost:3001/api/calendar/callback"
```

La `REDIRECT_URI` debe coincidir exactamente con la configurada en Google Cloud.

## Configuración en Google Cloud

1. Crea o reutiliza un proyecto.
2. Activa `Google Calendar API`.
3. Configura la pantalla de consentimiento OAuth.
4. Crea un cliente OAuth.
5. Añade la URI de callback exacta.
6. Copia `client_id` y `client_secret`.

## Preparación de la base

Si estás levantando el proyecto desde código fuente:

```bash
npm run prisma:migrate
```

La integración necesita la tabla `google_calendar_config` y los campos de sincronización en `appointments`.

## Activación en Lucy3000

1. Inicia sesión como `ADMIN`.
2. Ve a `Settings`.
3. En la sección `Google Calendar`, pulsa `Conectar Google Calendar`.
4. Completa la autorización.
5. Guarda la configuración:
   - `Sincronizar citas con Google Calendar`
   - `Enviar invitaciones y actualizaciones al cliente`
   - `calendarId` (`primary` es el valor recomendado para empezar)

## Comportamiento funcional

### Crear cita

- si la integración está activa, se crea el evento;
- si hay email y están activadas invitaciones, Google envía la invitación;
- si no hay email, el evento se crea solo en el calendario del negocio.

### Actualizar cita

- se parchea el evento vinculado;
- si el cliente es invitado, Google gestiona la actualización.

### Borrar cita

- se intenta eliminar el evento remoto;
- si existía invitado, Google puede notificar la cancelación.

## Reglas operativas

- La integración es global para la app, no por equipo.
- La impresora de tickets se configura por dispositivo; Calendar no.
- Desactivar la sincronización corta cambios nuevos, pero no borra eventos previos.
- Desconectar la cuenta rompe el vínculo local con eventos ya sincronizados.

## Troubleshooting

### Error generando URL de autorización

Revisa:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`

### La autorización no vuelve correctamente

Revisa:

- callback exacta en Google Cloud;
- backend local levantado;
- popup o navegador no bloqueando la redirección.

### Las citas no se sincronizan

Revisa:

- que la integración esté conectada;
- que `enabled` esté activo;
- que el `calendarId` sea correcto;
- los logs del backend para ver errores de sincronización.

## Recomendación

Empieza con:

- una sola cuenta de Google del negocio;
- `calendarId=primary`;
- invitaciones activadas solo cuando el flujo ya esté verificado con una cuenta real.
