# ✅ Configuración de Supabase Completada

## 🎉 ¡Archivo .env Creado!

Tu archivo `.env` ha sido configurado con las credenciales de Supabase.

## 📋 Próximos Pasos

### 1. Obtener el Service Key (Importante)

El `SUPABASE_SERVICE_KEY` necesita ser obtenido desde tu dashboard de Supabase:

1. Ve a tu proyecto en Supabase: https://app.supabase.com/project/lqlhhxhbgtfckbwtwazx
2. Ve a **Settings** > **API**
3. Busca la sección **Project API keys**
4. Copia el **service_role key** (¡NO el anon key!)
5. Reemplaza el valor de `SUPABASE_SERVICE_KEY` en el archivo `.env`

**⚠️ IMPORTANTE**: El service_role key es secreto y tiene permisos completos. Nunca lo compartas públicamente.

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Generar Cliente de Prisma

```bash
npm run prisma:generate
```

### 4. Ejecutar Migraciones

```bash
npm run prisma:migrate
```

Esto creará todas las tablas en tu base de datos de Supabase.

### 5. Crear Usuario Administrador

Opción A - Usando Prisma Studio (Recomendado):

```bash
npm run prisma:studio
```

Luego:
1. Abre la tabla `users`
2. Click en "Add record"
3. Completa los campos:
   - **email**: admin@lucy3000.com
   - **password**: $2a$10$YQiQVkMsSppeYkUlCuvIseZkNyGfqsgAOBSxiitW4gluuK2zp.W6e
   - **name**: Administrador
   - **role**: ADMIN
   - **isActive**: true
4. Guarda

Opción B - Usando SQL en Supabase:

1. Ve a tu proyecto en Supabase
2. Ve a **SQL Editor**
3. Copia y ejecuta el contenido de `scripts/create-admin.sql`

### 6. Iniciar la Aplicación

```bash
npm run dev
```

Esto iniciará:
- ✅ Backend en http://localhost:3001
- ✅ Aplicación Electron

### 7. Hacer Login

Usa estas credenciales:
- **Email**: admin@lucy3000.com
- **Password**: admin123

## 🔐 Credenciales Configuradas

```
Database URL: ✅ Configurada
Supabase URL: ✅ Configurada
Anon Key: ✅ Configurada
Service Key: ⚠️ Necesita actualización manual
JWT Secret: ✅ Generado automáticamente
```

## 📊 Tu Configuración

```
Project: sergio.hlara84@gmail.com's Project
Region: EU West (Ireland)
Database: PostgreSQL
Connection: Session Pooler
```

## 🐛 Solución de Problemas

### Error: "Invalid API key"
- Verifica que copiaste correctamente el SUPABASE_SERVICE_KEY
- Asegúrate de usar el service_role key, no el anon key

### Error: "Connection refused"
- Verifica que la DATABASE_URL sea correcta
- Comprueba que tu proyecto de Supabase esté activo

### Error: "Prisma Client not generated"
- Ejecuta: `npm run prisma:generate`

### Error: "Table does not exist"
- Ejecuta: `npm run prisma:migrate`

## 📝 Notas Importantes

1. **Seguridad**: 
   - El archivo `.env` está en `.gitignore` y no se subirá a GitHub
   - Nunca compartas tus claves públicamente
   - Cambia el JWT_SECRET en producción

2. **Base de Datos**:
   - Todas las tablas se crearán automáticamente con las migraciones
   - Los datos se almacenan en Supabase (cloud)
   - Puedes ver/editar datos en Supabase Dashboard o Prisma Studio

3. **Desarrollo**:
   - El backend corre en puerto 3001
   - Puedes cambiar el puerto en `.env` si está ocupado
   - Los logs aparecen en la terminal

## 🎯 Checklist Rápido

- [ ] Obtener y configurar SUPABASE_SERVICE_KEY
- [ ] Ejecutar `npm install`
- [ ] Ejecutar `npm run prisma:generate`
- [ ] Ejecutar `npm run prisma:migrate`
- [ ] Crear usuario admin
- [ ] Ejecutar `npm run dev`
- [ ] Hacer login con admin@lucy3000.com / admin123

## 🚀 ¡Listo!

Una vez completados estos pasos, tu aplicación Lucy3000 estará completamente funcional y lista para usar.

---

**Siguiente paso**: Ejecuta `npm install` para instalar todas las dependencias.

