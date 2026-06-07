# Guardrails para no afectar local/equipo

Estado: 2026-06-06

## No tocar en la preparacion

Mientras solo se prepara el canal movil/iPad, no cambiar:

- `package.json` scripts existentes;
- `vite.config.ts`;
- `src/main/*`;
- `src/preload.ts`;
- `src/shared/electron.ts`;
- `src/backend/db.ts`;
- `prisma/schema.prisma`;
- migraciones;
- `.env`, `.env.development` o `.env.example`;
- logica de arranque de Electron.

## Reglas para futuros cambios de UI

- Preferir CSS responsive, componentes existentes y hooks locales.
- No crear rutas paralelas tipo `/mobile/*` salvo necesidad real.
- No duplicar logica de negocio entre escritorio y movil.
- Si se crea un componente especifico para movil, debe ser importado solo desde
  la pantalla afectada y probado contra escritorio.
- No cambiar payloads de API por comodidad visual; si hace falta, crear endpoints
  o parametros compatibles y versionados con tests.
- Mantener `src/renderer/pages/*` como shells ligeros.
- Mantener el cliente HTTP oficial en `src/renderer/utils/api.ts`.

## Reglas PWA

- El service worker no debe cachear llamadas a la API.
- No guardar datos sensibles de negocio en caches persistentes del navegador.
- No introducir modo offline real hasta que haya una decision explicita de
  producto y seguridad.
- El token debe seguir gestionado por el flujo actual de auth.
- La licencia/trial se evalua en servidor.

## Reglas Electron/local

- Electron debe seguir pudiendo funcionar en el flujo actual.
- El canal web/PWA no debe requerir cambios en el wrapper.
- No usar capacidades Electron como requisito para una pantalla movil.
- En navegador, mostrar alternativas seguras para impresora, backups legacy y
  assets locales.
- No guardar `DATABASE_URL` compartida en ningun dispositivo cliente.

## Reglas multi-tenant

- `ID cliente`/`tenantCode` solo selecciona centro en login.
- La barrera real sigue siendo JWT con `tenantId` y scoping de API.
- Toda prueba movil debe incluir validacion de aislamiento entre tenants.
- Las consultas raw y procesos background siguen necesitando revision explicita
  por `tenantId`.

