# 🚀 Guía de Deployment en Render

Esta guía te ayudará a desplegar Lucy3000 en Render.

## 📋 Prerrequisitos

1. Cuenta en [Render](https://render.com) (gratuita)
2. Cuenta en [Supabase](https://supabase.com) (gratuita)
3. Repositorio en GitHub con el código

## 🗄️ Paso 1: Configurar Supabase

1. Crear un nuevo proyecto en Supabase
2. Ir a Settings > Database y copiar:
   - Connection String (URI)
   - Host
   - Database name
   - Port
   - User
   - Password

3. Ejecutar las migraciones de Prisma:

```bash
# En tu máquina local
npm run prisma:migrate
```

4. Crear usuario administrador inicial usando Prisma Studio o SQL:

```sql
INSERT INTO users (id, email, password, name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'admin@lucy3000.com',
  '$2a$10$YourHashedPasswordHere',
  'Administrador',
  'ADMIN',
  true,
  NOW(),
  NOW()
);
```

## 🌐 Paso 2: Desplegar Backend en Render

### Crear Web Service

1. Ir a [Render Dashboard](https://dashboard.render.com)
2. Click en "New +" > "Web Service"
3. Conectar tu repositorio de GitHub
4. Configurar el servicio:

**General:**
- Name: `lucy3000-backend`
- Region: Elegir la más cercana
- Branch: `main`
- Root Directory: (dejar vacío)

**Build & Deploy:**
- Build Command:
```bash
npm install && npm run build:backend && npx prisma generate
```

- Start Command:
```bash
node dist/backend/server.js
```

**Environment:**
- Node Version: `18`

### Configurar Variables de Entorno

En la sección "Environment" del servicio, agregar:

```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
PORT=3001
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
APP_NAME=Lucy3000 Accounting
APP_VERSION=1.0.0
```

### Desplegar

1. Click en "Create Web Service"
2. Esperar a que se complete el deployment (5-10 minutos)
3. Copiar la URL del servicio (ej: `https://lucy3000-backend.onrender.com`)

## 💻 Paso 3: Configurar Aplicación de Escritorio

### Opción A: Desarrollo Local con Backend en Render

1. Actualizar `.env.development`:

```env
VITE_API_URL=https://lucy3000-backend.onrender.com/api
```

2. Ejecutar la aplicación:

```bash
npm run dev:electron
```

### Opción B: Compilar para Distribución

1. Actualizar `src/renderer/utils/api.ts`:

```typescript
const API_URL = 'https://lucy3000-backend.onrender.com/api'
```

2. Compilar la aplicación:

```bash
npm run build
```

3. Los instaladores estarán en `/release`:
   - Windows: `.exe`
   - macOS: `.dmg`
   - Linux: `.AppImage`

## 🔧 Paso 4: Configuración Adicional

### Habilitar CORS en Backend

Asegurarse de que `src/backend/server.ts` tenga:

```typescript
app.use(cors({
  origin: '*', // En producción, especificar dominios permitidos
  credentials: true
}))
```

### Configurar Dominio Personalizado (Opcional)

1. En Render, ir a Settings > Custom Domain
2. Agregar tu dominio
3. Configurar DNS según instrucciones de Render

## 📊 Monitoreo y Logs

### Ver Logs en Render

1. Ir a tu servicio en Render
2. Click en "Logs" en el menú lateral
3. Ver logs en tiempo real

### Métricas

Render proporciona métricas básicas:
- CPU usage
- Memory usage
- Request count
- Response time

## 🔄 Actualizaciones Automáticas

Render detecta automáticamente cambios en tu repositorio:

1. Push a la rama `main`
2. Render inicia deployment automático
3. La aplicación se actualiza sin downtime

### Desactivar Auto-Deploy

En Settings > Build & Deploy:
- Desactivar "Auto-Deploy"
- Deployments manuales desde el dashboard

## 💰 Costos

### Plan Gratuito de Render

- 750 horas/mes de servicio
- 512 MB RAM
- Servicio se suspende después de 15 minutos de inactividad
- Reinicio automático al recibir requests

### Plan Starter ($7/mes)

- Servicio siempre activo
- 512 MB RAM
- Sin suspensión

### Supabase Gratuito

- 500 MB de base de datos
- 1 GB de transferencia
- 50,000 usuarios activos mensuales

## 🐛 Solución de Problemas

### Error: "Application failed to respond"

**Causa:** El servidor no está escuchando en el puerto correcto

**Solución:**
```typescript
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
```

### Error: "Database connection failed"

**Causa:** DATABASE_URL incorrecta o Supabase inactivo

**Solución:**
1. Verificar DATABASE_URL en variables de entorno
2. Comprobar que Supabase esté activo
3. Verificar que las migraciones se ejecutaron

### Error: "Build failed"

**Causa:** Dependencias faltantes o errores de TypeScript

**Solución:**
1. Verificar que todas las dependencias estén en `package.json`
2. Ejecutar `npm run build:backend` localmente para detectar errores
3. Revisar logs de build en Render

### Servicio Lento

**Causa:** Plan gratuito se suspende por inactividad

**Soluciones:**
1. Upgrade a plan Starter
2. Usar servicio de "keep-alive" (ping cada 10 minutos)
3. Implementar caché

## 🔐 Seguridad en Producción

### Variables de Entorno

- ✅ Usar JWT_SECRET fuerte y único
- ✅ No commitear archivos `.env`
- ✅ Rotar claves periódicamente

### CORS

```typescript
app.use(cors({
  origin: ['https://tu-dominio.com'],
  credentials: true
}))
```

### Rate Limiting

Instalar y configurar:

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de requests
})

app.use('/api/', limiter)
```

## 📱 Alternativas de Deployment

### Backend

- **Vercel**: Serverless, gratis para proyectos pequeños
- **Railway**: Similar a Render, con plan gratuito
- **Heroku**: Clásico, pero ya no tiene plan gratuito
- **DigitalOcean**: VPS desde $5/mes

### Base de Datos

- **Supabase**: Recomendado (actual)
- **PlanetScale**: MySQL serverless
- **Neon**: PostgreSQL serverless
- **MongoDB Atlas**: NoSQL

### Aplicación de Escritorio

- **GitHub Releases**: Distribución gratuita
- **Microsoft Store**: Windows ($19 one-time)
- **Mac App Store**: macOS ($99/año)
- **Snap Store**: Linux (gratuito)

## 📞 Soporte

Si tienes problemas con el deployment:

1. Revisar logs en Render
2. Verificar variables de entorno
3. Comprobar conexión a Supabase
4. Consultar documentación de Render: https://render.com/docs

---

**¡Deployment exitoso! 🎉**

Tu aplicación Lucy3000 ahora está en la nube y lista para usar.

