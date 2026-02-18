# 🌟 Lucy3000 - Sistema de Gestión para Estética

Sistema de contabilidad y gestión completo para tiendas de estética, desarrollado con Electron, React, TypeScript, Node.js y Supabase.

Estado actual del proyecto y plan de trabajo: [ROADMAP.md](ROADMAP.md)
Guía de recuperación de base de datos: [BACKUP_RESTORE.md](BACKUP_RESTORE.md)

## 📋 Características Principales

### ✨ Funcionalidades Implementadas

- **Dashboard Interactivo**: Resumen general con estadísticas en tiempo real
- **Gestión de Clientes**: 
  - Registro completo con historial
  - Fotos y documentos
  - Sistema de puntos de fidelidad
  - Alertas de cumpleaños
  - Historial de servicios y compras
  
- **Agenda de Citas**:
  - Vista diaria y semanal
  - Recordatorios automáticos
  - Estados de citas (programada, confirmada, completada, cancelada)
  
- **Servicios**:
  - Catálogo de tratamientos
  - Precios y duraciones
  - Categorización
  
- **Productos y Almacén**:
  - Control de inventario
  - Alertas de stock bajo
  - Movimientos de stock (compras, ventas, ajustes)
  - Códigos de barras y SKU
  
- **Ventas**:
  - Punto de venta integrado
  - Múltiples métodos de pago
  - Generación automática de tickets
  - Sistema de descuentos
  
- **Caja Diaria**:
  - Apertura y cierre de caja
  - Registro de ingresos y gastos
  - Arqueo automático
  - Historial de movimientos
  
- **Reportes**:
  - Ventas por período
  - Clientes top
  - Productos más vendidos
  - Flujo de caja
  - Exportación (en desarrollo)
  
- **Sistema de Notificaciones**:
  - Cumpleaños de clientes
  - Stock bajo
  - Citas próximas
  - Recordatorios personalizados
  
- **Características Adicionales**:
  - Modo oscuro/claro
  - Sistema de roles (Admin, Manager, Employee)
  - Backups (en desarrollo)
  - Multi-sucursal (preparado)
  - Responsive design

## 🚀 Tecnologías Utilizadas

### Frontend
- **Electron**: Aplicación de escritorio multiplataforma
- **React 18**: Biblioteca de UI
- **TypeScript**: Tipado estático
- **Tailwind CSS**: Estilos modernos y responsive
- **Zustand**: Gestión de estado
- **React Router**: Navegación
- **Recharts**: Gráficos y visualizaciones
- **React Hot Toast**: Notificaciones
- **Lucide React**: Iconos

### Backend
- **Node.js**: Runtime de JavaScript
- **Express**: Framework web
- **Prisma**: ORM para base de datos
- **PostgreSQL**: Base de datos (via Supabase)
- **JWT**: Autenticación
- **Bcrypt**: Encriptación de contraseñas

### Base de Datos
- **Supabase**: Backend as a Service
- **PostgreSQL**: Base de datos relacional

## 📦 Instalación

### Prerrequisitos

- Node.js 18+ 
- npm o yarn
- Cuenta de Supabase (gratuita)

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd Lucy3000
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar Supabase**

   a. Crear un proyecto en [Supabase](https://supabase.com)
   
   b. Obtener las credenciales:
      - URL del proyecto
      - Anon Key
      - Service Key
      - Database URL (en Settings > Database)

4. **Configurar variables de entorno**

Copiar `.env.example` a `.env` y completar:

```env
# Supabase Configuration
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_KEY="your-service-key"

# Backend Configuration
PORT=3001
NODE_ENV=development

# JWT Secret
JWT_SECRET="your-super-secret-jwt-key-change-this"

# App Configuration
APP_NAME="Lucy3000 Accounting"
APP_VERSION="1.0.0"
```

5. **Configurar la base de datos**

```bash
# Generar cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate
```

6. **Crear usuario administrador inicial**

Puedes usar Prisma Studio para crear el primer usuario:

```bash
npm run prisma:studio
```

O ejecutar este script SQL en Supabase:

```sql
INSERT INTO users (id, email, password, name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'admin@lucy3000.com',
  '$2a$10$YourHashedPasswordHere', -- Usar bcrypt para hashear 'admin123'
  'Administrador',
  'ADMIN',
  true,
  NOW(),
  NOW()
);
```

## 🎯 Uso

### Desarrollo

```bash
# Iniciar backend y frontend en modo desarrollo
npm run dev

# Solo backend
npm run dev:backend

# Solo frontend (Electron)
npm run dev:electron
```

La aplicación se abrirá automáticamente en una ventana de Electron.

### Producción

```bash
# Compilar la aplicación
npm run build

# Los instaladores se generarán en la carpeta /release
```

## 📱 Credenciales de Demo

```
Email: admin@lucy3000.com
Password: admin123
```

## 🗂️ Estructura del Proyecto

```
Lucy3000/
├── prisma/
│   └── schema.prisma          # Esquema de base de datos
├── src/
│   ├── main/                  # Proceso principal de Electron
│   │   └── main.ts
│   ├── preload.ts             # Script de preload
│   ├── backend/               # API Backend
│   │   ├── controllers/       # Controladores
│   │   ├── routes/            # Rutas de API
│   │   ├── middleware/        # Middleware (auth, etc.)
│   │   └── server.ts          # Servidor Express
│   └── renderer/              # Frontend React
│       ├── components/        # Componentes reutilizables
│       ├── pages/             # Páginas de la aplicación
│       ├── stores/            # Estado global (Zustand)
│       ├── utils/             # Utilidades
│       ├── styles/            # Estilos CSS
│       ├── App.tsx            # Componente principal
│       └── main.tsx           # Punto de entrada
├── public/                    # Archivos estáticos
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 🔧 Scripts Disponibles

```bash
npm run dev              # Desarrollo completo
npm run dev:backend      # Solo backend
npm run dev:electron     # Solo Electron
npm run build            # Compilar para producción
npm run prisma:generate  # Generar cliente Prisma
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:studio    # Abrir Prisma Studio
```

## 🌐 Deployment en Render

### Backend API

1. Crear nuevo Web Service en Render
2. Conectar repositorio
3. Configurar:
   - Build Command: `npm install && npm run build:backend`
   - Start Command: `node dist/backend/server.js`
4. Agregar variables de entorno desde `.env`

### Base de Datos

Ya está configurada en Supabase, no requiere deployment adicional.

## 📊 Modelos de Base de Datos

- **Users**: Usuarios del sistema con roles
- **Clients**: Clientes de la tienda
- **ClientHistory**: Historial de servicios por cliente
- **Services**: Catálogo de servicios
- **Appointments**: Citas programadas
- **Products**: Productos en inventario
- **StockMovements**: Movimientos de stock
- **Sales**: Ventas realizadas
- **SaleItems**: Items de cada venta
- **CashRegister**: Cajas diarias
- **CashMovement**: Movimientos de caja
- **Notifications**: Notificaciones del sistema
- **Settings**: Configuración general

## 🎨 Personalización

### Colores

Editar `tailwind.config.js` para cambiar la paleta de colores:

```javascript
colors: {
  primary: { /* tus colores */ },
  secondary: { /* tus colores */ }
}
```

### Logo

Reemplazar archivos en `/public`:
- `icon.ico` (Windows)
- `icon.icns` (macOS)
- `icon.png` (Linux)

## 🔐 Seguridad

- Autenticación JWT
- Contraseñas hasheadas con bcrypt
- Roles y permisos
- Validación de datos con Zod
- CORS configurado
- Variables de entorno para secretos

## 🐛 Solución de Problemas

### Error de conexión a la base de datos
- Verificar DATABASE_URL en `.env`
- Comprobar que Supabase esté activo
- Ejecutar `npm run prisma:generate`

### Error al iniciar Electron
- Verificar que el backend esté corriendo
- Comprobar puerto 3001 disponible
- Revisar logs en la consola

### Problemas con Prisma
```bash
# Resetear base de datos (¡cuidado en producción!)
npx prisma migrate reset

# Regenerar cliente
npm run prisma:generate
```

## 📝 Próximas Características

- [ ] Calendario interactivo para citas
- [ ] Generación de PDFs personalizados
- [ ] Exportación a Excel
- [ ] Sistema de recordatorios por email/SMS
- [ ] Integración con WhatsApp
- [ ] App móvil complementaria
- [ ] Modo offline completo
- [ ] Multi-sucursal activo
- [ ] Reportes avanzados con BI
- [ ] Integración con pasarelas de pago

## 👥 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crear una rama (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

## 👨‍💻 Autor

**Sergio Hernández Lara**
- Email: sergiohernandezlara07@gmail.com

## 🙏 Agradecimientos

- Supabase por el excelente BaaS
- Electron por hacer posible las apps de escritorio
- La comunidad de React y TypeScript

---

**¡Hecho con ❤️ para tiendas de estética!**

