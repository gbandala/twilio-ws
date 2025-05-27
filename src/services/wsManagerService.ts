// src/services/wsManagerService.ts
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
  private instances: Map<string, WebSocketInstance>;
  private activeConnections: Map<string, {
    config: WebSocketConfig;
    services: WebSocketInstance;
    marks: string[];
    interactionCount: number;
    ws: WebSocket;
  }>;

  constructor() {
    this.instances = new Map();
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

      // **PASO 2**: Crear instancias de servicios para cada configuración
      for (const config of configs) {
        if (config.isActive) {
          this.createServicesForConfig(config);
        }
      }

      // **PASO 3**: Registrar la ruta WebSocket
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
   * Crear servicios para una configuración específica
   */
  private createServicesForConfig(config: WebSocketConfig): void {
    console.log(`➕ Creando servicios para ${config.id}`);

    const gptService = new GptService(config.prompt, config.welcomeMessage);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TtsService(config.voiceModel);
    const streamService = new StreamService(undefined); // Se configurará por conexión

    this.instances.set(config.id, {
      config,
      gptService,
      transcriptionService,
      ttsService,
      streamService
    });

    console.log(`✅ Servicios creados para ${config.id}`);
  }

  /**
   * Manejar conexión WebSocket individual
   */
  private handleWebSocketConnection(ws: WebSocket, connectionId: string): void {
    // Variables para rastrear la llamada
    let streamSid: string;
    let callSid: string;
    let phoneNumber: string;
    let connectionServices: WebSocketInstance;

    // Configurar manejadores básicos
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error [${connectionId}]:`, error);
    });

    ws.on('message', async (data) => {
      try {
        const msg: TwilioMessage = JSON.parse(data.toString());
        
        if (msg.event === 'connected') {
          console.log(`🔗 [${connectionId}] WebSocket conectado con Twilio`);
        }
        else if (msg.event === 'start' && msg.start) {
          await this.handleStreamStart(ws, msg, connectionId);
          
          // Almacenar datos de la conexión
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          phoneNumber = msg.start.customParameters?.phoneNumber || '';
          
          // Obtener servicios configurados
          const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
          connectionServices = this.instances.get(config.id)!;
          
          // Configurar servicios para esta conexión específica
          connectionServices.streamService = new StreamService(ws);
          connectionServices.streamService.setStreamSid(streamSid);
          connectionServices.gptService.setCallSid(callSid);

          // Almacenar conexión activa
          this.activeConnections.set(connectionId, {
            config,
            services: connectionServices,
            marks: [],
            interactionCount: 0,
            ws
          });

          // **CRÍTICO**: Configurar event listeners
          this.setupEventListeners(connectionId, connectionServices);

          // Enviar mensaje de bienvenida
          console.log(`🎙️ [${connectionId}] Enviando mensaje de bienvenida...`);
          connectionServices.ttsService.generate({
            partialResponseIndex: null,
            partialResponse: config.welcomeMessage || 'Hola, ¿en qué puedo ayudarte?'
          }, 0);
        }
        else if (msg.event === 'media' && msg.media && connectionServices) {
          // Enviar audio a transcripción
          connectionServices.transcriptionService.send(msg.media.payload);
        }
        else if (msg.event === 'mark' && msg.mark) {
          const connection = this.activeConnections.get(connectionId);
          if (connection) {
            const label = msg.mark.name;
            console.log(`🏁 [${connectionId}] Mark completado: ${label}`);
            connection.marks = connection.marks.filter(m => m !== label);
          }
        }
        else if (msg.event === 'stop') {
          console.log(`🛑 [${connectionId}] Stream finalizado`);
          this.activeConnections.delete(connectionId);
        }

      } catch (error) {
        console.error(`❌ [${connectionId}] Error procesando mensaje:`, error);
      }
    });

    ws.on('close', () => {
      console.log(`🔌 [${connectionId}] WebSocket desconectado`);
      this.activeConnections.delete(connectionId);
    });
  }

  /**
   * Configurar event listeners para una conexión específica
   */
  private setupEventListeners(connectionId: string, services: WebSocketInstance): void {
    const connection = this.activeConnections.get(connectionId);
    if (!connection) return;

    console.log(`🔗 [${connectionId}] Configurando event listeners...`);

    // Manejo de interrupciones
    services.transcriptionService.on('utterance', async (text: string) => {
      if (connection.marks.length > 0 && text?.length > 5) {
        console.log(`⚡ [${connectionId}] Interrupción detectada, limpiando stream`);
        connection.ws.send(JSON.stringify({
          streamSid: services.streamService.getStreamSid(),
          event: 'clear',
        }));
      }
    });

    // Transcripción -> GPT
    services.transcriptionService.on('transcription', async (text: string) => {
      if (!text) return;
      
      console.log(`🎤 [${connectionId}] Interaction ${connection.interactionCount} – STT -> GPT: ${text}`);
      services.gptService.completion(text, connection.interactionCount);
      connection.interactionCount += 1;
    });

    // GPT -> TTS
    services.gptService.on('gptreply', async (gptReply: any, icount: number) => {
      console.log(`🤖 [${connectionId}] Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`);
      services.ttsService.generate(gptReply, icount);
    });

    // TTS -> Stream
    services.ttsService.on('speech', (responseIndex: number | null, audio: string, label: string, icount: number) => {
      console.log(`🔊 [${connectionId}] Interaction ${icount}: TTS -> TWILIO: ${label}`);
      services.streamService.buffer(responseIndex, audio);
    });

    // Rastreo de audio enviado
    services.streamService.on('audiosent', (markLabel: string) => {
      console.log(`📤 [${connectionId}] Audio enviado: ${markLabel}`);
      connection.marks.push(markLabel);
    });

    console.log(`✅ [${connectionId}] Event listeners configurados`);
  }

  /**
   * Manejar inicio de stream
   */
  private async handleStreamStart(ws: WebSocket, msg: any, connectionId: string) {
    try {
      const phoneNumber = msg.start?.customParameters?.phoneNumber;
      const streamSid = msg.start?.streamSid;
      
      console.log(`🚀 [${connectionId}] Stream iniciado:`, {
        streamSid,
        phoneNumber,
        callSid: msg.start?.callSid
      });
      
      if (!phoneNumber) {
        console.warn(`⚠️ [${connectionId}] No se recibió phoneNumber en customParameters`);
        return;
      }

      console.log(`🔍 [${connectionId}] Buscando configuración para: ${phoneNumber}`);
      
      const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
      console.log(`✅ [${connectionId}] Configuración encontrada:`, {
        id: config.id,
        phone: config.phoneNumber,
        active: config.isActive,
        welcomeMessage: config.welcomeMessage?.substring(0, 50) + '...'
      });

      console.log(`✅ [${connectionId}] Configuración completada para ${phoneNumber}`);

    } catch (error) {
      const phoneNumber = msg.start?.customParameters?.phoneNumber;
      console.error(`❌ [${connectionId}] Error manejando start para ${phoneNumber}:`, error);
    }
  }

  /**
   * Obtener estado de conexiones activas
   */
  public getStatus() {
    return {
      totalInstances: this.instances.size,
      activeConnections: this.activeConnections.size,
      connections: Array.from(this.activeConnections.entries()).map(([id, conn]) => ({
        id,
        phoneNumber: conn.config.phoneNumber,
        interactionCount: conn.interactionCount,
        marks: conn.marks.length,
        configId: conn.config.id
      }))
    };
  }
}

export default new WebSocketManagerService();
// // src/services/wsManagerService.ts
// import WebSocket from 'ws';
// import { Request } from 'express';
// import WebSocketConfigService from './wsService';
// import logger from '../utils/logger';

// class WebSocketManagerService {
//   private instances: Map<string, any>;
//   private activeConnections: Map<string, any>;

//   constructor() {
//     this.instances = new Map();
//     this.activeConnections = new Map();
//     console.log('📋 WebSocketManagerService creado');
//   }

//   /**
//    * CRÍTICO: Esta función debe registrar la ruta WebSocket correctamente
//    */
//   async initializeWebSockets(wsInstance: any): Promise<void> {
//     console.log('🔧 Iniciando inicialización de WebSockets...');
//     console.log('🔧 wsInstance type:', typeof wsInstance);
//     console.log('🔧 wsInstance.app type:', typeof wsInstance.app);
//     console.log('🔧 wsInstance.app.ws type:', typeof wsInstance.app.ws);

//     // Verificar que wsInstance.app.ws existe
//     if (!wsInstance.app.ws) {
//       throw new Error('❌ wsInstance.app.ws no está disponible');
//     }

//     try {
//       // **PASO 1**: Inicializar configuraciones
//       console.log('📊 Inicializando configuraciones...');
//       await WebSocketConfigService.initialize();
//       const configs = await WebSocketConfigService.listWebSocketConfigs();
//       console.log(`📊 Cargadas ${configs.length} configuraciones`);

//       // **PASO 2**: Mostrar configuraciones cargadas
//       configs.forEach(config => {
//         console.log(`📋 Config: ${config.id} -> ${config.phoneNumber} (${config.isActive ? 'ACTIVA' : 'INACTIVA'})`);
//       });

//       // **PASO 3**: Registrar la ruta WebSocket - SIMPLIFICADO PARA DEBUG
//       console.log('🔌 Registrando ruta WebSocket /connection...');
      
//       wsInstance.app.ws('/connection', (ws: WebSocket, req: Request) => {
//         const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//         console.log(`✅ Nueva conexión WebSocket: ${connectionId}`);
        
//         // **PASO 4**: Configurar manejadores básicos
//         ws.on('error', (error) => {
//           console.error(`❌ WebSocket error [${connectionId}]:`, error);
//         });

//         ws.on('message', async (data) => {
//           try {
//             const msg = JSON.parse(data.toString());
//             console.log(`📨 [${connectionId}] Evento: ${msg.event}`);

//             if (msg.event === 'connected') {
//               console.log(`🔗 [${connectionId}] WebSocket conectado con Twilio`);
//             }
//             else if (msg.event === 'start') {
//               const phoneNumber = msg.start?.customParameters?.phoneNumber;
//               const streamSid = msg.start?.streamSid;
              
//               console.log(`🚀 [${connectionId}] Stream iniciado:`, {
//                 streamSid,
//                 phoneNumber,
//                 callSid: msg.start?.callSid
//               });
              
//               if (phoneNumber) {
//                 await this.handleStreamStart(ws, msg, phoneNumber, connectionId);
//               } else {
//                 console.warn(`⚠️ [${connectionId}] No se recibió phoneNumber en customParameters`);
//               }
//             }
//             else if (msg.event === 'media') {
//               // Solo log cada 100 mensajes de media para no saturar
//               if (Math.random() < 0.01) { // 1% de los mensajes
//                 console.log(`🎵 [${connectionId}] Audio recibido (${msg.media?.payload?.length || 0} bytes)`);
//               }
//             }
//             else if (msg.event === 'stop') {
//               console.log(`🛑 [${connectionId}] Stream finalizado`);
//               this.activeConnections.delete(connectionId);
//             }
//             else if (msg.event === 'mark') {
//               console.log(`🏁 [${connectionId}] Mark: ${msg.mark?.name}`);
//             }

//           } catch (error) {
//             console.error(`❌ [${connectionId}] Error procesando mensaje:`, error);
//           }
//         });

//         ws.on('close', () => {
//           console.log(`🔌 [${connectionId}] WebSocket desconectado`);
//           this.activeConnections.delete(connectionId);
//         });
//       });

//       console.log('✅ WebSocket /connection registrado correctamente');
      
//       // **PASO 5**: Verificar que la ruta está realmente registrada
//       console.log('🔍 Verificando rutas WebSocket registradas...');
//       if (wsInstance.app._router && wsInstance.app._router.stack) {
//         const wsRoutes = wsInstance.app._router.stack.filter((layer: any) => 
//           layer.route && layer.route.path && layer.route.path.includes('connection')
//         );
//         console.log(`📋 Rutas WebSocket encontradas: ${wsRoutes.length}`);
//       }

//     } catch (error) {
//       console.error('❌ Error inicializando WebSockets:', error);
//       throw error;
//     }
//   }

//   private async handleStreamStart(ws: WebSocket, msg: any, phoneNumber: string, connectionId: string) {
//     try {
//       console.log(`🔍 [${connectionId}] Buscando configuración para: ${phoneNumber}`);
      
//       const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
//       console.log(`✅ [${connectionId}] Configuración encontrada:`, {
//         id: config.id,
//         phone: config.phoneNumber,
//         active: config.isActive,
//         welcomeMessage: config.welcomeMessage?.substring(0, 50) + '...'
//       });

//       // Almacenar conexión activa
//       this.activeConnections.set(connectionId, {
//         config,
//         streamSid: msg.start.streamSid,
//         phoneNumber,
//         startTime: new Date()
//       });

//       // **TEST**: Enviar mensaje de prueba para verificar conectividad
//       console.log(`🧪 [${connectionId}] Enviando mensaje de prueba...`);
      
//       // Simular respuesta de bienvenida
//       const welcomeMessage = config.welcomeMessage || `Hola, bienvenido a ${phoneNumber}`;
      
//       // Enviar marca de prueba
//       ws.send(JSON.stringify({
//         event: 'mark',
//         streamSid: msg.start.streamSid,
//         mark: {
//           name: `welcome_${connectionId}`
//         }
//       }));

//       console.log(`✅ [${connectionId}] Configuración completada para ${phoneNumber}`);

//     } catch (error) {
//       console.error(`❌ [${connectionId}] Error manejando start para ${phoneNumber}:`, error);
//     }
//   }

//   // Métodos de configuración simplificados...
//   private handleConfigAdded(config: any): void {
//     console.log(`➕ Config añadida: ${config.id}`);
//   }

//   private handleConfigUpdated(config: any): void {
//     console.log(`🔄 Config actualizada: ${config.id}`);
//   }

//   private handleConfigRemoved(config: any): void {
//     console.log(`➖ Config eliminada: ${config.id}`);
//   }

//   // **NUEVO**: Método para obtener estado de conexiones
//   public getStatus() {
//     return {
//       totalInstances: this.instances.size,
//       activeConnections: this.activeConnections.size,
//       connections: Array.from(this.activeConnections.entries()).map(([id, conn]) => ({
//         id,
//         phoneNumber: conn.phoneNumber,
//         streamSid: conn.streamSid,
//         startTime: conn.startTime
//       }))
//     };
//   }
// }

// export default new WebSocketManagerService();
