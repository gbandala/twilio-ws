// src/services/wsManagerService.ts - VERSIÓN CORREGIDA
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
 * Interfaz para representar una conexión activa (servicios únicos por conexión)
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
  
  // Debug counters
  audioPacketsReceived: number;
  transcriptionsReceived: number;
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
    console.log('📋 WebSocketManagerService creado');
  }

  /**
   * Inicializa las rutas WebSocket en la aplicación Express
   */
  async initializeWebSockets(wsInstance: any): Promise<void> {
    console.log('🔧 Iniciando inicialización de WebSockets...');

    try {
      // **PASO 1**: Inicializar configuraciones
      console.log('📊 Inicializando configuraciones...');
      await WebSocketConfigService.initialize();
      const configs = await WebSocketConfigService.listWebSocketConfigs();
      console.log(`📊 Cargadas ${configs.length} configuraciones`);

      // **PASO 2**: Registrar la ruta WebSocket
      console.log('🔌 Registrando ruta WebSocket /connection...');
      
      wsInstance.app.ws('/connection', (ws: WebSocket, req: Request) => {
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`✅ Nueva conexión WebSocket: ${connectionId}`);
        
        this.handleWebSocketConnection(ws, connectionId);
      });

      console.log('✅ WebSocket /connection registrado correctamente');

    } catch (error) {
      console.error('❌ Error inicializando WebSockets:', error);
      throw error;
    }
  }

  /**
   * Manejar conexión WebSocket individual - COMPLETAMENTE REESCRITO
   */
  private handleWebSocketConnection(ws: WebSocket, connectionId: string): void {
    let connection: ActiveConnection | null = null;

    // Configurar manejadores básicos
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error [${connectionId}]:`, error);
    });

    ws.on('message', async (data) => {
      try {
        const msg: TwilioMessage = JSON.parse(data.toString());
        
        // **DEBUG**: Log de todos los eventos importantes
        if (msg.event !== 'media' || Math.random() < 0.005) { // Log 0.5% de eventos media
          console.log(`📨 [${connectionId}] Evento: ${msg.event}`);
        }

        switch (msg.event) {
          case 'connected':
            console.log(`🔗 [${connectionId}] WebSocket conectado con Twilio`);
            break;

          case 'start':
            if (msg.start) {
              console.log(`🚀 [${connectionId}] START recibido`);
              connection = await this.handleStreamStart(ws, msg, connectionId);
              
              if (connection) {
                console.log(`✅ [${connectionId}] Conexión completamente configurada`);
              } else {
                console.error(`❌ [${connectionId}] Error configurando conexión`);
              }
            }
            break;

          case 'media':
            if (connection && msg.media?.payload) {
              // **🔥 PARTE CRÍTICA CORREGIDA 🔥**
              connection.audioPacketsReceived++;
              
              // Debug cada 200 paquetes
              if (connection.audioPacketsReceived % 200 === 0) {
                console.log(`📊 [${connectionId}] Audio: ${connection.audioPacketsReceived} paquetes, ${connection.transcriptionsReceived} transcripciones`);
              }

              // **ENVIAR AUDIO A TRANSCRIPCIÓN**
              console.log(`🎤 [${connectionId}] Enviando audio a transcripción...`);
              connection.transcriptionService.send(msg.media.payload);
              
            } else {
              if (!connection) {
                console.warn(`⚠️ [${connectionId}] Conexión no inicializada para audio`);
              } else if (!msg.media?.payload) {
                console.warn(`⚠️ [${connectionId}] Payload de audio vacío`);
              }
            }
            break;

          case 'mark':
            if (connection && msg.mark) {
              const label = msg.mark.name;
              console.log(`🏁 [${connectionId}] Mark completado: ${label}`);
              connection.marks = connection.marks.filter(m => m !== label);
            }
            break;

          case 'stop':
            console.log(`🛑 [${connectionId}] Stream finalizado`);
            if (connection) {
              this.cleanupConnection(connectionId);
            }
            break;

          default:
            console.log(`❓ [${connectionId}] Evento no manejado: ${msg.event}`);
        }

      } catch (error) {
        console.error(`❌ [${connectionId}] Error procesando mensaje:`, error);
        console.error(`   Mensaje: ${data.toString().substring(0, 100)}...`);
      }
    });

    ws.on('close', () => {
      console.log(`🔌 [${connectionId}] WebSocket desconectado`);
      if (connection) {
        this.cleanupConnection(connectionId);
      }
    });
  }

  /**
   * Manejar inicio de stream - COMPLETAMENTE REESCRITO
   */
  private async handleStreamStart(ws: WebSocket, msg: any, connectionId: string): Promise<ActiveConnection | null> {
    try {
      const phoneNumber = msg.start?.customParameters?.phoneNumber || 'unknown';
      const callerNumber = msg.start?.customParameters?.callerNumber || 'unknown';
      const streamSid = msg.start?.streamSid;
      const callSid = msg.start?.callSid;
      
      console.log(`🚀 [${connectionId}] Configurando nueva conexión:`, {
        phoneNumber,
        callerNumber,
        streamSid,
        callSid
      });

      // **PASO 1**: Obtener configuración
      console.log(`🔍 [${connectionId}] Buscando configuración para: ${phoneNumber}`);
      const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
      console.log(`✅ [${connectionId}] Configuración encontrada: ${config.id}`);

      // **PASO 2**: Crear servicios ÚNICOS para esta conexión
      console.log(`🛠️ [${connectionId}] Creando servicios únicos...`);
      const gptService = new GptService(config.prompt, config.welcomeMessage);
      const transcriptionService = new TranscriptionService();
      const ttsService = new TtsService(config.voiceModel);
      const streamService = new StreamService(ws);

      // **PASO 3**: Configurar servicios
      streamService.setStreamSid(streamSid);
      gptService.setCallSid(callSid);

      // **PASO 4**: Crear objeto de conexión
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
        transcriptionsReceived: 0
      };

      // **PASO 5**: CONFIGURAR EVENT LISTENERS ANTES DE HACER CUALQUIER OTRA COSA
      console.log(`🔗 [${connectionId}] Configurando event listeners...`);
      this.setupEventListeners(connection);

      // **PASO 6**: Almacenar conexión
      this.activeConnections.set(connectionId, connection);

      // **PASO 7**: Enviar mensaje de bienvenida
      console.log(`🎙️ [${connectionId}] Enviando mensaje de bienvenida...`);
      const welcomeMsg = config.welcomeMessage || "Welcome to Bart's Automotive. • How can I help you today?";
      
      setTimeout(() => {
        ttsService.generate({
          partialResponseIndex: null,
          partialResponse: welcomeMsg
        }, 0);
      }, 500); // Pequeño delay para asegurar que todo esté configurado

      // **PASO 8**: Setup debug timer
      const debugTimer = setInterval(() => {
        console.log(`📊 [${connectionId}] Estado: Audio=${connection.audioPacketsReceived}, Transcripciones=${connection.transcriptionsReceived}, Interacciones=${connection.interactionCount}`);
        
        if (connection.audioPacketsReceived > 100 && connection.transcriptionsReceived === 0) {
          console.warn(`⚠️ [${connectionId}] PROBLEMA: Muchos paquetes de audio pero sin transcripciones`);
        }
      }, 15000);

      // Limpiar timer cuando se cierre la conexión
      ws.on('close', () => clearInterval(debugTimer));

      console.log(`✅ [${connectionId}] Stream completamente configurado`);
      return connection;

    } catch (error) {
      console.error(`❌ [${connectionId}] Error configurando stream:`, error);
      return null;
    }
  }

  /**
   * Configurar event listeners - COMPLETAMENTE REESCRITO
   */
  private setupEventListeners(connection: ActiveConnection): void {
    const { connectionId } = connection;
    console.log(`🔗 [${connectionId}] Configurando event listeners...`);

    // **TRANSCRIPTION → DEBUG**
    connection.transcriptionService.on('utterance', (text: string) => {
      console.log(`💭 [${connectionId}] Transcripción parcial: "${text}"`);
    });

    // **TRANSCRIPTION → GPT**
    connection.transcriptionService.on('transcription', (text: string) => {
      if (!text || text.trim().length === 0) {
        console.log(`🎤 [${connectionId}] Transcripción vacía, ignorando`);
        return;
      }
      
      connection.transcriptionsReceived++;
      console.log(`🎯 [${connectionId}] TRANSCRIPCIÓN #${connection.transcriptionsReceived}: "${text}"`);
      console.log(`📨 [${connectionId}] Enviando a GPT...`);
      
      connection.gptService.completion(text, connection.interactionCount);
      connection.interactionCount++;
    });

    // **GPT → TTS**
    connection.gptService.on('gptreply', (gptReply: any, icount: number) => {
      console.log(`🤖 [${connectionId}] GPT respuesta #${icount}: "${gptReply.partialResponse}"`);
      console.log(`🎵 [${connectionId}] Enviando a TTS...`);
      
      connection.ttsService.generate(gptReply, icount);
    });

    // **TTS → STREAM**
    connection.ttsService.on('speech', (responseIndex: number | null, audio: string, label: string, icount: number) => {
      console.log(`🔊 [${connectionId}] TTS completado #${icount}: ${label} (${audio.length} bytes)`);
      console.log(`📤 [${connectionId}] Enviando a stream...`);
      
      connection.streamService.buffer(responseIndex, audio);
    });

    // **STREAM → DEBUG**
    connection.streamService.on('audiosent', (markLabel: string) => {
      console.log(`📻 [${connectionId}] Audio enviado a Twilio: ${markLabel}`);
      connection.marks.push(markLabel);
    });

    // **ERROR HANDLING**
    connection.transcriptionService.on('error', (error) => {
      console.error(`❌ [${connectionId}] Error en transcripción:`, error);
    });

    connection.ttsService.on('error', (error) => {
      console.error(`❌ [${connectionId}] Error en TTS:`, error);
    });

    connection.gptService.on('error', (error) => {
      console.error(`❌ [${connectionId}] Error en GPT:`, error);
    });

    console.log(`✅ [${connectionId}] Event listeners configurados correctamente`);
  }

  /**
   * Limpiar recursos de una conexión
   */
  private cleanupConnection(connectionId: string): void {
    console.log(`🧹 [${connectionId}] Limpiando recursos...`);
    
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      // Remover listeners para evitar memory leaks
      connection.transcriptionService.removeAllListeners();
      connection.gptService.removeAllListeners();
      connection.ttsService.removeAllListeners();
      connection.streamService.removeAllListeners();
      
      // Limpiar buffers si es necesario
      connection.streamService.clear?.();
      
      this.activeConnections.delete(connectionId);
      console.log(`✅ [${connectionId}] Recursos limpiados (${connection.audioPacketsReceived} audio, ${connection.transcriptionsReceived} transcripciones)`);
    } else {
      console.log(`⚠️ [${connectionId}] Conexión no encontrada para limpiar`);
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
        interactionCount: conn.interactionCount,
        audioPackets: conn.audioPacketsReceived,
        transcriptions: conn.transcriptionsReceived,
        marks: conn.marks.length,
        configId: conn.config.id
      }))
    };
  }

  /**
   * **NUEVO**: Debug específico para una conexión
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
      config: {
        id: connection.config.id,
        voiceModel: connection.config.voiceModel,
        welcomeMessage: connection.config.welcomeMessage
      }
    };
  }
}

export default new WebSocketManagerService();


// // src/services/wsManagerService.ts
// import WebSocket from 'ws';
// import { Request } from 'express';
// import WebSocketConfigService from './wsService';
// import { GptService } from './gptService';
// import { TranscriptionService } from './transcriptionService';
// import { TtsService } from './ttsService';
// import { StreamService } from './streamService';
// import { WebSocketConfig } from '../models/wsModel';
// import logger from '../utils/logger';

// /**
//  * Interfaz para representar una instancia de WebSocket con sus servicios
//  */
// interface WebSocketInstance {
//   config: WebSocketConfig;
//   gptService: GptService;
//   transcriptionService: TranscriptionService;
//   ttsService: TtsService;
//   streamService: StreamService;
// }

// /**
//  * Interfaz para mensajes de Twilio
//  */
// interface TwilioMessage {
//   event: string;
//   streamSid?: string;
//   start?: {
//     streamSid: string;
//     callSid: string;
//     customParameters?: {
//       phoneNumber?: string;
//       callerNumber?: string;
//     };
//   };
//   media?: {
//     payload: string;
//   };
//   mark?: {
//     name: string;
//   };
//   sequenceNumber?: number;
// }

// class WebSocketManagerService {
//   private instances: Map<string, WebSocketInstance>;
//   private activeConnections: Map<string, {
//     config: WebSocketConfig;
//     services: WebSocketInstance;
//     marks: string[];
//     interactionCount: number;
//     ws: WebSocket;
//   }>;

//   constructor() {
//     this.instances = new Map();
//     this.activeConnections = new Map();
//     console.log('📋 WebSocketManagerService creado');
//   }

//   /**
//    * Inicializa las rutas WebSocket en la aplicación Express
//    */
//   async initializeWebSockets(wsInstance: any): Promise<void> {
//     console.log('🔧 Iniciando inicialización de WebSockets...');

//     try {
//       // **PASO 1**: Inicializar configuraciones
//       console.log('📊 Inicializando configuraciones...');
//       await WebSocketConfigService.initialize();
//       const configs = await WebSocketConfigService.listWebSocketConfigs();
//       console.log(`📊 Cargadas ${configs.length} configuraciones`);

//       // **PASO 2**: Crear instancias de servicios para cada configuración
//       for (const config of configs) {
//         if (config.isActive) {
//           this.createServicesForConfig(config);
//         }
//       }

//       // **PASO 3**: Registrar la ruta WebSocket
//       console.log('🔌 Registrando ruta WebSocket /connection...');
      
//       wsInstance.app.ws('/connection', (ws: WebSocket, req: Request) => {
//         const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//         console.log(`✅ Nueva conexión WebSocket: ${connectionId}`);
        
//         this.handleWebSocketConnection(ws, connectionId);
//       });

//       console.log('✅ WebSocket /connection registrado correctamente');

//     } catch (error) {
//       console.error('❌ Error inicializando WebSockets:', error);
//       throw error;
//     }
//   }

//   /**
//    * Crear servicios para una configuración específica
//    */
//   private createServicesForConfig(config: WebSocketConfig): void {
//     console.log(`➕ Creando servicios para ${config.id}`);

//     const gptService = new GptService(config.prompt, config.welcomeMessage);
//     const transcriptionService = new TranscriptionService();
//     const ttsService = new TtsService(config.voiceModel);
//     const streamService = new StreamService(undefined); // Se configurará por conexión

//     this.instances.set(config.id, {
//       config,
//       gptService,
//       transcriptionService,
//       ttsService,
//       streamService
//     });

//     console.log(`✅ Servicios creados para ${config.id}`);
//   }

//   /**
//    * Manejar conexión WebSocket individual
//    */
//   private handleWebSocketConnection(ws: WebSocket, connectionId: string): void {
//     // Variables para rastrear la llamada
//     let streamSid: string;
//     let callSid: string;
//     let phoneNumber: string;
//     let connectionServices: WebSocketInstance;

//     // Configurar manejadores básicos
//     ws.on('error', (error) => {
//       console.error(`❌ WebSocket error [${connectionId}]:`, error);
//     });

//     ws.on('message', async (data) => {
//       try {
//         const msg: TwilioMessage = JSON.parse(data.toString());
        
//         if (msg.event === 'connected') {
//           console.log(`🔗 [${connectionId}] WebSocket conectado con Twilio`);
//         }
//         else if (msg.event === 'start' && msg.start) {
//           await this.handleStreamStart(ws, msg, connectionId);
          
//           // Almacenar datos de la conexión
//           streamSid = msg.start.streamSid;
//           callSid = msg.start.callSid;
//           phoneNumber = msg.start.customParameters?.phoneNumber || '';
          
//           // Obtener servicios configurados
//           const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
//           connectionServices = this.instances.get(config.id)!;
          
//           // Configurar servicios para esta conexión específica
//           connectionServices.streamService = new StreamService(ws);
//           connectionServices.streamService.setStreamSid(streamSid);
//           connectionServices.gptService.setCallSid(callSid);

//           // Almacenar conexión activa
//           this.activeConnections.set(connectionId, {
//             config,
//             services: connectionServices,
//             marks: [],
//             interactionCount: 0,
//             ws
//           });

//           // **CRÍTICO**: Configurar event listeners
//           this.setupEventListeners(connectionId, connectionServices);

//           // Enviar mensaje de bienvenida
//           console.log(`🎙️ [${connectionId}] Enviando mensaje de bienvenida...`);
//           connectionServices.ttsService.generate({
//             partialResponseIndex: null,
//             partialResponse: config.welcomeMessage || 'Hola, ¿en qué puedo ayudarte?'
//           }, 0);
//         }
//         else if (msg.event === 'media' && msg.media && connectionServices) {
//           // Enviar audio a transcripción
//           connectionServices.transcriptionService.send(msg.media.payload);
//         }
//         else if (msg.event === 'mark' && msg.mark) {
//           const connection = this.activeConnections.get(connectionId);
//           if (connection) {
//             const label = msg.mark.name;
//             console.log(`🏁 [${connectionId}] Mark completado: ${label}`);
//             connection.marks = connection.marks.filter(m => m !== label);
//           }
//         }
//         else if (msg.event === 'stop') {
//           console.log(`🛑 [${connectionId}] Stream finalizado`);
//           this.activeConnections.delete(connectionId);
//         }

//       } catch (error) {
//         console.error(`❌ [${connectionId}] Error procesando mensaje:`, error);
//       }
//     });

//     ws.on('close', () => {
//       console.log(`🔌 [${connectionId}] WebSocket desconectado`);
//       this.activeConnections.delete(connectionId);
//     });
//   }

//   /**
//    * Configurar event listeners para una conexión específica
//    */
//   private setupEventListeners(connectionId: string, services: WebSocketInstance): void {
//     const connection = this.activeConnections.get(connectionId);
//     if (!connection) return;

//     console.log(`🔗 [${connectionId}] Configurando event listeners...`);

//     // Manejo de interrupciones
//     services.transcriptionService.on('utterance', async (text: string) => {
//       if (connection.marks.length > 0 && text?.length > 5) {
//         console.log(`⚡ [${connectionId}] Interrupción detectada, limpiando stream`);
//         connection.ws.send(JSON.stringify({
//           streamSid: services.streamService.getStreamSid(),
//           event: 'clear',
//         }));
//       }
//     });

//     // Transcripción -> GPT
//     services.transcriptionService.on('transcription', async (text: string) => {
//       if (!text) return;
      
//       console.log(`🎤 [${connectionId}] Interaction ${connection.interactionCount} – STT -> GPT: ${text}`);
//       services.gptService.completion(text, connection.interactionCount);
//       connection.interactionCount += 1;
//     });

//     // GPT -> TTS
//     services.gptService.on('gptreply', async (gptReply: any, icount: number) => {
//       console.log(`🤖 [${connectionId}] Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`);
//       services.ttsService.generate(gptReply, icount);
//     });

//     // TTS -> Stream
//     services.ttsService.on('speech', (responseIndex: number | null, audio: string, label: string, icount: number) => {
//       console.log(`🔊 [${connectionId}] Interaction ${icount}: TTS -> TWILIO: ${label}`);
//       services.streamService.buffer(responseIndex, audio);
//     });

//     // Rastreo de audio enviado
//     services.streamService.on('audiosent', (markLabel: string) => {
//       console.log(`📤 [${connectionId}] Audio enviado: ${markLabel}`);
//       connection.marks.push(markLabel);
//     });

//     console.log(`✅ [${connectionId}] Event listeners configurados`);
//   }

//   /**
//    * Manejar inicio de stream
//    */
//   private async handleStreamStart(ws: WebSocket, msg: any, connectionId: string) {
//     try {
//       const phoneNumber = msg.start?.customParameters?.phoneNumber;
//       const streamSid = msg.start?.streamSid;
      
//       console.log(`🚀 [${connectionId}] Stream iniciado:`, {
//         streamSid,
//         phoneNumber,
//         callSid: msg.start?.callSid
//       });
      
//       if (!phoneNumber) {
//         console.warn(`⚠️ [${connectionId}] No se recibió phoneNumber en customParameters`);
//         return;
//       }

//       console.log(`🔍 [${connectionId}] Buscando configuración para: ${phoneNumber}`);
      
//       const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
//       console.log(`✅ [${connectionId}] Configuración encontrada:`, {
//         id: config.id,
//         phone: config.phoneNumber,
//         active: config.isActive,
//         welcomeMessage: config.welcomeMessage?.substring(0, 50) + '...'
//       });

//       console.log(`✅ [${connectionId}] Configuración completada para ${phoneNumber}`);

//     } catch (error) {
//       const phoneNumber = msg.start?.customParameters?.phoneNumber;
//       console.error(`❌ [${connectionId}] Error manejando start para ${phoneNumber}:`, error);
//     }
//   }

//   /**
//    * Obtener estado de conexiones activas
//    */
//   public getStatus() {
//     return {
//       totalInstances: this.instances.size,
//       activeConnections: this.activeConnections.size,
//       connections: Array.from(this.activeConnections.entries()).map(([id, conn]) => ({
//         id,
//         phoneNumber: conn.config.phoneNumber,
//         interactionCount: conn.interactionCount,
//         marks: conn.marks.length,
//         configId: conn.config.id
//       }))
//     };
//   }
// }

// export default new WebSocketManagerService();
