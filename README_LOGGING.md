# 🔧 Sistema de Logging Optimizado - Guía de Implementación

## 🎯 Problema Resuelto
- **Antes**: Miles de logs repetitivos `Enviando audio a transcripción...`
- **Ahora**: Logs inteligentes y controlables por nivel

## 📁 Archivos a Crear/Modificar

### 1. **Crear**: `src/utils/optimizedLogger.ts`
- Logger inteligente con niveles y throttling
- Reduce logs repetitivos automáticamente
- Configurable por variables de entorno

### 2. **Reemplazar**: `src/services/wsManagerService.ts` 
- Usa el nuevo logger optimizado
- Logs organizados por importancia
- Estadísticas automáticas de llamadas

### 3. **Modificar**: `src/app.ts`
- Agregar endpoints de debug y control
- Importar el logger optimizado

### 4. **Actualizar**: `.env`
- Variable `LOG_LEVEL` para controlar verbosidad

## 🎛️ Niveles de Logging

### `LOG_LEVEL=CRITICAL` (Producción)
```bash
🚨 [conn_xxx] Error en WebSocket: Connection refused
✅ [conn_xxx] Nueva conexión WebSocket establecida  
✅ [conn_xxx] Stream completamente configurado
📋 [conn_xxx] RESUMEN LLAMADA (45s): 2,341 audio, 8 transcripciones, 7 interacciones
```

### `LOG_LEVEL=IMPORTANT` (Recomendado)
```bash
✅ [conn_xxx] Nueva conexión WebSocket establecida
✅ [conn_xxx] Configuración cargada para +5255960230
🎯 [conn_xxx] TRANSCRIPCIÓN #1: "Hello, I need help with my car"
🤖 [conn_xxx] GPT Response #1: "Hello! I'd be happy to help with your car. What seems to be the issue?"
📊 [conn_xxx] Progreso: 500 audio, 1 transcripciones, 1 interacciones
```

### `LOG_LEVEL=DETAILED` (Development)
```bash
# Todo lo anterior PLUS:
🔧 [conn_xxx] Enviando mensaje de bienvenida
🔧 [conn_xxx] Event listeners configurados
🔊 [conn_xxx] TTS completado: 4,512 bytes - tts_12345
📻 [conn_xxx] Audio enviado a Twilio: mark_67890
🏁 [conn_xxx] Mark completado: welcome_abc123
```

### `LOG_LEVEL=VERBOSE` (Debug Profundo)
```bash
# Todo lo anterior PLUS:
💬 [conn_xxx] Evento: media
💭 [conn_xxx] Transcripción parcial: "Hello I need..."
💬 [conn_xxx] Audio buffereado para envío
```

## 🚀 Implementación Paso a Paso

### **PASO 1**: Crear el Logger Optimizado
```bash
mkdir -p src/utils
# Copiar el código de optimizedLogger.ts
```

### **PASO 2**: Actualizar wsManagerService
```bash
# Reemplazar tu wsManagerService.ts con la versión optimizada
```

### **PASO 3**: Agregar Endpoints a app.ts
```typescript
// En configureBasicRoutes(), agregar los endpoints de logging
```

### **PASO 4**: Configurar Variables de Entorno
```bash
# En tu .env
LOG_LEVEL=IMPORTANT  # Para uso normal
# LOG_LEVEL=DETAILED  # Para debugging
# LOG_LEVEL=CRITICAL  # Para producción
```

### **PASO 5**: Probar el Sistema
```bash
npm start

# En otra terminal:
curl https://tu-server/debug/logging
curl https://tu-server/debug/websockets/summary
```

## 📊 Endpoints de Control

### Ver Estado del Logging
```bash
GET /debug/logging
```
```json
{
  "success": true,
  "logging": {
    "currentLevel": "IMPORTANT",
    "throttledMessages": 3,
    "description": {
      "CRITICAL": "Solo errores y eventos críticos",
      "IMPORTANT": "Transcripciones, GPT, conexiones (recomendado)"
    }
  }
}
```

### Cambiar Nivel Dinámicamente
```bash
POST /debug/logging/level
Content-Type: application/json

{"level": "DETAILED"}
```

### Ver Resumen de Conexiones
```bash
GET /debug/websockets/summary
```
```json
{
  "summary": {
    "totalConnections": 2,
    "totalAudioPackets": 4582,
    "totalTranscriptions": 12,
    "totalInteractions": 11,
    "avgDuration": 67
  }
}
```

## 🎯 Casos de Uso

### **Desarrollo Local**
```bash
LOG_LEVEL=DETAILED
```
- Ves transcripciones completas
- Debug de audio y marks
- Estadísticas cada 30 segundos

### **Testing/Staging**  
```bash
LOG_LEVEL=IMPORTANT
```
- Eventos importantes sin spam
- Ideal para verificar funcionamiento
- Balance entre información y limpieza

### **Producción**
```bash
LOG_LEVEL=CRITICAL
```
- Solo errores y eventos críticos
- Logs mínimos para performance
- Resúmenes de llamadas terminadas

### **Debug de Problemas**
```bash
LOG_LEVEL=VERBOSE
```
- Todo el detalle posible
- Usar solo temporalmente
- Para investigar bugs específicos

## 🛠️ Control Dinámico

### Cambiar Nivel Sin Reiniciar
```bash
# Durante una llamada activa, cambiar a debug detallado:
curl -X POST https://tu-server/debug/logging/level \
  -H "Content-Type: application/json" \
  -d '{"level": "DETAILED"}'

# Después del debug, volver a normal:
curl -X POST https://tu-server/debug/logging/level \
  -H "Content-Type: application/json" \
  -d '{"level": "IMPORTANT"}'
```

### Monitoreo de Conexiones Activas
```bash
# Ver todas las conexiones activas:
curl https://tu-server/debug/websockets/summary

# Ver detalles de una conexión específica:
curl https://tu-server/debug/connection/conn_1748380847804_452d0ddwz
```

## 🔍 Troubleshooting

### Si no ves transcripciones pero sí audio:
```bash
# Cambiar a verbose temporalmente
curl -X POST localhost:8000/debug/logging/level -d '{"level":"VERBOSE"}'

# Ver si llegan eventos de media
# Si sí llegan pero no transcripciones -> problema Deepgram
# Si no llegan eventos -> problema WebSocket
```

### Si el TTS no responde:
```bash
# Ver endpoints de test de servicios
curl localhost:8000/debug/services/test

# Ver si las keys están configuradas
```

### Performance en Producción:
```bash
# Usar nivel CRITICAL y monitorear con endpoints
LOG_LEVEL=CRITICAL

# Endpoint de resumen no genera logs extra
curl https://tu-server/debug/websockets/summary
```

## ✅ Resultado Final

**Antes (logs spam):**
```
[conn_xxx] Enviando audio a transcripción...
[conn_xxx] Enviando audio a transcripción... 
[conn_xxx] Enviando audio a transcripción...
[conn_xxx] Enviando audio a transcripción...
[conn_xxx] Enviando audio a transcripción...
# x 2000 líneas
```

**Ahora (logs inteligentes):**
```
✅ [conn_xxx] Configuración cargada para +5255960230
📊 [conn_xxx] Progreso: 500 audio, 1 transcripciones, 1 interacciones  
🎯 [conn_xxx] TRANSCRIPCIÓN #1: "Hello, I need help"
🤖 [conn_xxx] GPT Response #1: "I'd be happy to help!"
📋 [conn_xxx] RESUMEN LLAMADA (67s): 2,341 audio, 3 transcripciones, 3 interacciones
```

**Beneficios:**
- 🎯 **95% menos logs** en modo IMPORTANT
- 🔧 **Control dinámico** sin reiniciar
- 📊 **Estadísticas automáticas** de llamadas  
- 🚨 **Alertas inteligentes** de problemas
- ⚡ **Mejor performance** en producción