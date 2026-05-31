# Lucy3000 internal admin dashboard

Herramienta local para Sergio. No forma parte de la app instalada al cliente.

## Para arrancar

1. Ejecuta:

```powershell
npm run admin:dashboard
```

2. Abre `http://127.0.0.1:3999`.
3. Usa el bloque `Nuevo cliente Supabase` para guardar el centro, contacto,
   direccion, URL del proyecto Supabase y URL Pooler.

Tambien puedes copiar `tools/lucy-admin-dashboard/clients.example.json` a
`tools/lucy-admin-dashboard/clients.local.json` y editarlo a mano si lo prefieres.

## Configuracion privada

`clients.local.json` y `.env.admin.local` estan ignorados por git.

Ejemplo de `.env.admin.local`:

```dotenv
LUCY_CLIENT_LUCY_LOCAL_DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:5432/postgres"
```

Si introduces la URL Pooler desde el panel, se guarda directamente en
`clients.local.json`. Ese archivo esta ignorado por git.

En Supabase, para Prisma en un portatil normal usa la cadena del Session Pooler,
normalmente con puerto `5432`. Evita poner la password directamente en archivos
versionados.

## Acciones disponibles

- `Iniciar prueba`: pone la licencia en `TRIAL`, plan `trial`, y calcula 7 dias con `NOW()` de Supabase.
- `Activar pago`: pone la licencia en `ACTIVE`, plan `pro`, y guarda `activatedAt` con `NOW()` de Supabase.
- `Bloquear`: pone la licencia en `BLOCKED` y guarda `blockedAt` con `NOW()` de Supabase.
- `Cancelar`: pone la licencia en `CANCELLED`, limpia `blockedAt` y guarda `cancelledAt` con `NOW()` de Supabase.

La herramienta nunca envia la cadena `DATABASE_URL` al navegador. Solo vive en el
proceso local de Node.

## Seguridad local

Por defecto el servidor escucha solo en `127.0.0.1`. Si algun dia quieres abrirlo
en la red local, define primero un token:

```powershell
$env:LUCY_ADMIN_TOKEN="un-token-largo"
npm run admin:dashboard -- --host 0.0.0.0
```

Sin `LUCY_ADMIN_TOKEN`, el servidor se niega a escuchar fuera de localhost.
