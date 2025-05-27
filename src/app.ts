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
import { logger, LogLevel } from '../src/utils/logger';

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

    // Agrega estos endpoints en tu app.ts, en el método configureBasicRoutes()

    // Endpoint para ver estado de WebSockets
    this.app.get('/debug/websockets', (req: Request, res: Response) => {
      try {
        const status = WebSocketManagerService.getStatus();
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          data: status
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Endpoint para debug específico de una conexión
    this.app.get('/debug/connection/:connectionId', (req: Request, res: Response) => {
      try {
        const connectionId = req.params.connectionId;
        const debug = WebSocketManagerService.getConnectionDebug(connectionId);

        if (!debug) {
          return res.status(404).json({
            success: false,
            message: 'Conexión no encontrada'
          });
        }

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          data: debug
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Endpoint para test de conectividad con servicios
    this.app.get('/debug/services', async (req: Request, res: Response) => {
      try {
        // Test Deepgram API
        const testApiKey = process.env.DEEPGRAM_API_KEY ? 'Configurada' : 'NO CONFIGURADA';
        const testVoiceModel = process.env.VOICE_MODEL || 'No configurado';

        // Test OpenAI
        const testOpenAI = process.env.OPENAI_API_KEY ? 'Configurada' : 'NO CONFIGURADA';

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          environment: {
            DEEPGRAM_API_KEY: testApiKey,
            VOICE_MODEL: testVoiceModel,
            OPENAI_API_KEY: testOpenAI,
            SERVER: process.env.SERVER || 'No configurado'
          },
          services: {
            websockets_initialized: this.initialized,
            server_running: true
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // === ENDPOINTS DE LOGGING ===

    // Obtener estado actual del logging
    this.app.get('/debug/logging', (req: Request, res: Response) => {
      try {
        const stats = logger.getStats();
        const connections = WebSocketManagerService.getStatus();

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          logging: {
            currentLevel: stats.currentLevel,
            availableLevels: ['CRITICAL', 'IMPORTANT', 'DETAILED', 'VERBOSE'],
            throttledMessages: stats.throttledMessages,
            description: {
              CRITICAL: 'Solo errores y eventos críticos',
              IMPORTANT: 'Transcripciones, GPT, conexiones (recomendado)',
              DETAILED: 'Incluye audio, marks, debug general',
              VERBOSE: 'Todo, incluyendo cada packet de audio'
            }
          },
          connections: connections,
          counters: stats.counters
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Cambiar nivel de logging dinámicamente
    this.app.post('/debug/logging/level', (req: Request, res: Response) => {
      try {
        const { level } = req.body;

        if (!level || !['CRITICAL', 'IMPORTANT', 'DETAILED', 'VERBOSE'].includes(level)) {
          return res.status(400).json({
            success: false,
            message: 'Nivel inválido. Usa: CRITICAL, IMPORTANT, DETAILED, VERBOSE'
          });
        }

        const logLevel = LogLevel[level as keyof typeof LogLevel];
        logger.setLevel(logLevel);

        res.json({
          success: true,
          message: `Nivel de logging cambiado a ${level}`,
          timestamp: new Date().toISOString(),
          newLevel: level
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Reset contadores de logging
    this.app.post('/debug/logging/reset', (req: Request, res: Response) => {
      try {
        logger.reset();
        res.json({
          success: true,
          message: 'Contadores de logging reseteados',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Estado de WebSockets con resumen
    this.app.get('/debug/websockets/summary', (req: Request, res: Response) => {
      try {
        const connections = WebSocketManagerService.getStatus();
        const summary = {
          totalConnections: connections.activeConnections,
          totalAudioPackets: connections.connections.reduce((sum, conn) => sum + conn.audioPackets, 0),
          totalTranscriptions: connections.connections.reduce((sum, conn) => sum + conn.transcriptions, 0),
          totalInteractions: connections.connections.reduce((sum, conn) => sum + conn.interactionCount, 0),
          avgDuration: connections.connections.length > 0
            ? Math.round(connections.connections.reduce((sum, conn) => sum + conn.duration, 0) / connections.connections.length)
            : 0,
          activePhones: [...new Set(connections.connections.map(c => c.phoneNumber))]
        };

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          summary,
          connections: connections.connections
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Debug específico de una conexión
    this.app.get('/debug/connection/:connectionId', (req: Request, res: Response) => {
      try {
        const connectionId = req.params.connectionId;
        const debug = WebSocketManagerService.getConnectionDebug(connectionId);

        if (!debug) {
          return res.status(404).json({
            success: false,
            message: 'Conexión no encontrada'
          });
        }

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          data: debug
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    // Test de servicios externos
    this.app.get('/debug/services/test', async (req: Request, res: Response) => {
      try {
        const tests = {
          deepgram: {
            apiKey: process.env.DEEPGRAM_API_KEY ? 'Configurada' : 'NO CONFIGURADA',
            voiceModel: process.env.VOICE_MODEL || 'No configurado'
          },
          openai: {
            apiKey: process.env.OPENAI_API_KEY ? 'Configurada' : 'NO CONFIGURADA'
          },
          twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID ? 'Configurado' : 'NO CONFIGURADO',
            authToken: process.env.TWILIO_AUTH_TOKEN ? 'Configurado' : 'NO CONFIGURADO'
          }
        };

        // Test básico de conectividad (opcional)
        // Aquí podrías hacer requests de prueba a los servicios

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          environment: {
            NODE_ENV: process.env.NODE_ENV,
            SERVER: process.env.SERVER,
            LOG_LEVEL: process.env.LOG_LEVEL || 'IMPORTANT'
          },
          services: tests,
          status: 'All services configured'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
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

        logger.important(callSid,`📞 Llamada entrante: ${fromNumber} -> ${toNumber}, CallSid: ${callSid}`);

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

        logger.important(toNumber,`📋 TwiML enviado para ${toNumber}`);

      } catch (err) {
        console.error(err,'❌ Error en /incoming:', err);
        res.status(500).send('Error interno del servidor');
      }
    });

    // Endpoint específico por número (mantener compatibilidad)
    this.app.post('/incoming/:phoneNumber', (req: Request, res: Response) => {
      try {
        const phoneNumber = req.params.phoneNumber;
        const fromNumber = req.body.From;
        const callSid = req.body.CallSid;

        logger.important(callSid,`📞 Llamada específica: ${fromNumber} -> ${phoneNumber}, CallSid: ${callSid}`);

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
        console.error(`❌ Error en /incoming/${req.params.phoneNumber}:`, err);
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