// src/services/wsManagerService.ts - VERSIÓN CON LOGS OPTIMIZADOS
import WebSocket from 'ws';
import { Request } from 'express';
import WebSocketConfigService from './wsService';
import { GptService } from './gptService';
import { TranscriptionService } from './transcriptionService';
import { TtsService } from './ttsService';
import { StreamService } from './streamService';
import { WebSocketConfig } from '../models/wsModel';
import { logger } from '../utils/logger';

/**
 * Interfaz para representar una conexión activa
 */
interface ActiveConnection {
  connectionId: string;
  config: WebSocketConfig;
  
  // Servicios únicos para esta conexión
  gptService: GptService;
  transcriptionService: TranscriptionService;
  ttsService: TtsService;
  streamService: StreamService;
  
  // Estado de la conexión
  streamSid: string;
  callSid: string;
  phoneNumber: string;
  callerNumber: string;
  marks: string[];
  interactionCount: number;
  ws: WebSocket;
  
  // Contadores para estadísticas
  audioPacketsReceived: number;
  transcriptionsReceived: number;
  startTime: Date;
}

/**
 * Interfaz para mensajes de Twilio
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

class WebSocketManagerService {
  private activeConnections: Map<string, ActiveConnection>;

  constructor() {
    this.activeConnections = new Map();
    console.log('📋 WebSocketManagerService creado'.green);
  }

  /**
   * Inicializa las rutas WebSocket en la aplicación Express
   */
  async initializeWebSockets(wsInstance: any): Promise<void> {
    try {
      // Inicializar configuraciones
      await WebSocketConfigService.initialize();
      const configs = await WebSocketConfigService.listWebSocketConfigs();
      console.log(`📊 Cargadas ${configs.length} configuraciones WebSocket`.green);

      // Registrar la ruta WebSocket
      wsInstance.app.ws('/connection', (ws: WebSocket, req: Request) => {
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        logger.important(connectionId, 'Nueva conexión WebSocket establecida');
        
        this.handleWebSocketConnection(ws, connectionId);
      });

      console.log('✅ WebSocket /connection registrado correctamente'.green);

    } catch (error) {
      console.error('❌ Error inicializando WebSockets:', error);
      throw error;
    }
  }

  /**
   * Manejar conexión WebSocket individual - CON LOGS OPTIMIZADOS
   */
  private handleWebSocketConnection(ws: WebSocket, connectionId: string): void {
    let connection: ActiveConnection | null = null;

    // Configurar manejadores básicos
    ws.on('error', (error) => {
      logger.critical(connectionId, 'Error en WebSocket', error.message);
    });

    ws.on('message', async (data) => {
      try {
        const msg: TwilioMessage = JSON.parse(data.toString());
        
        // Log optimizado de eventos
        logger.websocketEvent(connectionId, msg.event, msg.event === 'start' ? {
          callSid: msg.start?.callSid,
          phoneNumber: msg.start?.customParameters?.phoneNumber
        } : undefined);

        switch (msg.event) {
          case 'connected':
            logger.detailed(connectionId, 'WebSocket conectado con Twilio');
            break;

          case 'start':
            if (msg.start) {
              connection = await this.handleStreamStart(ws, msg, connectionId);
              if (!connection) {
                logger.critical(connectionId, 'Error configurando conexión');
              }
            }
            break;

          case 'media':
            if (connection && msg.media?.payload) {
              connection.audioPacketsReceived++;
              
              // Log de progreso optimizado
              logger.progress(
                connectionId, 
                connection.audioPacketsReceived, 
                connection.transcriptionsReceived, 
                connection.interactionCount
              );

              // Enviar audio a transcripción (sin log individual)
              connection.transcriptionService.send(msg.media.payload);
              
            } else if (!connection) {
              logger.critical(connectionId, 'Audio recibido sin conexión inicializada');
            }
            break;

          case 'mark':
            if (connection && msg.mark) {
              logger.detailed(connectionId, `Mark completado: ${msg.mark.name}`);
              connection.marks = connection.marks.filter(m => m !== msg.mark!.name);
            }
            break;

          case 'stop':
            logger.important(connectionId, 'Stream finalizado');
            if (connection) {
              this.logCallSummary(connection);
              this.cleanupConnection(connectionId);
            }
            break;

          default:
            logger.verbose(connectionId, `Evento no manejado: ${msg.event}`);
        }

      } catch (error) {
        logger.critical(connectionId, 'Error procesando mensaje WebSocket', {
          error: error instanceof Error ? error.message : 'Error desconocido',
          messagePreview: data.toString().substring(0, 100)
        });
      }
    });

    ws.on('close', () => {
      logger.important(connectionId, 'WebSocket desconectado');
      if (connection) {
        this.logCallSummary(connection);
        this.cleanupConnection(connectionId);
      }
    });
  }

  /**
   * Manejar inicio de stream - CON LOGS OPTIMIZADOS
   */
  private async handleStreamStart(ws: WebSocket, msg: any, connectionId: string): Promise<ActiveConnection | null> {
    try {
      const phoneNumber = msg.start?.customParameters?.phoneNumber || 'unknown';
      const callerNumber = msg.start?.customParameters?.callerNumber || 'unknown';
      const streamSid = msg.start?.streamSid;
      const callSid = msg.start?.callSid;

      // Obtener configuración
      const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
      logger.important(connectionId, `Configuración cargada para ${phoneNumber}`, {
        configId: config.id,
        voiceModel: config.voiceModel
      });

      // Crear servicios únicos
      const gptService = new GptService(config.prompt, config.welcomeMessage);
      const transcriptionService = new TranscriptionService();
      const ttsService = new TtsService(config.voiceModel);
      const streamService = new StreamService(ws);

      // Configurar servicios
      streamService.setStreamSid(streamSid);
      gptService.setCallSid(callSid);

      // Crear objeto de conexión
      const connection: ActiveConnection = {
        connectionId,
        config,
        gptService,
        transcriptionService,
        ttsService,
        streamService,
        streamSid,
        callSid,
        phoneNumber,
        callerNumber,
        marks: [],
        interactionCount: 0,
        ws,
        audioPacketsReceived: 0,
        transcriptionsReceived: 0,
        startTime: new Date()
      };

      // Configurar event listeners
      this.setupEventListeners(connection);

      // Almacenar conexión
      this.activeConnections.set(connectionId, connection);

      // Enviar mensaje de bienvenida
      const welcomeMsg = config.welcomeMessage || "Welcome to Bart's Automotive. • How can I help you today?";
      logger.detailed(connectionId, 'Enviando mensaje de bienvenida');
      
      setTimeout(() => {
        ttsService.generate({
          partialResponseIndex: null,
          partialResponse: welcomeMsg
        }, 0);
      }, 500);

      // Setup timer de estadísticas (solo si level es DETAILED o superior)
      if (process.env.LOG_LEVEL === 'DETAILED' || process.env.LOG_LEVEL === 'VERBOSE') {
        const statsTimer = setInterval(() => {
          logger.progress(
            connectionId, 
            connection.audioPacketsReceived, 
            connection.transcriptionsReceived, 
            connection.interactionCount
          );
        }, 30000); // Cada 30 segundos

        ws.on('close', () => clearInterval(statsTimer));
      }

      logger.important(connectionId, 'Stream completamente configurado');
      return connection;

    } catch (error) {
      logger.critical(connectionId, 'Error configurando stream', {
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
      return null;
    }
  }

  /**
   * Configurar event listeners - CON LOGS OPTIMIZADOS
   */
  private setupEventListeners(connection: ActiveConnection): void {
    const { connectionId } = connection;

    // TRANSCRIPTION EVENTS
    connection.transcriptionService.on('utterance', (text: string) => {
      logger.transcription(connectionId, 'partial', text);
    });

    connection.transcriptionService.on('transcription', (text: string) => {
      if (!text?.trim()) return;
      
      connection.transcriptionsReceived++;
      logger.transcription(connectionId, 'final', text, connection.transcriptionsReceived);
      logger.gpt(connectionId, 'request', text, connection.interactionCount);
      
      connection.gptService.completion(text, connection.interactionCount);
      connection.interactionCount++;
    });

    // GPT EVENTS
    connection.gptService.on('gptreply', (gptReply: any, icount: number) => {
      logger.gpt(connectionId, 'response', gptReply.partialResponse, icount);
      logger.tts(connectionId, 'start', { text: gptReply.partialResponse });
      
      connection.ttsService.generate(gptReply, icount);
    });

    // TTS EVENTS
    connection.ttsService.on('speech', (responseIndex: number | null, audio: string, label: string, icount: number) => {
      logger.tts(connectionId, 'success', { 
        audioSize: audio.length, 
        label,
        interaction: icount
      });
      
      connection.streamService.buffer(responseIndex, audio);
    });

    // STREAM EVENTS
    connection.streamService.on('audiosent', (markLabel: string) => {
      logger.stream(connectionId, 'sent', { label: markLabel });
      connection.marks.push(markLabel);
    });

    // ERROR HANDLING
    const handleError = (service: string) => (error: any) => {
      logger.critical(connectionId, `Error en ${service}`, {
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    };

    connection.transcriptionService.on('error', handleError('TranscriptionService'));
    connection.ttsService.on('error', handleError('TtsService'));
    connection.gptService.on('error', handleError('GptService'));

    logger.detailed(connectionId, 'Event listeners configurados');
  }

  /**
   * Log resumen de llamada
   */
  private logCallSummary(connection: ActiveConnection): void {
    const duration = Date.now() - connection.startTime.getTime();
    const durationSec = Math.round(duration / 1000);
    
    logger.important(connection.connectionId, `📋 RESUMEN LLAMADA (${durationSec}s)`, {
      phoneNumber: connection.phoneNumber,
      callerNumber: connection.callerNumber,
      audioPackets: connection.audioPacketsReceived,
      transcriptions: connection.transcriptionsReceived,
      interactions: connection.interactionCount,
      pendingMarks: connection.marks.length,
      avgPacketsPerTranscription: connection.transcriptionsReceived > 0 
        ? Math.round(connection.audioPacketsReceived / connection.transcriptionsReceived)
        : 'N/A'
    });
  }

  /**
   * Limpiar recursos de una conexión
   */
  private cleanupConnection(connectionId: string): void {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      // Remover listeners
      connection.transcriptionService.removeAllListeners();
      connection.gptService.removeAllListeners();
      connection.ttsService.removeAllListeners();
      connection.streamService.removeAllListeners();
      
      // Limpiar buffers
      connection.streamService.clear?.();
      
      this.activeConnections.delete(connectionId);
      logger.detailed(connectionId, 'Recursos limpiados');
    }
  }

  /**
   * Obtener estado de conexiones activas
   */
  public getStatus() {
    return {
      activeConnections: this.activeConnections.size,
      connections: Array.from(this.activeConnections.entries()).map(([id, conn]) => ({
        id,
        phoneNumber: conn.phoneNumber,
        callerNumber: conn.callerNumber,
        duration: Math.round((Date.now() - conn.startTime.getTime()) / 1000),
        interactionCount: conn.interactionCount,
        audioPackets: conn.audioPacketsReceived,
        transcriptions: conn.transcriptionsReceived,
        marks: conn.marks.length,
        configId: conn.config.id
      }))
    };
  }

  /**
   * Debug específico para una conexión
   */
  public getConnectionDebug(connectionId: string) {
    const connection = this.activeConnections.get(connectionId);
    if (!connection) return null;

    return {
      connectionId,
      phoneNumber: connection.phoneNumber,
      streamSid: connection.streamSid,
      callSid: connection.callSid,
      audioPacketsReceived: connection.audioPacketsReceived,
      transcriptionsReceived: connection.transcriptionsReceived,
      interactionCount: connection.interactionCount,
      activeMark: connection.marks.length,
      duration: Math.round((Date.now() - connection.startTime.getTime()) / 1000),
      config: {
        id: connection.config.id,
        voiceModel: connection.config.voiceModel,
        welcomeMessage: connection.config.welcomeMessage?.substring(0, 50)
      }
    };
  }
}

export default new WebSocketManagerService();