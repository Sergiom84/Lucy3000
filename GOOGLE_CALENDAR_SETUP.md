# Configuración de Google Calendar en Lucy3000

Esta guía configura la integración para que las citas de Lucy3000:

- se registren en tu Google Calendar;
- se actualicen o cancelen también en Google Calendar;
- envíen la invitación o actualización al cliente si la cita tiene email y tienes activada esa opción.

Lucy3000 no usa SMTP ni Nodemailer para este flujo. El correo al cliente lo envía Google Calendar cuando el cliente se añade como invitado del evento.

## Requisitos previos

- Una cuenta de Google con acceso a Google Calendar.
- Un usuario `ADMIN` en Lucy3000 para conectar la integración.
- Variables de entorno configuradas en `.env` o `.env.development`.

## Paso 1: Preparar Google Cloud

1. Entra en [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto o reutiliza uno existente.
3. Activa `Google Calendar API`.
4. Configura la pantalla de consentimiento OAuth.
5. Crea un cliente OAuth de tipo `Aplicación de ordenador`.
6. Copia el `Client ID` y el `Client Secret`.

## Paso 2: Configurar variables de entorno

Añade estas variables:

```env
GOOGLE_CALENDAR_CLIENT_ID="tu-client-id-de-google"
GOOGLE_CALENDAR_CLIENT_SECRET="tu-client-secret-de-google"
GOOGLE_CALENDAR_REDIRECT_URI="http://localhost:3001/api/calendar/callback"
```

La `REDIRECT_URI` debe coincidir exactamente con la que uses en Google Cloud.

## Paso 3: Aplicar la migración

La integración necesita una tabla de configuración propia y varios campos nuevos en `appointments`.

```bash
npm run prisma:migrate
```

## Paso 4: Conectar la cuenta desde Lucy3000

1. Inicia la app.
2. Entra en `Configuración`.
3. Accede con un usuario `ADMIN`.
4. En la tarjeta `Google Calendar`, pulsa `Conectar Google Calendar`.
5. Completa la autorización en la ventana emergente.
6. Al volver a la app, guarda la configuración:
   - `Sincronizar citas con Google Calendar`
   - `Enviar invitaciones y actualizaciones al cliente`
   - `ID de Calendar` (`primary` para el calendario principal)

## Qué hace la integración

### Al crear una cita

- Si la integración está activa, Lucy3000 crea o intenta crear el evento en Google Calendar.
- Si la cita tiene email de cliente y están activadas las invitaciones, Google envía la invitación del evento.
- Si no hay email de cliente, el evento se crea solo en tu calendario.

### Al modificar una cita

- Lucy3000 actualiza el evento ya enlazado.
- Si el cliente era invitado, Google envía la actualización del evento.

### Al borrar una cita

- Lucy3000 intenta eliminar el evento de Google Calendar.
- Si el cliente era invitado, Google puede enviar la cancelación del evento.

## Notas importantes

- La integración de Calendar es global para la app, no por equipo.
- La configuración de impresora sigue siendo local por dispositivo.
- Si desactivas la sincronización, Lucy3000 deja de enviar nuevos cambios a Google Calendar. No borra automáticamente los eventos que ya existieran.
- Si cambias de cuenta y desconectas la integración, Lucy3000 elimina el vínculo local con los eventos ya sincronizados.

## Problemas comunes

### `Error generando URL de autorización`

Revisa:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`

### La ventana de autorización no termina de conectar la app

Revisa:

- que la URL de callback configurada en Google coincida exactamente;
- que el backend local esté levantado en el puerto configurado;
- que el popup no haya sido bloqueado por el navegador.

### Las citas no aparecen en Google Calendar

Revisa:

- que la integración esté conectada;
- que la sincronización esté activada;
- que el `calendarId` sea correcto;
- los logs del backend para ver si la cita quedó marcada con error de sincronización.

## Recomendación operativa

Empieza con `calendarId = primary` y con una sola cuenta de Google del negocio. Cuando eso esté estable, ya puedes plantearte calendarios específicos o más reglas de negocio.
