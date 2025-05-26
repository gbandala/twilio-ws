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
}

/**
 * Servicio para gestionar instancias de WebSocket
 */
class WebSocketManagerService {
  private instances: Map<string, WebSocketInstance>;
  private responseIndices: Map<string, number | null>;

  constructor() {
    this.instances = new Map();
    this.responseIndices = new Map();
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
    
    // Configurar middleware para manejar todas las conexiones WebSocket
    wsInstance.app.ws('*', (ws: WebSocket, req: Request) => {
      const path = req.path;
      const config = WebSocketConfigService.getConfigByBasePath(path);

      if (!config || !config.isActive) {
        logger.error(`No hay configuración activa para la ruta: ${path}`);
        ws.close(1008, 'WebSocket no configurado o inactivo');
        return;
      }

      // Obtener la instancia del WebSocket
      const instance = this.instances.get(config.id);
      if (!instance) {
        logger.error(`Instancia WebSocket no encontrada para la configuración: ${config.id}`);
        ws.close(1011, 'Instancia WebSocket no encontrada');
        return;
      }

      // Manejar la conexión WebSocket
      this.handleWebSocketConnection(ws, instance);
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
    
    // Almacenar la instancia
    this.instances.set(config.id, {
      config,
      gptService,
      transcriptionService,
      ttsService
    });
    
    logger.debug(`Instancia WebSocket creada para la configuración: ${config.id}`);
  }

  /**
   * Manejar la actualización de una configuración
   */
  private handleConfigUpdated(config: WebSocketConfig): void {
    logger.info(`Configuración WebSocket actualizada: ${config.id}`);
    
    // Si la configuración existe, actualizamos los servicios
    if (this.instances.has(config.id)) {
      const currentInstance = this.instances.get(config.id)!;
      
      // Actualizar la configuración
      currentInstance.config = config;
      
      // Actualizar los servicios si es necesario
      currentInstance.gptService.updateSystemPrompt(config.prompt);
      currentInstance.ttsService.updateVoiceModel(config.voiceModel);
      
      logger.debug(`Instancia WebSocket actualizada para la configuración: ${config.id}`);
    } else {
      // Si no existe, crear una nueva instancia
      this.handleConfigAdded(config);
    }
  }

  /**
   * Manejar la eliminación de una configuración
   */
  private handleConfigRemoved(config: WebSocketConfig): void {
    logger.info(`Configuración WebSocket eliminada: ${config.id}`);
    
    // Eliminar la instancia
    if (this.instances.has(config.id)) {
      this.instances.delete(config.id);
      logger.debug(`Instancia WebSocket eliminada para la configuración: ${config.id}`);
    }
  }

  /**
   * Manejar una conexión WebSocket
   */
  private handleWebSocketConnection(ws: WebSocket, instance: WebSocketInstance): void {
    const { gptService, transcriptionService, ttsService } = instance;
    const connectionId = Date.now().toString(); // ID único para esta conexión
    
    logger.info(`Nueva conexión WebSocket para ${instance.config.id}`);

    // Inicializar el índice de respuesta para esta conexión
    this.responseIndices.set(connectionId, null);

    // Crear el servicio de stream con el websocket actual
    const streamService = new StreamService(ws);

    // Manejar mensajes entrantes
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.event === 'start') {
          logger.debug(`Evento 'start' recibido para ${instance.config.id}`);
          // Configurar el streamSid cuando se recibe un evento start
          if (data.streamSid) {
            streamService.setStreamSid(data.streamSid);
            gptService.setCallSid(data.streamSid);
          }
        } else if (data.event === 'media') {
          // Enviar audio a transcription service
          transcriptionService.send(data.media.payload);
        } else if (data.event === 'stop') {
          logger.debug(`Evento 'stop' recibido para ${instance.config.id}`);
          // Limpiar recursos al finalizar
          this.responseIndices.delete(connectionId);
        } else if (data.event === 'mark') {
          // Procesar eventos de marca si es necesario
          logger.debug(`Marca recibida: ${data.mark?.name}`);
        }
      } catch (error) {
        logger.error('Error procesando mensaje WebSocket:', error);
      }
    });

    // Configurar listener para transcripciones
    transcriptionService.on('transcription', (text) => {
      logger.debug(`Transcripción recibida: ${text}`);
      // Enviar texto a GPT service con contador de interacción
      const interactionCount = 0; // Debería llevarse un contador de interacciones
      gptService.completion(text, interactionCount);
    });

    // Configurar listener para respuestas parciales de GPT
    gptService.on('gptreply', (gptReplyData: any, interactionCount: number) => {
      logger.debug(`Respuesta parcial GPT recibida: ${gptReplyData.partialResponse}`);
      // Enviar texto a TTS service
      ttsService.generate(gptReplyData.partialResponse);
      
      // Guardar el índice de respuesta para esta conexión
      this.responseIndices.set(connectionId, gptReplyData.partialResponseIndex);
    });

    // Configurar listener para audio generado
    ttsService.on('audio', (audio) => {
      logger.debug('Audio generado recibido');
      // Obtener el índice actual para esta conexión
      const currentIndex = this.responseIndices.get(connectionId) ?? null;
      // Enviar audio al stream service con el índice de respuesta
      streamService.buffer(currentIndex, audio);
    });

    // Listener para cuando se envía el audio
    streamService.on('audiosent', (markLabel) => {
      logger.debug(`Audio enviado con marca: ${markLabel}`);
      // Aquí podrías manejar eventos adicionales después de enviar el audio
    });

    // Listener para cierre de conexión
    ws.on('close', () => {
      logger.info(`Conexión WebSocket cerrada para ${instance.config.id}`);
      // Limpiar recursos
      this.responseIndices.delete(connectionId);
    });

    // Listener para errores de conexión
    ws.on('error', (error) => {
      logger.error(`Error en conexión WebSocket para ${instance.config.id}:`, error);
    });
  }
}

// Exportar una instancia única para ser utilizada en toda la aplicación
export default new WebSocketManagerService();