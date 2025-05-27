
import WebSocket from 'ws';
import { Request } from 'express';
import WebSocketConfigService from './wsService';
import { GptService } from './gptService';
import { TranscriptionService } from './transcriptionService';
import { TtsService } from './ttsService';
import { StreamService } from './streamService';
import { WebSocketConfig } from '../models/wsModel';
import logger from '../utils/logger';

/**
 * Interfaz para representar una instancia de WebSocket con sus servicios
 */
interface WebSocketInstance {
  config: WebSocketConfig;
  gptService: GptService;
  transcriptionService: TranscriptionService;
  ttsService: TtsService;
  streamService: StreamService;
}

/**
 * Interfaz para mensajes de Twilio (siguiendo patrón de app.ts)
 */
interface TwilioMessage {
  event: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    callSid: string;
    customParameters?: {
      phoneNumber?: string;
      callerNumber?: string;
    };
  };
  media?: {
    payload: string;
  };
  mark?: {
    name: string;
  };
  sequenceNumber?: number;
}

/**
 * Servicio para gestionar instancias de WebSocket
 */
class WebSocketManagerService {
  private instances: Map<string, WebSocketInstance>;
  private activeConnections: Map<string, {
    config: WebSocketConfig;
    services: WebSocketInstance;
    marks: string[];
    interactionCount: number;
  }>;

  constructor() {
    this.instances = new Map();
    this.activeConnections = new Map();
    logger.info('WebSocketManagerService inicializado');

    // Suscribirse a eventos de configuración
    WebSocketConfigService.on('configAdded', this.handleConfigAdded.bind(this));
    WebSocketConfigService.on('configUpdated', this.handleConfigUpdated.bind(this));
    WebSocketConfigService.on('configRemoved', this.handleConfigRemoved.bind(this));
  }

  /**
   * Inicializa las rutas WebSocket en la aplicación Express
   */
  async initializeWebSockets(wsInstance: any): Promise<void> {
    logger.info('Inicializando WebSockets en la aplicación Express');

    // Inicializar el servicio de configuración para cargar las configuraciones desde la BD
    await WebSocketConfigService.initialize();

    // Cargar todas las configuraciones activas
    const configs = await WebSocketConfigService.listWebSocketConfigs();

    // Inicializar instancias para cada configuración activa
    for (const config of configs) {
      if (config.isActive) {
        this.handleConfigAdded(config);
      }
    }

    // **CAMBIO PRINCIPAL**: Un solo endpoint /connection que maneja todos los números
    wsInstance.app.ws('/connection', async (ws: WebSocket, req: Request) => {
      logger.info('Nueva conexión WebSocket establecida');
      
      try {
        ws.on('error', console.error);

        // Variables para rastrear la llamada 
        let streamSid: string;
        let callSid: string;
        let phoneNumber: string;
        let connectionConfig: WebSocketConfig;
        let connectionServices: WebSocketInstance | undefined;

        // Manejar mensajes entrantes de Twilio
        ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const msg: TwilioMessage = JSON.parse(data.toString());
            logger.debug(`Mensaje recibido: ${msg.event}`, { streamSid, phoneNumber });

            if (msg.event === 'start' && msg.start) {
              // **OBTENER NÚMERO DE PARÁMETROS PERSONALIZADOS**
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              phoneNumber = msg.start.customParameters?.phoneNumber || '';

              logger.info(`Iniciando Media Stream para ${streamSid}, teléfono: ${phoneNumber}`);

              // Obtener configuración por número de teléfono
              try {
                connectionConfig = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
                
                if (!connectionConfig || !connectionConfig.isActive) {
                  logger.error(`No hay configuración activa para el número: ${phoneNumber}`);
                  ws.close(1008, 'WebSocket no configurado o inactivo');
                  return;
                }

                // Obtener servicios para esta configuración
                connectionServices = this.instances.get(connectionConfig.id);
                if (!connectionServices) {
                  logger.error(`Instancia WebSocket no encontrada para la configuración: ${connectionConfig.id}`);
                  ws.close(1011, 'Instancia WebSocket no encontrada');
                  return;
                }
                // TypeScript: connectionServices is guaranteed to be defined here

                // Configurar servicios para esta conexión específica
                connectionServices.streamService.setStreamSid(streamSid);
                connectionServices.gptService.setCallSid(callSid);

                // Almacenar conexión activa
                this.activeConnections.set(streamSid, {
                  config: connectionConfig,
                  services: connectionServices,
                  marks: [],
                  interactionCount: 0
                });

                // Configurar event listeners para esta conexión
                this.setupEventListeners(ws, streamSid, connectionServices);

                // Enviar mensaje de bienvenida
                logger.info(`Enviando mensaje de bienvenida para ${phoneNumber}`);
                connectionServices.ttsService.generate(
                  connectionConfig.welcomeMessage || 'Hello, how can I help you today?'
                );

              } catch (configError) {
                logger.error(`Error obteniendo configuración para ${phoneNumber}:`, configError);
                ws.close(1008, 'Error de configuración');
                return;
              }
            }
            else if (msg.event === 'media' && msg.media && connectionServices) {
              // Envío de audio a transcripción
              connectionServices.transcriptionService.send(msg.media.payload);
            }
            else if (msg.event === 'mark' && msg.mark && streamSid) {
              // Audio terminó de reproducirse
              const connection = this.activeConnections.get(streamSid);
              if (connection) {
                const label = msg.mark.name;
                logger.debug(`Audio completado (${msg.sequenceNumber}): ${label}`);
                connection.marks = connection.marks.filter(m => m !== label);
              }
            }
            else if (msg.event === 'stop' && streamSid) {
              // Llamada finalizada
              logger.info(`Media stream ${streamSid} finalizado`);
              this.activeConnections.delete(streamSid);
            }

          } catch (error) {
            logger.error('Error procesando mensaje WebSocket:', error);
          }
        });

        // Listener para cierre de conexión
        ws.on('close', () => {
          logger.info(`Conexión WebSocket cerrada para streamSid: ${streamSid}`);
          if (streamSid) {
            this.activeConnections.delete(streamSid);
          }
        });

        // Listener para errores de conexión
        ws.on('error', (error) => {
          logger.error(`Error en conexión WebSocket:`, error);
        });

      } catch (error) {
        logger.error('Error al manejar la conexión WebSocket:', error);
        ws.close(1011, 'Error al manejar la conexión WebSocket');
      }
    });
  }

  /**
   * Configurar event listeners para una conexión específica
   */
  private setupEventListeners(ws: WebSocket, streamSid: string, services: WebSocketInstance): void {
    const connection = this.activeConnections.get(streamSid);
    if (!connection) return;

    // Manejo de interrupciones (siguiendo patrón de app.ts)
    services.transcriptionService.on('utterance', async (text: string) => {
      if (connection.marks.length > 0 && text?.length > 5) {
        logger.debug('Interrupción detectada, limpiando stream');
        ws.send(JSON.stringify({
          streamSid,
          event: 'clear',
        }));
      }
    });

    // Proceso de transcripción -> GPT
    services.transcriptionService.on('transcription', async (text: string) => {
      if (!text) return;
      
      logger.info(`Interaction ${connection.interactionCount} – STT -> GPT: ${text}`);
      services.gptService.completion(text, connection.interactionCount);
      connection.interactionCount += 1;
    });

    // Respuesta de GPT -> TTS
    services.gptService.on('gptreply', async (gptReply: any, icount: number) => {
      logger.info(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`);
      services.ttsService.generate(gptReply);
    });

    // Audio generado -> Stream
    services.ttsService.on('speech', (responseIndex: number | null, audio: string, label: string, icount: number) => {
      logger.info(`Interaction ${icount}: TTS -> TWILIO: ${label}`);
      services.streamService.buffer(responseIndex, audio);
    });

    // Rastreo de audio enviado
    services.streamService.on('audiosent', (markLabel: string) => {
      connection.marks.push(markLabel);
    });
  }

  /**
   * Manejar la adición de una nueva configuración
   */
  private handleConfigAdded(config: WebSocketConfig): void {
    logger.info(`Nueva configuración WebSocket añadida: ${config.id}`);

    // Crear servicios para la nueva configuración
    const gptService = new GptService(config.prompt, config.welcomeMessage);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TtsService(config.voiceModel);
    const streamService = new StreamService(undefined); // Se configurará en cada conexión

    // Almacenar la instancia
    this.instances.set(config.id, {
      config,
      gptService,
      transcriptionService,
      ttsService,
      streamService
    });

    logger.debug(`Instancia WebSocket creada para la configuración: ${config.id}`);
  }

  /**
   * Manejar la actualización de una configuración
   */
  private handleConfigUpdated(config: WebSocketConfig): void {
    logger.info(`Configuración WebSocket actualizada: ${config.id}`);

    if (this.instances.has(config.id)) {
      const currentInstance = this.instances.get(config.id)!;
      currentInstance.config = config;
      currentInstance.gptService.updateSystemPrompt(config.prompt);
      currentInstance.ttsService.updateVoiceModel(config.voiceModel);
      logger.debug(`Instancia WebSocket actualizada para la configuración: ${config.id}`);
    } else {
      this.handleConfigAdded(config);
    }
  }

  /**
   * Manejar la eliminación de una configuración
   */
  private handleConfigRemoved(config: WebSocketConfig): void {
    logger.info(`Configuración WebSocket eliminada: ${config.id}`);

    if (this.instances.has(config.id)) {
      this.instances.delete(config.id);
      logger.debug(`Instancia WebSocket eliminada para la configuración: ${config.id}`);
    }
  }
}

// Exportar una instancia única para ser utilizada en toda la aplicación
export default new WebSocketManagerService();
