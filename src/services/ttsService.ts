// services/ttsService.ts
import { EventEmitter } from 'events';
import axios from 'axios';

/**
 * Servicio para conversión de texto a voz
 */
export class TtsService extends EventEmitter {
  private apiKey: string;
  private voiceModel: string;
  private apiUrl: string;

  /**
   * Constructor del servicio TTS
   */
  constructor(voiceModel?: string) {
    super();
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    this.voiceModel = voiceModel || process.env.VOICE_MODEL || 'aura-asteria-en';
    this.apiUrl = 'https://api.deepgram.com/v1/speak';
  }

  /**
   * Genera audio a partir de texto
   * Emite evento 'audio' con el audio generado en base64
   */
  async generate(text: string): Promise<void> {
    try {
      if (!text || text.trim() === '') {
        return;
      }

      // Configurar la solicitud a Deepgram
      const headers = {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      };

      const data = {
        text: text.replace(/•/g, ''), // Eliminar marcadores de pausa
        voice: this.voiceModel,
        encoding: 'mulaw',
        sample_rate: 8000
      };

      // Hacer la solicitud a Deepgram
      const response = await axios.post(this.apiUrl, data, {
        headers,
        responseType: 'arraybuffer'
      });

      if (response.status !== 200) {
        throw new Error(`Failed to generate audio: ${response.statusText}`);
      }

      // Convertir el audio a Base64 para su transmisión
      const audioBuffer = Buffer.from(response.data);
      const audioBase64 = audioBuffer.toString('base64');

      // Emitir el evento de audio
      this.emit('audio', audioBase64);
    } catch (error) {
      console.error('Error en generación TTS:', error);
      this.emit('error', error);
    }
  }

  /**
   * Actualiza el modelo de voz
   */
  updateVoiceModel(newModel: string): void {
    this.voiceModel = newModel;
  }

  /**
   * Obtiene el modelo de voz actual
   */
  getVoiceModel(): string {
    return this.voiceModel;
  }
}