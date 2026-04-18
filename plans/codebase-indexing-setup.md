# Configuración de Codebase Indexing en Roo Code

## ✅ Estado: CONFIGURADO Y FUNCIONANDO

Fecha de configuración: 13/03/2026

---

## Resumen de la configuración

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| **Qdrant** | `C:\Users\sergi\qdrant\qdrant.exe` | ✅ Funcionando en puerto 6333 |
| **Ollama** | `http://localhost:11434` | ✅ Funcionando |
| **Modelo embeddings** | `nomic-embed-text` | ✅ Descargado |

---

## Inicio automático ✅ CONFIGURADO

Qdrant está configurado para iniciarse automáticamente con Windows.

**Ubicación del acceso directo:**
```
C:\Users\sergi\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Qdrant.lnk
```

**Si necesitas iniciarlo manualmente:**
```powershell
# Opción 1: Ventana visible (puedes ver logs)
C:\Users\sergi\qdrant\qdrant.exe

# Opción 2: En segundo plano
powershell -Command "Start-Process -FilePath 'C:\Users\sergi\qdrant\qdrant.exe' -WorkingDirectory 'C:\Users\sergi\qdrant'"
```

---

## Configuración de Roo Code

| Campo | Valor |
|-------|-------|
| Embedder Provider | Ollama |
| Ollama Base URL | http://localhost:11434 |
| Model | nomic-embed-text |
| Model Dimension | 1536 (o 768 según el modelo) |
| Qdrant URL | http://localhost:6333 |

---

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Tu código     │────▶│  Ollama         │────▶│  Qdrant         │
│   (archivos)    │     │  (embeddings)   │     │  (almacenamiento)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  Roo Code       │
                                                │  (búsqueda)     │
                                                └─────────────────┘
```

---

## Instrucciones originales (referencia)

### Paso 0: Instalar Qdrant Standalone (sin Docker)

#### 0.1 Descargar Qdrant
Ve a https://github.com/qdrant/qdrant/releases y descarga la versión para Windows:
- Busca `qdrant-x86_64-pc-windows-msvc.zip` (o similar)

#### 0.2 Extraer y ejecutar
```powershell
# Extraer el ZIP en una carpeta, por ejemplo:
# C:\Tools\qdrant\

# Ejecutar Qdrant (desde la carpeta donde lo extrajiste)
cd C:\Tools\qdrant
.\qdrant.exe
```

#### 0.3 Verificar que Qdrant está corriendo
Abre otra terminal y ejecuta:
```powershell
# Debería devolver información del servidor
curl http://localhost:6333
```

#### 0.4 (Opcional) Ejecutar Qdrant en segundo plano
Para no tener la terminal abierta:
```powershell
# Iniciar en background
Start-Process -FilePath ".\qdrant.exe" -WindowStyle Hidden
```

---

## Paso 1: Configurar Ollama con modelo de embeddings

### 1.1 Verificar que Ollama está funcionando
```powershell
# Verificar instalación
ollama --version

# Ver modelos instalados
ollama list
```

### 1.2 Instalar modelo de embeddings
Los modelos de embeddings son diferentes a los LLMs. Son más ligeros y especializados en convertir texto en vectores.

```powershell
# Recomendado: nomic-embed-text (ligero y efectivo, 274MB)
ollama pull nomic-embed-text

# Alternativa: all-minilm (más pequeño, ~45MB)
ollama pull all-minilm

# Alternativa: mxbai-embed-large (más preciso, 670MB)
ollama pull mxbai-embed-large
```

### 1.3 Verificar que el servidor Ollama está corriendo
```powershell
# Ollama suele correr en http://localhost:11434
# Puedes verificar con:
curl http://localhost:11434/api/tags
```

---

## Paso 2: Configurar Roo Code

### 2.1 Abrir configuración de Roo Code
1. En VSCode, abre el panel de Roo Code (icono en la barra lateral)
2. Busca el icono de engranaje ⚙️ o el botón de configuración
3. Busca la sección **Codebase Indexing** o **RAG Settings**

### 2.2 Configurar proveedor de embeddings
En la configuración de Roo Code:

| Opción | Valor recomendado |
|--------|-------------------|
| **Embedding Provider** | Ollama |
| **Embedding Model** | nomic-embed-text |
| **Ollama Base URL** | http://localhost:11434 |
| **Max Index Size** | Según tu RAM (ej: 1000 archivos) |

### 2.3 Activar indexación
1. Busca el toggle **Enable Codebase Indexing**
2. Actívalo
3. Selecciona qué carpetas indexar (ej: `src/`, `prisma/`)
4. Excluye carpetas innecesarias: `node_modules/`, `dist/`, `.git/`

---

## Paso 3: Verificar funcionamiento

### 3.1 Comprobar que se creó el índice
- Roo Code suele crear una carpeta `.roo-code` o similar en tu proyecto
- Puede tardar unos minutos en indexar todo el código

### 3.2 Probar búsqueda semántica
En Roo Code, haz una pregunta que requiera contexto del código:
```
¿Dónde se define la autenticación en Lucy3000?
¿Cómo funciona el sistema de citas?
```

---

## Alternativa: LM Studio

Si prefieres LM Studio:

1. Abre LM Studio
2. Ve a la pestaña **Local Server**
3. Inicia el servidor (puerto por defecto: 1234)
4. Carga un modelo de embeddings compatible
5. En Roo Code, configura:
   - **Embedding Provider**: OpenAI Compatible
   - **Base URL**: http://localhost:1234/v1
   - **Model**: nombre del modelo cargado

---

## Recomendaciones

### Modelo de embeddings recomendado
| Modelo | Tamaño | Velocidad | Precisión |
|--------|--------|-----------|-----------|
| nomic-embed-text | 274MB | ⚡⚡⚡ | ⭐⭐⭐ |
| all-minilm | 45MB | ⚡⚡⚡⚡ | ⭐⭐ |
| mxbai-embed-large | 670MB | ⚡⚡ | ⭐⭐⭐⭐ |

### Carpetas a indexar en Lucy3000
```
✅ src/backend/       # Lógica del servidor
✅ src/renderer/      # UI React
✅ prisma/            # Esquemas de BD
✅ *.md               # Documentación
❌ node_modules/      # Dependencias
❌ dist/              # Código compilado
❌ release/           # Builds
```

---

## Resumen

**No necesitas:**
- ❌ Docker
- ❌ Qdrant
- ❌ Configuración compleja

**Sí necesitas:**
- ✅ Ollama con un modelo de embeddings
- ✅ Activar codebase indexing en Roo Code
- ✅ Seleccionar las carpetas correctas

La indexación se gestiona internamente por Roo Code usando una base de datos vectorial ligera (generalmente sqlite-vec o similar).
