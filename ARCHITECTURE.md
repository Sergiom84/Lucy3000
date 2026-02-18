# 🏗️ Arquitectura de Lucy3000

Documentación técnica de la arquitectura del sistema.

## 📊 Diagrama de Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                     LUCY3000 SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           ELECTRON DESKTOP APP                       │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │         REACT FRONTEND (Renderer)             │  │   │
│  │  │  ┌─────────────────────────────────────────┐  │  │   │
│  │  │  │  Components (UI)                        │  │  │   │
│  │  │  │  - Layout, Navbar, Sidebar              │  │  │   │
│  │  │  │  - Pages (Dashboard, Clients, etc.)     │  │  │   │
│  │  │  └─────────────────────────────────────────┘  │  │   │
│  │  │  ┌─────────────────────────────────────────┐  │  │   │
│  │  │  │  State Management (Zustand)             │  │  │   │
│  │  │  │  - Auth Store                           │  │  │   │
│  │  │  │  - Theme Store                          │  │  │   │
│  │  │  └─────────────────────────────────────────┘  │  │   │
│  │  │  ┌─────────────────────────────────────────┐  │  │   │
│  │  │  │  Utils & Helpers                        │  │  │   │
│  │  │  │  - API Client (Axios)                   │  │  │   │
│  │  │  │  - Formatters                           │  │  │   │
│  │  │  └─────────────────────────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                         ↕                            │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │         ELECTRON MAIN PROCESS                 │  │   │
│  │  │  - Window Management                          │  │   │
│  │  │  - IPC Handlers                               │  │   │
│  │  │  - Native APIs                                │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↕ HTTP/REST                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           NODE.JS BACKEND (Express)                  │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Routes (API Endpoints)                       │  │   │
│  │  │  /auth, /clients, /appointments, etc.         │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                         ↕                            │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Middleware                                    │  │   │
│  │  │  - Authentication (JWT)                        │  │   │
│  │  │  - Authorization (Roles)                       │  │   │
│  │  │  - Error Handling                              │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                         ↕                            │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Controllers (Business Logic)                  │  │   │
│  │  │  - Auth, Clients, Sales, etc.                  │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                         ↕                            │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Prisma ORM                                    │  │   │
│  │  │  - Models & Queries                            │  │   │
│  │  │  - Migrations                                  │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↕ SQL                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           SUPABASE (PostgreSQL)                      │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Database Tables                               │  │   │
│  │  │  - users, clients, appointments                │  │   │
│  │  │  - products, sales, cash_registers             │  │   │
│  │  │  - notifications, settings                     │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Flujo de Datos

### 1. Autenticación
```
User Input (Login Form)
    ↓
React Component
    ↓
API Client (Axios)
    ↓
POST /api/auth/login
    ↓
Auth Controller
    ↓
Prisma Query (users table)
    ↓
Supabase PostgreSQL
    ↓
JWT Token Generation
    ↓
Response to Frontend
    ↓
Store in Zustand (Auth Store)
    ↓
Redirect to Dashboard
```

### 2. Operación CRUD (Ejemplo: Crear Cliente)
```
User Input (Client Form)
    ↓
React Component
    ↓
Form Validation
    ↓
API Client (with JWT token)
    ↓
POST /api/clients
    ↓
Auth Middleware (verify token)
    ↓
Client Controller
    ↓
Prisma Create
    ↓
Supabase PostgreSQL
    ↓
Response to Frontend
    ↓
Update UI
    ↓
Show Toast Notification
```

## 🗂️ Estructura de Carpetas Detallada

```
Lucy3000/
│
├── 📁 prisma/
│   ├── schema.prisma          # Definición de modelos de BD
│   └── migrations/            # Historial de migraciones
│
├── 📁 src/
│   │
│   ├── 📁 main/               # Electron Main Process
│   │   └── main.ts            # Ventana principal, IPC handlers
│   │
│   ├── 📁 preload.ts          # Bridge seguro entre main y renderer
│   │
│   ├── 📁 backend/            # API Backend
│   │   │
│   │   ├── 📁 controllers/    # Lógica de negocio
│   │   │   ├── auth.controller.ts
│   │   │   ├── client.controller.ts
│   │   │   ├── appointment.controller.ts
│   │   │   ├── service.controller.ts
│   │   │   ├── product.controller.ts
│   │   │   ├── sale.controller.ts
│   │   │   ├── cash.controller.ts
│   │   │   ├── notification.controller.ts
│   │   │   ├── report.controller.ts
│   │   │   └── dashboard.controller.ts
│   │   │
│   │   ├── 📁 routes/         # Definición de endpoints
│   │   │   ├── auth.routes.ts
│   │   │   ├── client.routes.ts
│   │   │   ├── appointment.routes.ts
│   │   │   ├── service.routes.ts
│   │   │   ├── product.routes.ts
│   │   │   ├── sale.routes.ts
│   │   │   ├── cash.routes.ts
│   │   │   ├── notification.routes.ts
│   │   │   ├── report.routes.ts
│   │   │   └── dashboard.routes.ts
│   │   │
│   │   ├── 📁 middleware/     # Middleware de Express
│   │   │   └── auth.middleware.ts
│   │   │
│   │   └── server.ts          # Configuración del servidor
│   │
│   └── 📁 renderer/           # React Frontend
│       │
│       ├── 📁 components/     # Componentes reutilizables
│       │   ├── Layout.tsx
│       │   ├── Navbar.tsx
│       │   └── Sidebar.tsx
│       │
│       ├── 📁 pages/          # Páginas de la aplicación
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Clients.tsx
│       │   ├── ClientDetail.tsx
│       │   ├── Appointments.tsx
│       │   ├── Services.tsx
│       │   ├── Products.tsx
│       │   ├── Sales.tsx
│       │   ├── Cash.tsx
│       │   ├── Reports.tsx
│       │   └── Settings.tsx
│       │
│       ├── 📁 stores/         # Estado global (Zustand)
│       │   ├── authStore.ts
│       │   └── themeStore.ts
│       │
│       ├── 📁 utils/          # Utilidades
│       │   ├── api.ts         # Cliente HTTP
│       │   ├── format.ts      # Formateo de datos
│       │   └── cn.ts          # Utilidad de clases CSS
│       │
│       ├── 📁 styles/         # Estilos globales
│       │   └── index.css
│       │
│       ├── App.tsx            # Componente raíz
│       └── main.tsx           # Punto de entrada
│
├── 📁 scripts/                # Scripts de utilidad
│   ├── setup.js               # Configuración inicial
│   └── create-admin.sql       # Crear usuario admin
│
├── 📁 public/                 # Archivos estáticos
│   └── icons/                 # Iconos de la app
│
├── 📄 package.json            # Dependencias y scripts
├── 📄 tsconfig.json           # Configuración TypeScript
├── 📄 vite.config.ts          # Configuración Vite
├── 📄 tailwind.config.js      # Configuración Tailwind
├── 📄 .env.example            # Variables de entorno ejemplo
├── 📄 README.md               # Documentación principal
├── 📄 QUICK_START.md          # Guía rápida
├── 📄 DEPLOYMENT.md           # Guía de deployment
├── 📄 ROADMAP.md              # Estado y plan de trabajo
└── 📄 ARCHITECTURE.md         # Este archivo
```

## 🔐 Seguridad

### Autenticación
- **JWT Tokens**: Tokens firmados con secret key
- **Bcrypt**: Hash de contraseñas con salt
- **Middleware**: Verificación en cada request protegido

### Autorización
- **Roles**: ADMIN, MANAGER, EMPLOYEE
- **Permisos**: Basados en roles
- **Middleware**: Verificación de permisos

### Comunicación
- **HTTPS**: En producción
- **CORS**: Configurado para dominios permitidos
- **Context Isolation**: En Electron

## 📦 Modelos de Datos

### Relaciones Principales

```
User (1) ──────────── (N) Appointment
User (1) ──────────── (N) Sale
User (1) ──────────── (N) CashMovement

Client (1) ─────────── (N) Appointment
Client (1) ─────────── (N) Sale
Client (1) ─────────── (N) ClientHistory

Service (1) ────────── (N) Appointment
Service (1) ────────── (N) SaleItem

Product (1) ────────── (N) StockMovement
Product (1) ────────── (N) SaleItem

Sale (1) ──────────── (N) SaleItem

CashRegister (1) ───── (N) CashMovement
```

## 🚀 Tecnologías y Librerías

### Frontend
- **Electron**: ^28.1.0 - Desktop app framework
- **React**: ^18.2.0 - UI library
- **TypeScript**: ^5.3.3 - Type safety
- **Vite**: ^5.0.10 - Build tool
- **Tailwind CSS**: ^3.4.0 - Styling
- **Zustand**: ^4.4.7 - State management
- **React Router**: ^6.21.1 - Routing
- **Axios**: ^1.6.5 - HTTP client
- **Recharts**: ^2.10.3 - Charts
- **React Hot Toast**: ^2.4.1 - Notifications
- **Lucide React**: ^0.303.0 - Icons

### Backend
- **Node.js**: 18+ - Runtime
- **Express**: ^4.18.2 - Web framework
- **Prisma**: ^5.8.0 - ORM
- **PostgreSQL**: via Supabase - Database
- **JWT**: ^9.0.2 - Authentication
- **Bcrypt**: ^2.4.3 - Password hashing
- **Zod**: ^3.22.4 - Validation

### DevOps
- **Supabase**: Database hosting
- **Render**: Backend hosting
- **GitHub**: Version control

## 🔄 Ciclo de Vida de la Aplicación

### Desarrollo
```
1. npm install          → Instalar dependencias
2. npm run prisma:generate → Generar cliente Prisma
3. npm run prisma:migrate  → Ejecutar migraciones
4. npm run dev          → Iniciar dev server
   ├─ Backend en :3001
   └─ Electron app
```

### Producción
```
1. npm run build        → Compilar aplicación
   ├─ Backend → dist/backend/
   ├─ Frontend → dist/renderer/
   └─ Electron → release/
2. Deploy backend en Render
3. Distribuir instaladores
```

## 📊 Métricas y Monitoreo

### Backend
- Request logs en consola
- Error tracking
- Performance metrics (Render)

### Frontend
- React DevTools
- Electron DevTools
- Console logs

### Base de Datos
- Supabase Dashboard
- Query performance
- Storage usage

## 🔮 Escalabilidad

### Horizontal
- Backend puede escalar con múltiples instancias
- Load balancer en Render
- Database connection pooling

### Vertical
- Upgrade de plan en Render
- Upgrade de plan en Supabase
- Optimización de queries

### Caché
- Redis para sesiones (futuro)
- Local storage en frontend
- Query caching en Prisma

## 🧪 Testing (Futuro)

### Unit Tests
- Jest para backend
- React Testing Library para frontend

### Integration Tests
- Supertest para API
- Cypress para E2E

### Performance Tests
- Lighthouse para frontend
- Artillery para backend

---

**Arquitectura diseñada para escalar y mantener 🚀**

