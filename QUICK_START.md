# 🚀 Quick Start - Lucy3000

Guía rápida para poner en marcha Lucy3000 en menos de 10 minutos.

## ⚡ Inicio Rápido (3 pasos)

### 1️⃣ Instalar Dependencias

```bash
npm install
```

### 2️⃣ Configurar SQLite local

**Opción A: Entorno listo**
```bash
npm run prisma:generate
```

**Opción B: Reinicializar esquema local**
1. Copiar `.env.example` a `.env`
2. Confirmar `DATABASE_URL="file:./prisma/lucy3000.db"` (Prisma la resolverá en disco como `prisma/prisma/lucy3000.db`)
3. Ejecutar:
```bash
npx prisma db push
```

### 3️⃣ Crear Usuario Admin

Usar Prisma Studio para crear el primer usuario si la base local está vacía:
```bash
npm run prisma:studio
```

Si estás restaurando un entorno PostgreSQL/Supabase histórico, consulta `BACKUP_RESTORE.md`.

## 🎯 Iniciar Aplicación

```bash
npm run dev
```

Esto iniciará:
- ✅ Backend en `http://localhost:3001`
- ✅ Frontend en ventana de Electron

## 🔑 Credenciales de Prueba

```
Email: admin@lucy3000.com
Password: lucy3000
```

## 📋 Checklist de Verificación

- [ ] Node.js 18+ instalado
- [ ] Dependencias instaladas (`npm install`)
- [ ] Base de datos local disponible
- [ ] Archivo `.env` configurado
- [ ] Migraciones ejecutadas
- [ ] Usuario admin creado
- [ ] Aplicación iniciada (`npm run dev`)
- [ ] Login exitoso

## 🐛 Problemas Comunes

### Error: "Cannot find module"
```bash
npm install
```

### Error: "Database connection failed"
- Verificar `DATABASE_URL` en `.env`
- Comprobar que `prisma/prisma/lucy3000.db` exista y sea escribible

### Error: "Invalid credentials"
- Verificar que el usuario admin se creó correctamente
- Usar las credenciales correctas

### Puerto 3001 en uso
Cambiar PORT en `.env`:
```env
PORT=3002
```

## 📚 Siguiente Paso

Una vez que la aplicación esté funcionando:

1. **Explorar el Dashboard**: Ver estadísticas y gráficos
2. **Crear Clientes**: Ir a Clientes > Nuevo Cliente
3. **Agregar Servicios**: Configurar tus tratamientos
4. **Registrar Productos**: Gestionar tu inventario
5. **Hacer una Venta**: Probar el punto de venta

## 🎓 Recursos

- [README Completo](README.md) - Documentación detallada
- [Guía de Deployment](DEPLOYMENT.md) - Subir a producción
- [Roadmap](ROADMAP.md) - Estado real y próximos pasos
- [Backup y Restauración](BACKUP_RESTORE.md) - Recuperación de base de datos

## 💡 Consejos

- **Usa Prisma Studio** para ver/editar datos: `npm run prisma:studio`
- **Revisa los logs** en la terminal para debugging
- **Modo oscuro** disponible en el navbar
- **Notificaciones** en tiempo real en el navbar

## 🆘 Ayuda

Si tienes problemas:
1. Revisar logs en la terminal
2. Verificar archivo `.env`
3. Consultar sección de troubleshooting en README.md
4. Contactar: sergiohernandezlara07@gmail.com

---

**¡Listo para empezar! 🎉**

Tu sistema de gestión Lucy3000 está configurado y funcionando.

