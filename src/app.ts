import express, { Application } from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import Database from "./libs/database";
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// import WebSocketConfigRouter from './routes/wsRouter';
// import twilioWebhookRouter from './routes/twilioWebhookRouter';
import routes from './routes';
import WebSocketManagerService from './services/wsManagerService';


// Cargar variables de entorno
config();

/**
 * Clase principal de la aplicación Express
 */
class App {
  public app: Application;
  private wsInstance: any;

  constructor() {
    const expressApp = express();
    this.wsInstance = expressWs(expressApp);
    this.app = this.wsInstance.app;
    
    this.configureMiddlewares();
    this.databaseSync();
    this.initializeWebSockets();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  /**
   * Configura los middlewares de la aplicación
   */
  private configureMiddlewares(): void {
    // Habilitar CORS
    this.app.use(cors());    
    // Mejorar seguridad HTTP
    this.app.use(helmet());    
    // Parsear JSON en las solicitudes
    this.app.use(express.json());    
    // Parsear datos codificados en URL
    this.app.use(express.urlencoded({ extended: true }));    
    // Logging de solicitudes HTTP
    this.app.use(morgan('dev'));
  }

  /**
   * Inicializa la conexión a la base de datos
   */
  protected databaseSync(): void {
    const db = new Database();
    db.sequelize?.authenticate();
  }

  /**
   * Inicializa los WebSockets
   */
  private async initializeWebSockets(): Promise<void> {
    // Inicializar el gestor de WebSockets
    await WebSocketManagerService.initializeWebSockets(this.wsInstance);
    console.log('✅ WebSockets inicializados correctamente');
  }

  /**
   * Configura las rutas de la API
   */
  private configureRoutes(): void {
    // // Rutas para WebSockets
    // this.app.use('/api/websockets', WebSocketConfigRouter);
    // // Ruta para webhooks de Twilio
    // this.app.use('/api/twilio', twilioWebhookRouter);
    // Rutas de la API
    this.app.use('/api', routes);

    // // Ruta principal
    // this.app.get('/', (req, res) => {
    //   res.json({
    //     message: 'API de Twilio-Deepgram Multi-WebSocket',
    //     docs: '/api-docs'
    //   });
    // });
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
}

export default new App().app;