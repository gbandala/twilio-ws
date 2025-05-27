#!/usr/bin/env node

/**
 * Servidor principal - Punto de entrada de la aplicación
 */

import appInstance from './app';
import logger from './utils/logger';

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
    logger.error('❌ Error fatal al iniciar servidor:', error);
    console.error('💥 El servidor no pudo iniciarse. Revisa la configuración.');
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('💥 Unhandled Promise Rejection. El servidor se cerrará.');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', error);
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
// import app from './app';
// import 'dotenv/config';
// import 'colors';
// import logger from './utils/logger';
// // Obtener puerto de .env o usar 8000 como predeterminado
// const PORT = +(process.env.PORT || '8000');

// // Función para iniciar el servidor
// const startServer = () => {
//   try {
//     // Inicia el servidor
//     const server = app.listen(PORT, '0.0.0.0', () => {
//       logger.info(`Servidor ejecutándose en puerto ${PORT}`);
//     });

//     // Configurar manejo de cierre correcto
//     process.on('SIGINT', () => handleShutdown(server));
//     process.on('SIGTERM', () => handleShutdown(server));
    
//     return server;
//   } catch (error) {
//     console.error('Error al iniciar el servidor:', error);
//     process.exit(1);
//   }
// };

// // Función para manejar el cierre correcto del servidor
// const handleShutdown = (server: any) => {
//   console.log('\nCerrando servidor...'.yellow);
//   server.close(() => {
//     console.log('Servidor cerrado correctamente'.green);
//     process.exit(0);
//   });

//   // Si no se cierra después de 10 segundos, forzar cierre
//   setTimeout(() => {
//     console.error('No se pudo cerrar correctamente, forzando cierre'.red);
//     process.exit(1);
//   }, 10000);
// };

// // Manejo global de excepciones no controladas
// process.on('uncaughtException', (error) => {
//   console.error(`Excepción no controlada: ${error.message}`.red);
//   console.error(error.stack || '');
//   process.exit(1);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error(`Promesa rechazada no manejada: ${reason}`.red);
//   process.exit(1);
// });

// // Iniciar el servidor
// const server = startServer();

// export default server;