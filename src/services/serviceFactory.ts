// services/serviceFactory.ts
import { GptService } from './gptService';
import { TranscriptionService } from './transcriptionService';
import { TtsService } from './ttsService';
import { WebSocketConfig } from '../models/websocket.model';
import  { logger } from '../utils/logger';

/**
 * Clase factory para crear instancias de servicios basados en la configuración
 */
export class ServiceFactory {
  /**
   * Crear una instancia de GptService
   */
  static createGptService(config: WebSocketConfig): GptService {
    logger.detailed('info',`Creando servicio GPT con prompt: ${config.prompt.substring(0, 50)}...`);
    // Crear una instancia personalizada con el prompt y mensaje de bienvenida configurados
    return new GptService(config.prompt, config.welcomeMessage);
  }

  /**
   * Crear una instancia de TranscriptionService
   */
  static createTranscriptionService(): TranscriptionService {
    logger.detailed('info', 'Creando servicio de transcripción');
    return new TranscriptionService();
  }

  /**
   * Crear una instancia de TtsService
   */
  static createTtsService(config: WebSocketConfig): TtsService {
    logger.detailed('info', `Creando servicio TTS con modelo de voz: ${config.voiceModel}`);
    // Crear una instancia personalizada con el modelo de voz configurado
    return new TtsService(config.voiceModel);
  }

  /**
   * Método para crear servicios necesarios para un WebSocket
   * Nota: StreamService se crea por conexión, no por configuración
   */
  static createServices(config: WebSocketConfig): {
    gptService: GptService;
    transcriptionService: TranscriptionService;
    ttsService: TtsService;
  } {
    return {
      gptService: this.createGptService(config),
      transcriptionService: this.createTranscriptionService(),
      ttsService: this.createTtsService(config)
    };
  }
}

export default ServiceFactory;