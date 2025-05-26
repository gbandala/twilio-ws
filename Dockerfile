FROM node:16-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json tsconfig.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src/ ./src/

# Compilar TypeScript a JavaScript
RUN npm run build

# Etapa de producción
FROM node:16-alpine

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Crear directorio para logs
RUN mkdir -p logs

# Copiar archivos compilados desde la etapa de builder
COPY --from=builder /app/dist ./dist

# Exponer el puerto que usará la aplicación (según .env)
EXPOSE 8000

# Establecer el comando para iniciar la aplicación
CMD ["node", "dist/server.js"]