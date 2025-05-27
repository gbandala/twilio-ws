// services/ttsService.ts
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import { Buffer } from 'node:buffer';

/**
 * Interfaz para la respuesta de GPT
 */
interface GptReply {
  partialResponseIndex: number | null;
  partialResponse: string;
}

/**
 * Servicio para conversión de texto a voz
 */
export class TtsService extends EventEmitter {
  private apiKey: string;
  private voiceModel: string;

  /**
   * Constructor del servicio TTS
   */
  constructor(voiceModel?: string) {
    super();
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    this.voiceModel = voiceModel || process.env.VOICE_MODEL || 'aura-asteria-en';
  }

  /**
   * **MÉTODO CORREGIDO**: Usa el mismo patrón que tu TTS que funciona
   */
  async generate(input: string | GptReply, interactionCount: number = 0): Promise<void> {
    let responseIndex: number | null = null;
    try {
      let text: string;

      // Determinar si es string simple o objeto GptReply
      if (typeof input === 'string') {
        text = input;
        responseIndex = null;
      } else {
        text = input.partialResponse;
        responseIndex = input.partialResponseIndex;
      }

      // Omite si no hay texto para convertir
      if (!text || text.trim() === '') {
        console.warn('TTS: Texto vacío, omitiendo generación');
        return;
      }

      console.log(`🎙️ TTS: Generando audio para: "${text.substring(0, 50)}..."`);

      // **FORMATO CORRECTO**: Parámetros en URL como tu TTS original
      const url = `https://api.deepgram.com/v1/speak?model=${this.voiceModel}&encoding=mulaw&sample_rate=8000&container=none`;
      
      console.log(`🔧 TTS: URL: ${url}`);
      console.log(`🔧 TTS: Modelo de voz: ${this.voiceModel}`);

      // **PETICIÓN IGUAL A TU TTS ORIGINAL**
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.replace(/•/g, '').trim(), // Solo el texto, igual que tu original
        }),
      });

      console.log(`🔧 TTS: Response status: ${response.status}`);

      // **MANEJO DE RESPUESTA IGUAL A TU ORIGINAL**
      if (response.status === 200) {
        try {
          // Convierte la respuesta de audio al formato base64 (igual que tu original)
          const blob = await response.blob();
          const audioArrayBuffer = await blob.arrayBuffer();
          const audioBase64 = Buffer.from(audioArrayBuffer).toString('base64');

          // Crear etiqueta única para rastreo
          const label = `tts_${Date.now()}_${interactionCount}_${Math.random().toString(36).substr(2, 5)}`;

          console.log(`✅ TTS: Audio generado exitosamente (${audioArrayBuffer.byteLength} bytes) - ${label}`);

          // **EVENTOS**: Formato para wsManagerService + compatibilidad
          this.emit('speech', responseIndex, audioBase64, label, interactionCount);
          this.emit('audio', audioBase64);

        } catch (err) {
          console.error('❌ TTS: Error procesando audio:', err);
          this.sendEmergencyAudio(responseIndex, interactionCount);
        }
      } else {
        console.error('❌ TTS: Deepgram error:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url
        });

        // Intentar leer el error de Deepgram
        try {
          const errorText = await response.text();
          console.error('❌ TTS: Error details:', errorText);
        } catch (e) {
          console.error('❌ TTS: No se pudo leer error de Deepgram');
        }

        this.sendEmergencyAudio(responseIndex, interactionCount);
      }

    } catch (err) {
      console.error('❌ TTS: Error en petición:', err);
      this.sendEmergencyAudio(responseIndex, interactionCount);
    }
  }

  /**
   * **NUEVO**: Método para enviar audio de emergencia
   */
  private sendEmergencyAudio(responseIndex: number | null, interactionCount: number): void {
    console.log(`🚨 TTS: Enviando audio de emergencia...`);
    
    // Último recurso: silencio de 1 segundo
    const silentAudio = Buffer.alloc(8000).toString('base64'); // 1 segundo de silencio mulaw 8khz
    const emergencyLabel = `emergency_${Date.now()}`;
    
    console.log(`🔇 TTS: Enviando silencio como audio de emergencia - ${emergencyLabel}`);
    this.emit('speech', responseIndex, silentAudio, emergencyLabel, interactionCount);
  }

  /**
   * **NUEVO**: Método de compatibilidad exacta con tu TTS original
   */
  async generateOriginal(gptReply: GptReply, interactionCount: number): Promise<void> {
    const { partialResponseIndex, partialResponse } = gptReply;

    // Omite si no hay texto para convertir (igual que tu original)
    if (!partialResponse) { return; }

    try {
      // **EXACTAMENTE IGUAL A TU TTS ORIGINAL**
      const response = await fetch(
        `https://api.deepgram.com/v1/speak?model=${this.voiceModel}&encoding=mulaw&sample_rate=8000&container=none`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: partialResponse,
          }),
        }
      );

      // Maneja la respuesta exitosa (igual que tu original)
      if (response.status === 200) {
        try {
          const blob = await response.blob();
          const audioArrayBuffer = await blob.arrayBuffer();
          const base64String = Buffer.from(audioArrayBuffer).toString('base64');

          // **ADAPTADO**: Emite los eventos que espera wsManagerService
          const label = `tts_${Date.now()}_${interactionCount}`;
          this.emit('speech', partialResponseIndex, base64String, label, interactionCount);
          
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('Deepgram TTS error:');
        console.log(response);
      }
    } catch (err) {
      console.error('Error occurred in TextToSpeech service');
      console.error(err);
    }
  }

  /**
   * Actualiza el modelo de voz
   */
  updateVoiceModel(newModel: string): void {
    console.log(`🔄 TTS: Actualizando modelo: ${this.voiceModel} -> ${newModel}`);
    this.voiceModel = newModel;
  }

  /**
   * Obtiene el modelo de voz actual
   */
  getVoiceModel(): string {
    return this.voiceModel;
  }

  /**
   * **NUEVO**: Test usando el formato que funciona
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 TTS: Probando conexión con formato original...');
      
      const url = `https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw&sample_rate=8000&container=none`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Test connection'
        }),
      });

      const success = response.status === 200;
      console.log(`${success ? '✅' : '❌'} TTS: Test ${success ? 'exitoso' : 'falló'} - Status: ${response.status}`);
      
      if (!success) {
        const errorText = await response.text();
        console.log('Error details:', errorText);
      }
      
      return success;

    } catch (error) {
      console.error('❌ TTS: Test de conexión falló:', error);
      return false;
    }
  }
}