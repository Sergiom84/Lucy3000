# 🌟 Lucy3000 - Sistema de Gestión para Estética

Sistema de contabilidad y gestión completo para tiendas de estética, desarrollado con Electron, React, TypeScript, Node.js y Prisma sobre SQLite local.

> Nota: este repo se ejecuta en local con SQLite por defecto. Las referencias a Supabase en esta documentación son históricas o aplicables solo a backups/restauraciones y despliegues remotos.

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
- **SQLite**: Base de datos local del runtime de escritorio
- **JWT**: Autenticación
- **Bcrypt**: Encriptación de contraseñas

### Base de Datos
- **SQLite**: Base de datos local por defecto
- **Supabase**: Referencia histórica para backups/restauración o despliegues remotos

## 📦 Instalación

### Prerrequisitos

- Node.js 18+ 
- npm o yarn
- Cuenta de Supabase solo si vas a trabajar con restauración histórica o despliegue remoto

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

3. **Configurar entorno local**

   a. La app usa SQLite local. En `.env` se configura como `file:./prisma/lucy3000.db` y Prisma la resuelve físicamente en `prisma/prisma/lucy3000.db`
   
   b. Si necesitas restaurar un estado previo, consulta `BACKUP_RESTORE.md`

4. **Configurar variables de entorno**

Copiar `.env.example` a `.env` y completar:

```env
# SQLite local
# Nota: Prisma resuelve esta ruta relativa desde `prisma/schema.prisma`,
# por eso el fichero real queda en `prisma/prisma/lucy3000.db`.
DATABASE_URL="file:./prisma/lucy3000.db"

# Backend Configuration
PORT=3001
NODE_ENV=development

# JWT Secret
JWT_SECRET="your-super-secret-jwt-key-change-this"

# App Configuration
APP_NAME="Lucy3000 Accounting"
APP_VERSION="1.0.0"

# WhatsApp reminders (Meta WhatsApp Cloud API)
WHATSAPP_REMINDERS_ENABLED=false
WHATSAPP_ACCESS_TOKEN="your-whatsapp-access-token"
WHATSAPP_PHONE_NUMBER_ID="your-whatsapp-phone-number-id"
WHATSAPP_TEMPLATE_NAME="appointment_reminder"
WHATSAPP_TEMPLATE_LANGUAGE="es"
WHATSAPP_DEFAULT_COUNTRY_CODE="34"
WHATSAPP_GRAPH_API_VERSION="v23.0"
WHATSAPP_REMINDER_INTERVAL_MINUTES=30
```

### Recordatorios por WhatsApp (día anterior)

- La app revisa automáticamente las citas de mañana y envía recordatorio si `appointment.reminder = true`.
- Se envía una sola vez por cita y se marca internamente como enviado.
- Requiere plantilla de WhatsApp aprobada en Meta con este orden de variables:
  1. Nombre de clienta
  2. Servicio/tratamiento
  3. Fecha de la cita
  4. Hora de inicio

5. **Sincronizar la base de datos local**

```bash
# Generar cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate
```

6. **Crear usuario administrador inicial**

Usa Prisma Studio para crear el primer usuario si la base local está vacía:

```bash
npm run prisma:studio
```

Si estás restaurando un entorno PostgreSQL/Supabase histórico, el flujo SQL original sigue documentado en `BACKUP_RESTORE.md`.

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
Password: lucy3000
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

El runtime local usa SQLite y no depende de Supabase para operar. Si publicas un backend remoto, tendrás que definir una estrategia de persistencia distinta.

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
- Verificar `DATABASE_URL` en `.env`
- Confirmar que la SQLite local exista en `prisma/prisma/lucy3000.db` y tenga permisos de escritura
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

- Supabase por los backups y el histórico de restauración
- Electron por hacer posible las apps de escritorio
- La comunidad de React y TypeScript

---

**¡Hecho con ❤️ para tiendas de estética!**

