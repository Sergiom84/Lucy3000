# 🤝 Guía de Contribución - Lucy3000

¡Gracias por tu interés en contribuir a Lucy3000! Esta guía te ayudará a empezar.

## 📋 Tabla de Contenidos

1. [Código de Conducta](#código-de-conducta)
2. [Cómo Contribuir](#cómo-contribuir)
3. [Configuración del Entorno](#configuración-del-entorno)
4. [Estándares de Código](#estándares-de-código)
5. [Proceso de Pull Request](#proceso-de-pull-request)
6. [Reportar Bugs](#reportar-bugs)
7. [Sugerir Mejoras](#sugerir-mejoras)

## 📜 Código de Conducta

### Nuestro Compromiso

Nos comprometemos a hacer de la participación en este proyecto una experiencia libre de acoso para todos, independientemente de:
- Edad
- Tamaño corporal
- Discapacidad
- Etnia
- Identidad y expresión de género
- Nivel de experiencia
- Nacionalidad
- Apariencia personal
- Raza
- Religión
- Identidad y orientación sexual

### Comportamiento Esperado

- Usar lenguaje acogedor e inclusivo
- Respetar diferentes puntos de vista
- Aceptar críticas constructivas
- Enfocarse en lo mejor para la comunidad
- Mostrar empatía hacia otros miembros

### Comportamiento Inaceptable

- Uso de lenguaje o imágenes sexualizadas
- Trolling, comentarios insultantes o despectivos
- Acoso público o privado
- Publicar información privada de otros
- Conducta inapropiada en un entorno profesional

## 🚀 Cómo Contribuir

### Tipos de Contribuciones

Aceptamos varios tipos de contribuciones:

1. **Código**
   - Nuevas funcionalidades
   - Corrección de bugs
   - Mejoras de rendimiento
   - Refactorización

2. **Documentación**
   - Mejorar README
   - Agregar ejemplos
   - Traducir documentación
   - Corregir typos

3. **Diseño**
   - Mejorar UI/UX
   - Crear iconos
   - Diseñar mockups

4. **Testing**
   - Escribir tests
   - Reportar bugs
   - Validar funcionalidades

5. **Comunidad**
   - Responder preguntas
   - Ayudar a otros usuarios
   - Compartir el proyecto

## 🛠️ Configuración del Entorno

### Prerrequisitos

- Node.js 18+
- npm o yarn
- Git
- Cuenta de Supabase
- Editor de código (VS Code recomendado)

### Setup Inicial

1. **Fork el repositorio**
```bash
# En GitHub, click en "Fork"
```

2. **Clonar tu fork**
```bash
git clone https://github.com/TU_USUARIO/Lucy3000.git
cd Lucy3000
```

3. **Agregar upstream**
```bash
git remote add upstream https://github.com/ORIGINAL_OWNER/Lucy3000.git
```

4. **Instalar dependencias**
```bash
npm install
```

5. **Configurar entorno**
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

6. **Ejecutar migraciones**
```bash
npm run prisma:generate
npm run prisma:migrate
```

7. **Iniciar desarrollo**
```bash
npm run dev
```

### Mantener tu Fork Actualizado

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## 📝 Estándares de Código

### TypeScript

- Usar TypeScript para todo el código
- Definir tipos explícitos
- Evitar `any` cuando sea posible
- Usar interfaces para objetos complejos

```typescript
// ✅ Bien
interface User {
  id: string
  name: string
  email: string
}

const getUser = (id: string): Promise<User> => {
  // ...
}

// ❌ Mal
const getUser = (id: any): any => {
  // ...
}
```

### Nombres

- **Variables y funciones**: camelCase
- **Componentes**: PascalCase
- **Constantes**: UPPER_SNAKE_CASE
- **Archivos**: kebab-case o PascalCase (componentes)

```typescript
// Variables y funciones
const userName = 'John'
const getUserById = (id: string) => {}

// Componentes
const UserProfile = () => {}

// Constantes
const MAX_RETRIES = 3

// Archivos
user-profile.tsx
UserProfile.tsx
```

### Estructura de Componentes React

```typescript
import { useState, useEffect } from 'react'
import { SomeIcon } from 'lucide-react'

interface Props {
  title: string
  onSave: () => void
}

export default function MyComponent({ title, onSave }: Props) {
  // 1. Hooks
  const [data, setData] = useState<string>('')

  // 2. Effects
  useEffect(() => {
    // ...
  }, [])

  // 3. Handlers
  const handleClick = () => {
    // ...
  }

  // 4. Render
  return (
    <div>
      <h1>{title}</h1>
      <button onClick={handleClick}>Save</button>
    </div>
  )
}
```

### Comentarios

- Comentar código complejo
- Usar JSDoc para funciones públicas
- Evitar comentarios obvios

```typescript
/**
 * Calcula el total de una venta incluyendo descuentos e impuestos
 * @param subtotal - Subtotal de la venta
 * @param discount - Descuento a aplicar
 * @param tax - Impuesto a aplicar
 * @returns Total calculado
 */
const calculateTotal = (
  subtotal: number,
  discount: number,
  tax: number
): number => {
  return subtotal - discount + tax
}
```

### Commits

Usar [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Formato
<type>(<scope>): <subject>

# Tipos
feat:     Nueva funcionalidad
fix:      Corrección de bug
docs:     Cambios en documentación
style:    Formato, punto y coma, etc.
refactor: Refactorización de código
test:     Agregar o modificar tests
chore:    Tareas de mantenimiento

# Ejemplos
feat(clients): add birthday notifications
fix(sales): correct total calculation
docs(readme): update installation steps
style(dashboard): improve card spacing
refactor(api): simplify error handling
test(auth): add login tests
chore(deps): update dependencies
```

## 🔄 Proceso de Pull Request

### Antes de Crear un PR

1. **Crear una rama**
```bash
git checkout -b feature/mi-nueva-funcionalidad
# o
git checkout -b fix/correccion-de-bug
```

2. **Hacer cambios**
- Seguir estándares de código
- Agregar tests si es necesario
- Actualizar documentación

3. **Commit**
```bash
git add .
git commit -m "feat(scope): descripción clara"
```

4. **Push**
```bash
git push origin feature/mi-nueva-funcionalidad
```

### Crear el Pull Request

1. Ir a GitHub y crear PR
2. Completar la plantilla:
   - Descripción clara de cambios
   - Issue relacionado (si existe)
   - Screenshots (si aplica)
   - Checklist completado

3. Esperar revisión

### Plantilla de PR

```markdown
## Descripción
Breve descripción de los cambios

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva funcionalidad
- [ ] Breaking change
- [ ] Documentación

## ¿Cómo se ha probado?
Describe las pruebas realizadas

## Checklist
- [ ] Mi código sigue los estándares del proyecto
- [ ] He realizado una auto-revisión
- [ ] He comentado código complejo
- [ ] He actualizado la documentación
- [ ] Mis cambios no generan warnings
- [ ] He agregado tests
- [ ] Los tests pasan localmente
```

### Revisión de Código

- Responder a comentarios
- Hacer cambios solicitados
- Mantener conversación constructiva
- Agradecer feedback

## 🐛 Reportar Bugs

### Antes de Reportar

1. Buscar en issues existentes
2. Verificar que sea reproducible
3. Probar en última versión

### Crear Issue de Bug

```markdown
**Descripción del Bug**
Descripción clara y concisa

**Para Reproducir**
1. Ir a '...'
2. Click en '...'
3. Ver error

**Comportamiento Esperado**
Lo que debería pasar

**Screenshots**
Si aplica

**Entorno**
- OS: [e.g. Windows 11]
- Node: [e.g. 18.0.0]
- Versión: [e.g. 1.0.0]

**Contexto Adicional**
Cualquier otra información relevante
```

## 💡 Sugerir Mejoras

### Crear Issue de Feature

```markdown
**¿Tu solicitud está relacionada con un problema?**
Descripción clara del problema

**Describe la solución que te gustaría**
Descripción clara de lo que quieres

**Describe alternativas consideradas**
Otras soluciones que consideraste

**Contexto Adicional**
Screenshots, mockups, etc.
```

## 🎯 Áreas que Necesitan Ayuda

### Alta Prioridad
- [ ] Tests unitarios
- [ ] Tests E2E
- [ ] Documentación de API
- [ ] Traducción a inglés

### Media Prioridad
- [ ] Calendario interactivo
- [ ] Generación de PDFs
- [ ] Exportación a Excel
- [ ] Mejoras de UI/UX

### Baja Prioridad
- [ ] Temas personalizables
- [ ] Atajos de teclado
- [ ] Modo offline
- [ ] App móvil

## 📚 Recursos

### Documentación
- [README.md](README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [ROADMAP.md](ROADMAP.md)

### Tecnologías
- [React](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Electron](https://www.electronjs.org)
- [Prisma](https://www.prisma.io)
- [Tailwind CSS](https://tailwindcss.com)

### Comunidad
- GitHub Issues
- GitHub Discussions
- Email: sergiohernandezlara07@gmail.com

## ❓ Preguntas

Si tienes preguntas:
1. Revisar documentación
2. Buscar en issues
3. Crear un issue con la etiqueta "question"
4. Contactar por email

## 🙏 Agradecimientos

Gracias a todos los contribuidores que hacen posible este proyecto.

---

**¡Feliz contribución! 🎉**

