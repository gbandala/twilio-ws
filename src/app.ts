import express, { Application } from 'express';
import { Request, Response } from 'express';
import { twiml } from 'twilio';
import * as expressWsModule from 'express-ws';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import Database from "./libs/database";
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';
import WebSocketManagerService from './services/wsManagerService';
import logger from '../src/utils/logger';

// Cargar variables de entorno
config();

/**
 * Clase principal de la aplicación Express
 */
class App {
  public app: Application;
  private wsInstance: any;
  private initialized: boolean = false;

  constructor() {
    const expressApp = express();
    this.wsInstance = expressWsModule.default(expressApp);
    this.app = this.wsInstance.app;
    
    // **ORDEN CRÍTICO**: 
    // 1. Middlewares básicos
    this.configureMiddlewares();
    // 2. Rutas específicas (sin catch-all)
    this.configureBasicRoutes();
    // 3. Base de datos
    this.databaseSync();
    // 4. NO configurar error handling aún - se hace después de Twilio routes
  }

  /**
   * **NUEVO**: Método para inicialización async completa
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('🚀 Inicializando aplicación...');
      
      // **PASO 1**: Inicializar WebSockets PRIMERO
      console.log('🔧 Inicializando WebSockets...');
      await WebSocketManagerService.initializeWebSockets(this.wsInstance);
      console.log('✅ WebSockets inicializados correctamente');
      
      // **PASO 2**: Configurar rutas que dependen de WebSocket
      this.configureTwilioRoutes();
      console.log('✅ Rutas de Twilio configuradas');
      
      // **PASO 3**: Configurar manejo de errores AL FINAL
      console.log('🛡️ Configurando manejo de errores...');
      this.configureErrorHandling();
      console.log('✅ Manejo de errores configurado');
      
      this.initialized = true;
      console.log('✅ Aplicación inicializada completamente');
      
    } catch (error) {
      console.error('❌ Error inicializando aplicación:', error);
      throw error;
    }
  }

  /**
   * Configura los middlewares de la aplicación
   */
  private configureMiddlewares(): void {
    // Habilitar CORS
    this.app.use(cors());
    // Mejorar seguridad HTTP
    this.app.use(helmet());
    // Parsear datos codificados en URL
    this.app.use(express.urlencoded({ extended: false }));
    // Parsear JSON en las solicitudes
    this.app.use(express.json());
    // Logging de solicitudes HTTP
    this.app.use(morgan('dev'));
  }

  /**
   * Configura rutas básicas (que no dependen de WebSocket)
   */
  private configureBasicRoutes(): void {
    // **IMPORTANTE**: Solo rutas específicas, NO usar '/' catch-all aún
    
    // Ruta de salud
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: process.env.SERVER,
        websocket_initialized: this.initialized
      });
    });

    // Endpoint de debug para verificar rutas
    this.app.get('/debug/routes', (req: Request, res: Response) => {
      const allRoutes = this.app._router.stack
        .filter((r: any) => r.route)
        .map((r: any) => ({
          method: Object.keys(r.route.methods).join(',').toUpperCase(),
          path: r.route.path
        }));
      
      res.json({
        message: 'Rutas registradas',
        routes: allRoutes,
        server: process.env.SERVER,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * **NUEVO**: Configura rutas específicas de Twilio (después de WebSocket)
   */
  private configureTwilioRoutes(): void {
    console.log('📞 Configurando rutas de Twilio...');

    // Endpoint principal para todas las llamadas
    this.app.post('/incoming', (req: Request, res: Response) => {
      try {
        const fromNumber = req.body.From;
        const toNumber = req.body.To;
        const callSid = req.body.CallSid;

        logger.info(`📞 Llamada entrante: ${fromNumber} -> ${toNumber}, CallSid: ${callSid}`);

        const VoiceResponse = twiml.VoiceResponse;
        const response = new VoiceResponse();
        
        // Mensaje inicial
        response.say({ language: 'es-MX' }, 'Conectando la llamada...');
        
        const connect = response.connect();
        const stream = connect.stream({
          url: `wss://${process.env.SERVER}/connection`
        });

        // Parámetros personalizados
        stream.parameter({ name: 'phoneNumber', value: toNumber });
        stream.parameter({ name: 'callerNumber', value: fromNumber });
        stream.parameter({ name: 'callSid', value: callSid });

        res.type('text/xml');
        res.end(response.toString());

        logger.debug(`📋 TwiML enviado para ${toNumber}`);

      } catch (err) {
        logger.error('❌ Error en /incoming:', err);
        res.status(500).send('Error interno del servidor');
      }
    });

    // Endpoint específico por número (mantener compatibilidad)
    this.app.post('/incoming/:phoneNumber', (req: Request, res: Response) => {
      try {
        const phoneNumber = req.params.phoneNumber;
        const fromNumber = req.body.From;
        const callSid = req.body.CallSid;

        logger.info(`📞 Llamada específica: ${fromNumber} -> ${phoneNumber}, CallSid: ${callSid}`);

        const VoiceResponse = twiml.VoiceResponse;
        const response = new VoiceResponse();
        
        response.say({ language: 'es-MX' }, 'Conectando la llamada...');
        
        const connect = response.connect();
        const stream = connect.stream({
          url: `wss://${process.env.SERVER}/connection`
        });

        stream.parameter({ name: 'phoneNumber', value: phoneNumber });
        stream.parameter({ name: 'callerNumber', value: fromNumber });
        stream.parameter({ name: 'callSid', value: callSid });

        res.type('text/xml');
        res.end(response.toString());

      } catch (err) {
        logger.error(`❌ Error en /incoming/${req.params.phoneNumber}:`, err);
        res.status(500).send('Error interno del servidor');
      }
    });

    console.log('✅ Rutas de Twilio configuradas');
  }

  /**
   * Inicializa la conexión a la base de datos
   */
  protected databaseSync(): void {
    const db = new Database();
    db.sequelize?.authenticate();
  }

  /**
   * Configura el manejo de errores
   */
  private configureErrorHandling(): void {
    // Manejador de rutas no encontradas
    this.app.use(notFoundHandler);
    // Manejador global de errores
    this.app.use(errorHandler);
  }

  /**
   * **NUEVO**: Método para iniciar el servidor
   */
  public async startServer(port: number = 8000): Promise<void> {
    try {
      // Primero inicializar todo
      await this.initialize();
      
      // Luego iniciar el servidor
      this.app.listen(port, () => {
        console.log(`🌟 Servidor corriendo en puerto ${port}`);
        console.log(`🔗 Webhook URL: https://${process.env.SERVER}/incoming`);
        console.log(`🔗 WebSocket URL: wss://${process.env.SERVER}/connection`);
        console.log(`🩺 Health check: https://${process.env.SERVER}/health`);
      });

    } catch (error) {
      console.error('❌ Error iniciando servidor:', error);
      process.exit(1);
    }
  }
}

// **CAMBIO CRÍTICO**: Crear instancia pero no exportar aún
const appInstance = new App();

export default appInstance;