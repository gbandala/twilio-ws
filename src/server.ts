#!/usr/bin/env node

/**
 * Servidor principal - Punto de entrada de la aplicación
 */

import appInstance from './app';
import  { logger } from '../src/utils/logger';

// Configuración del puerto
const PORT = parseInt(process.env.PORT || '8000', 10);

/**
 * Función principal para iniciar la aplicación
 */
async function main() {
  try {
    console.log('🚀 Iniciando servidor...');
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Dominio: ${process.env.SERVER || 'localhost'}`);
    
    // **CRÍTICO**: Inicializar aplicación con async/await
    await appInstance.startServer(PORT);
    
  } catch (error) {
    logger.critical('error','❌ Error fatal al iniciar servidor:', error);
    console.error('💥 El servidor no pudo iniciarse. Revisa la configuración.');
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  logger.critical('error','❌ Unhandled Rejection at:', reason);
  console.error('💥 Unhandled Promise Rejection. El servidor se cerrará.');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.critical('error','❌ Uncaught Exception:', error);
  console.error('💥 Uncaught Exception. El servidor se cerrará.');
  process.exit(1);
});

// Manejo de señales del sistema
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM recibido. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT recibido. Cerrando servidor...');
  process.exit(0);
});

// Iniciar la aplicación
main();
