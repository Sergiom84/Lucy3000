# 📡 API Examples - Lucy3000

Ejemplos de uso de la API REST de Lucy3000.

## 🔐 Autenticación

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@lucy3000.com",
  "password": "admin123"
}

# Respuesta
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@lucy3000.com",
    "name": "Administrador",
    "role": "ADMIN"
  }
}
```

### Registro
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "nuevo@usuario.com",
  "password": "password123",
  "name": "Nuevo Usuario",
  "role": "EMPLOYEE"
}
```

### Usuario Actual
```bash
GET /api/auth/me
Authorization: Bearer {token}
```

## 👥 Clientes

### Listar Clientes
```bash
GET /api/clients
Authorization: Bearer {token}

# Con búsqueda
GET /api/clients?search=maria

# Solo activos
GET /api/clients?isActive=true
```

### Obtener Cliente
```bash
GET /api/clients/{id}
Authorization: Bearer {token}
```

### Crear Cliente
```bash
POST /api/clients
Authorization: Bearer {token}
Content-Type: application/json

{
  "firstName": "María",
  "lastName": "García",
  "email": "maria@email.com",
  "phone": "612345678",
  "birthDate": "1990-05-15",
  "address": "Calle Principal 123",
  "city": "Madrid",
  "postalCode": "28001",
  "notes": "Cliente VIP"
}
```

### Actualizar Cliente
```bash
PUT /api/clients/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "phone": "612999888",
  "notes": "Actualizado"
}
```

### Eliminar Cliente
```bash
DELETE /api/clients/{id}
Authorization: Bearer {token}
```

### Historial de Cliente
```bash
GET /api/clients/{id}/history
Authorization: Bearer {token}
```

### Agregar al Historial
```bash
POST /api/clients/{id}/history
Authorization: Bearer {token}
Content-Type: application/json

{
  "service": "Manicura",
  "notes": "Cliente satisfecho",
  "amount": 25.00,
  "photoUrl": "https://..."
}
```

### Cumpleaños del Mes
```bash
GET /api/clients/birthdays
Authorization: Bearer {token}
```

## 📅 Citas

### Listar Citas
```bash
GET /api/appointments
Authorization: Bearer {token}

# Por rango de fechas
GET /api/appointments?startDate=2024-01-01&endDate=2024-01-31

# Por estado
GET /api/appointments?status=SCHEDULED

# Por cliente
GET /api/appointments?clientId={clientId}
```

### Citas por Fecha
```bash
GET /api/appointments/date/2024-01-15
Authorization: Bearer {token}
```

### Crear Cita
```bash
POST /api/appointments
Authorization: Bearer {token}
Content-Type: application/json

{
  "clientId": "uuid",
  "userId": "uuid",
  "serviceId": "uuid",
  "date": "2024-01-15",
  "startTime": "10:00",
  "endTime": "11:00",
  "status": "SCHEDULED",
  "notes": "Primera cita",
  "reminder": true
}
```

### Actualizar Cita
```bash
PUT /api/appointments/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "CONFIRMED"
}
```

### Eliminar Cita
```bash
DELETE /api/appointments/{id}
Authorization: Bearer {token}
```

## ✂️ Servicios

### Listar Servicios
```bash
GET /api/services
Authorization: Bearer {token}

# Por categoría
GET /api/services?category=Manicura

# Solo activos
GET /api/services?isActive=true
```

### Crear Servicio
```bash
POST /api/services
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Manicura Completa",
  "description": "Incluye limado, esmaltado y decoración",
  "price": 25.00,
  "duration": 60,
  "category": "Manicura"
}
```

## 📦 Productos

### Listar Productos
```bash
GET /api/products
Authorization: Bearer {token}

# Buscar
GET /api/products?search=esmalte

# Por categoría
GET /api/products?category=Esmaltes
```

### Productos con Stock Bajo
```bash
GET /api/products/low-stock
Authorization: Bearer {token}
```

### Crear Producto
```bash
POST /api/products
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Esmalte Rojo",
  "sku": "ESM-001",
  "barcode": "1234567890",
  "category": "Esmaltes",
  "brand": "OPI",
  "price": 12.50,
  "cost": 6.00,
  "stock": 10,
  "minStock": 3,
  "unit": "unidad"
}
```

### Movimiento de Stock
```bash
POST /api/products/{id}/stock
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "PURCHASE",
  "quantity": 20,
  "reason": "Compra mensual",
  "reference": "FAC-001"
}
```

## 🛒 Ventas

### Listar Ventas
```bash
GET /api/sales
Authorization: Bearer {token}

# Por rango de fechas
GET /api/sales?startDate=2024-01-01&endDate=2024-01-31

# Por cliente
GET /api/sales?clientId={clientId}
```

### Crear Venta
```bash
POST /api/sales
Authorization: Bearer {token}
Content-Type: application/json

{
  "clientId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "description": "Esmalte Rojo",
      "quantity": 2,
      "price": 12.50
    },
    {
      "serviceId": "uuid",
      "description": "Manicura",
      "quantity": 1,
      "price": 25.00
    }
  ],
  "discount": 5.00,
  "tax": 0,
  "paymentMethod": "CARD",
  "notes": "Cliente satisfecho"
}
```

## 💰 Caja

### Listar Cajas
```bash
GET /api/cash
Authorization: Bearer {token}

# Por rango de fechas
GET /api/cash?startDate=2024-01-01&endDate=2024-01-31

# Solo abiertas
GET /api/cash?status=OPEN
```

### Abrir Caja
```bash
POST /api/cash/open
Authorization: Bearer {token}
Content-Type: application/json

{
  "openingBalance": 100.00,
  "notes": "Apertura del día"
}
```

### Cerrar Caja
```bash
POST /api/cash/{id}/close
Authorization: Bearer {token}
Content-Type: application/json

{
  "closingBalance": 450.00,
  "notes": "Cierre del día"
}
```

### Agregar Movimiento
```bash
POST /api/cash/{id}/movements
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "INCOME",
  "amount": 50.00,
  "category": "Ventas",
  "description": "Venta de productos",
  "reference": "V-000001"
}
```

## 🔔 Notificaciones

### Listar Notificaciones
```bash
GET /api/notifications
Authorization: Bearer {token}

# Solo no leídas
GET /api/notifications?isRead=false

# Por tipo
GET /api/notifications?type=BIRTHDAY
```

### Marcar como Leída
```bash
PUT /api/notifications/{id}/read
Authorization: Bearer {token}
```

### Marcar Todas como Leídas
```bash
PUT /api/notifications/read-all
Authorization: Bearer {token}
```

## 📊 Reportes

### Reporte de Ventas
```bash
GET /api/reports/sales?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer {token}

# Respuesta
{
  "totalSales": 150,
  "totalRevenue": 4500.00,
  "averageTicket": 30.00,
  "paymentMethods": {
    "CASH": 2000.00,
    "CARD": 2500.00
  },
  "topProducts": [...]
}
```

### Reporte de Clientes
```bash
GET /api/reports/clients
Authorization: Bearer {token}
```

### Reporte de Productos
```bash
GET /api/reports/products
Authorization: Bearer {token}
```

### Reporte de Caja
```bash
GET /api/reports/cash?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer {token}
```

## 📈 Dashboard

### Estadísticas
```bash
GET /api/dashboard/stats
Authorization: Bearer {token}

# Respuesta
{
  "today": {
    "appointments": 5,
    "revenue": 250.00,
    "salesCount": 8
  },
  "month": {
    "revenue": 4500.00,
    "salesCount": 150
  },
  "totals": {
    "clients": 120,
    "lowStockProducts": 3,
    "unreadNotifications": 5
  },
  "openCashRegister": {...},
  "upcomingAppointments": [...],
  "recentSales": [...],
  "salesChart": [...]
}
```

## 🔧 Ejemplos con JavaScript/TypeScript

### Usando Axios

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Login
const login = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password })
  const { token } = response.data
  
  // Guardar token
  localStorage.setItem('token', token)
  
  // Configurar para futuras peticiones
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  
  return response.data
}

// Obtener clientes
const getClients = async () => {
  const response = await api.get('/clients')
  return response.data
}

// Crear cliente
const createClient = async (data: any) => {
  const response = await api.post('/clients', data)
  return response.data
}
```

### Usando Fetch

```javascript
// Login
const login = async (email, password) => {
  const response = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })
  
  const data = await response.json()
  return data
}

// Obtener clientes (con token)
const getClients = async (token) => {
  const response = await fetch('http://localhost:3001/api/clients', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  
  const data = await response.json()
  return data
}
```

## 🧪 Testing con cURL

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lucy3000.com","password":"admin123"}'

# Obtener clientes
curl -X GET http://localhost:3001/api/clients \
  -H "Authorization: Bearer YOUR_TOKEN"

# Crear cliente
curl -X POST http://localhost:3001/api/clients \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "phone": "612345678",
    "email": "test@test.com"
  }'
```

## 📝 Notas

- Todos los endpoints (excepto login y register) requieren autenticación
- El token JWT expira en 7 días
- Los timestamps están en formato ISO 8601
- Los precios son Decimal con 2 decimales
- Las fechas son en formato YYYY-MM-DD

---

**¡API lista para usar! 🚀**

