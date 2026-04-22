# Google Calendar Setup

Estado actualizado: 2026-04-21

## Qué integra Lucy3000

La integración actual sincroniza con Google Calendar:
- citas;
- bloqueos de agenda.

Según el caso, puede:
- crear eventos;
- actualizarlos;
- eliminarlos;
- enviar invitaciones al cliente cuando existe email y la opción está activada.

Las invitaciones las gestiona Google Calendar, no Lucy3000 por SMTP.

## Requisitos
- usuario `ADMIN`;
- variables de entorno OAuth configuradas;
- backend local accesible en la callback;
- instalación con acceso real a internet.

## Variables necesarias

```env
GOOGLE_CALENDAR_CLIENT_ID="tu-client-id"
GOOGLE_CALENDAR_CLIENT_SECRET="tu-client-secret"
GOOGLE_CALENDAR_REDIRECT_URI="http://localhost:3001/api/calendar/callback"
```

La callback debe coincidir exactamente con la configurada en Google Cloud.

## Dónde poner el `.env`

En empaquetado, Lucy3000 puede leer `.env` desde:
- la carpeta de datos local del usuario;
- la carpeta del `.exe`;
- `resources/`.

Ruta recomendada para soporte por instalación:
- `userData\.env`

La pantalla `Settings` ya muestra:
- si faltan variables;
- qué variables faltan;
- la redirect URI esperada;
- la ruta recomendada donde colocar el `.env`.

## Configuración en Google Cloud

1. Crear o reutilizar proyecto.
2. Activar Google Calendar API.
3. Configurar pantalla de consentimiento OAuth.
4. Crear cliente OAuth.
5. Registrar la callback exacta.
6. Copiar `client_id` y `client_secret`.

## Flujo dentro de Lucy3000

1. Iniciar sesión como `ADMIN`.
2. Abrir `Settings`.
3. Ir a `Google Calendar`.
4. Pulsar `Conectar Google Calendar`.
5. Completar autorización en la ventana emergente.
6. Guardar configuración:
   - `Sincronizar citas con Google Calendar`
   - `Enviar invitaciones y actualizaciones al cliente`
   - `calendarId`

## Configuración funcional

### `enabled`
Si está activo, Lucy3000 intentará mantener sincronizadas citas y bloqueos.

### `sendClientInvites`
Si la cita tiene email de cliente, Google enviará alta, cambios o cancelación del evento.

### `calendarId`
- usa `primary` para empezar;
- también puedes usar el ID de un calendario concreto.

## Sincronización manual

Desde `Settings` existe un botón de sincronización manual.
Ese flujo lanza una sincronización completa de agenda con alcance admin, útil para:
- enviar agenda existente tras conectar por primera vez;
- reintentar sincronización después de fallos;
- regenerar estados locales de sync.

## Desconexión

Al desconectar:
- se revoca el token si Google lo permite;
- se borra la configuración local;
- se limpian los metadatos locales de sincronización en citas y bloqueos.

No debes asumir que eso borra eventos remotos ya creados en Google.

## Troubleshooting

### No aparece la URL de autorización
Revisa:
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`

### La callback falla
Revisa:
- coincidencia exacta de la redirect URI;
- que el backend local esté levantado;
- que el popup o navegador no esté bloqueando la redirección.

### Las citas o bloqueos no sincronizan
Revisa:
- que la cuenta esté conectada;
- que `enabled` esté activo;
- que `calendarId` sea correcto;
- logs del backend;
- si Google ha revocado el refresh token.

### El token quedó inválido
El servicio limpia la configuración local cuando detecta `invalid_grant`.
La acción correcta es volver a conectar la cuenta desde `Settings`.

## Recomendación operativa

Empieza con:
- una sola cuenta del negocio;
- `calendarId=primary`;
- invitaciones activadas solo después de verificar el flujo con una cuenta real de cliente.
