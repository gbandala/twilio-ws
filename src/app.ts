import express, { Application } from 'express';
import { Request, Response } from 'express';
import { twiml } from 'twilio';
// import expressWs from 'express-ws';
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
// import WebSocketManagerService from './services/wsManagerService';



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
    this.wsInstance = expressWsModule.default(expressApp);
    this.app = this.wsInstance.app;
    this.databaseSync();
    this.initializeWebSockets();
    this.configureMiddlewares();
    this.configureRoutes();
    this.databaseSync();
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
    // Parsear datos codificados en URL
    this.app.use(express.urlencoded({ extended: false }));
    // Parsear JSON en las solicitudes
    this.app.use(express.json());
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
    // await WebSocketManagerService.initializeWebSockets(this.wsInstance);
    await WebSocketManagerService.initializeWebSockets(this.wsInstance);
    console.log('✅ WebSockets inicializados correctamente');
  }


  /**
   * Configura las rutas de la API
   */
  private configureRoutes(): void {
    this.app.use('/', routes);
    this.app.post('/incoming/:phoneNumber', (req: Request, res: Response) => {
      try {
        const phoneNumber = req.params.phoneNumber;
        const fromNumber = req.body.From;
        const callSid = req.body.CallSid;

        logger.info(`Llamada entrante específica: ${fromNumber} -> ${phoneNumber}, CallSid: ${callSid}`);

        const VoiceResponse = twiml.VoiceResponse;
        const response = new VoiceResponse();
        const connect = response.connect();
        response.say({ language: 'es-MX' },'Conectando la llamada...');
        const stream = connect.stream({
          url: `wss://${process.env.SERVER}/connection`
        });

        // Usar el parámetro de la URL como número de teléfono
        stream.parameter({
          name: 'phoneNumber',
          value: phoneNumber
        });

        stream.parameter({
          name: 'callerNumber',
          value: fromNumber
        });

        res.type('text/xml');
        res.end(response.toString());

      } catch (err) {
        logger.error(`Error en endpoint /incoming/${req.params.phoneNumber}:`, err);
        res.status(500).send('Error interno del servidor');
      }
    });
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