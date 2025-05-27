import winston from 'winston';
import 'dotenv/config';
import 'colors';

export enum LogLevel {
  CRITICAL = 0,    // Solo eventos críticos (errores, inicio/fin de llamadas)
  IMPORTANT = 1,   // Eventos importantes (transcripciones, respuestas GPT)
  DETAILED = 2,    // Debug detallado (audio packets, marks)
  VERBOSE = 3      // Todo (incluyendo cada packet de audio)
}

// // Configuración del logger con winston
// const logger = winston.createLogger({
//   level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
//   format: winston.format.combine(
//     winston.format.timestamp({
//       format: 'YYYY-MM-DD HH:mm:ss'
//     }),
//     winston.format.errors({ stack: true }),
//     winston.format.splat(),
//     winston.format.json()
//   ),
//   defaultMeta: { service: 'ai-voice-assistant' },
//   transports: [
//     // Escribir todos los logs con nivel 'error' o menor a 'error.log'
//     // Escribir todos los logs con nivel 'info' o menor a 'combined.log'
//     // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
//     // new winston.transports.File({ filename: 'logs/combined.log' }),
//   ],
// });

// Si no estamos en producción, también imprimimos en la consola
// if (process.env.NODE_ENV !== 'production') {
//   logger.add(new winston.transports.Console({
//     format: winston.format.combine(
//       winston.format.colorize(),
//       winston.format.simple()
//     ),
//   }));
// }
export class OptimizedLogger {
  private static instance: OptimizedLogger;
  private logLevel: LogLevel;
  private counters: Map<string, number> = new Map();
  private lastLogs: Map<string, number> = new Map();
  private logThrottles: Map<string, number> = new Map();

  constructor() {
    // Configurar nivel desde ENV o default IMPORTANT
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'CRITICAL': this.logLevel = LogLevel.CRITICAL; break;
      case 'IMPORTANT': this.logLevel = LogLevel.IMPORTANT; break;
      case 'DETAILED': this.logLevel = LogLevel.DETAILED; break;
      case 'VERBOSE': this.logLevel = LogLevel.VERBOSE; break;
      default: this.logLevel = LogLevel.IMPORTANT;
    }

    console.log(`🔧 Logger configurado en nivel: ${LogLevel[this.logLevel]}`.cyan);
  }

  static getInstance(): OptimizedLogger {
    if (!OptimizedLogger.instance) {
      OptimizedLogger.instance = new OptimizedLogger();
    }
    return OptimizedLogger.instance;
  }

  /**
   * Log crítico - Siempre se muestra
   */
  critical(connectionId: string, message: string, data?: any): void {
    const fullMessage = `🚨 [${connectionId}] ${message}`;
    console.log(fullMessage.red);
    if (data && this.logLevel >= LogLevel.DETAILED) {
      console.log('   Data:', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Log de evento importante (transcripciones, GPT, conexiones)
   */
  important(connectionId: string, message: string, data?: any): void {
    if (this.logLevel >= LogLevel.IMPORTANT) {
      const fullMessage = `✅ [${connectionId}] ${message}`;
      console.log(fullMessage.green);
      if (data && this.logLevel >= LogLevel.DETAILED) {
        console.log('   Data:', data);
      }
    }
  }

  /**
   * Log detallado (eventos de audio, marks, etc.)
   */
  detailed(connectionId: string, message: string, data?: any): void {
    if (this.logLevel >= LogLevel.DETAILED) {
      const fullMessage = `🔧 [${connectionId}] ${message}`;
      console.log(fullMessage.yellow);
      if (data && this.logLevel >= LogLevel.VERBOSE) {
        console.log('   Data:', data);
      }
    }
  }

  /**
   * Log verboso - Solo en modo debug completo
   */
  verbose(connectionId: string, message: string, data?: any): void {
    if (this.logLevel >= LogLevel.VERBOSE) {
      const fullMessage = `💬 [${connectionId}] ${message}`;
      console.log(fullMessage.gray);
      if (data) {
        console.log('   Data:', data);
      }
    }
  }

  /**
   * Log con throttling - Reduce logs repetitivos
   */
  throttled(connectionId: string, key: string, message: string, interval: number = 5000): void {
    const throttleKey = `${connectionId}_${key}`;
    const now = Date.now();
    const lastLog = this.lastLogs.get(throttleKey) || 0;
    
    // Incrementar contador
    const count = (this.counters.get(throttleKey) || 0) + 1;
    this.counters.set(throttleKey, count);

    // Solo log si ha pasado el intervalo
    if (now - lastLog > interval) {
      const throttleMessage = count > 1 
        ? `${message} (x${count} en últimos ${interval/1000}s)`
        : message;
      
      this.detailed(connectionId, throttleMessage);
      this.lastLogs.set(throttleKey, now);
      this.counters.set(throttleKey, 0);
    }
  }

  /**
   * Log de progreso con estadísticas
   */
  progress(connectionId: string, audioPackets: number, transcriptions: number, interactions: number): void {
    if (this.logLevel >= LogLevel.IMPORTANT && audioPackets % 500 === 0) {
      const message = `📊 Progreso: ${audioPackets} audio, ${transcriptions} transcripciones, ${interactions} interacciones`;
      this.important(connectionId, message);
      
      // Warning si hay problemas
      if (audioPackets > 200 && transcriptions === 0) {
        this.critical(connectionId, '⚠️  PROBLEMA: Audio sin transcripciones - revisar Deepgram');
      } else if (transcriptions > interactions + 2) {
        this.critical(connectionId, '⚠️  PROBLEMA: Transcripciones sin respuestas GPT');
      }
    }
  }

  /**
   * Log de evento de WebSocket
   */
  websocketEvent(connectionId: string, event: string, details?: any): void {
    switch (event) {
      case 'start':
        this.important(connectionId, `🚀 Llamada iniciada`, details);
        break;
      case 'stop':
        this.important(connectionId, `🔚 Llamada terminada`);
        break;
      case 'media':
        this.throttled(connectionId, 'media', '🎤 Audio recibido', 3000);
        break;
      case 'mark':
        this.detailed(connectionId, `🏁 Mark: ${details?.name}`);
        break;
      default:
        this.verbose(connectionId, `📨 Evento: ${event}`, details);
    }
  }

  /**
   * Log de transcripción
   */
  transcription(connectionId: string, type: 'partial' | 'final', text: string, count?: number): void {
    if (type === 'partial') {
      this.throttled(connectionId, 'partial_transcription', `💭 Transcripción parcial: "${text.substring(0, 30)}..."`);
    } else {
      this.important(connectionId, `🎯 TRANSCRIPCIÓN #${count}: "${text}"`);
    }
  }

  /**
   * Log de GPT
   */
  gpt(connectionId: string, type: 'request' | 'response', text: string, interaction?: number): void {
    if (type === 'request') {
      this.important(connectionId, `📨 GPT Request #${interaction}: "${text}"`);
    } else {
      this.important(connectionId, `🤖 GPT Response #${interaction}: "${text}"`);
    }
  }

  /**
   * Log de TTS
   */
  tts(connectionId: string, type: 'start' | 'success' | 'error', details?: any): void {
    switch (type) {
      case 'start':
        this.detailed(connectionId, `🎵 TTS iniciado: "${details?.text?.substring(0, 30)}..."`);
        break;
      case 'success':
        this.detailed(connectionId, `🔊 TTS completado: ${details?.audioSize} bytes - ${details?.label}`);
        break;
      case 'error':
        this.critical(connectionId, `❌ TTS Error: ${details?.error}`);
        break;
    }
  }

  /**
   * Log de Stream
   */
  stream(connectionId: string, type: 'sent' | 'buffered', details?: any): void {
    if (type === 'sent') {
      this.detailed(connectionId, `📻 Audio enviado a Twilio: ${details?.label}`);
    } else {
      this.throttled(connectionId, 'audio_buffered', '📤 Audio buffereado para envío', 2000);
    }
  }

  /**
   * Configurar nivel dinámicamente
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
    console.log(`🔧 Logger nivel cambiado a: ${LogLevel[level]}`.cyan);
  }

  /**
   * Obtener estadísticas de logging
   */
  getStats(): any {
    return {
      currentLevel: LogLevel[this.logLevel],
      throttledMessages: this.counters.size,
      counters: Object.fromEntries(this.counters)
    };
  }

  /**
   * Reset contadores
   */
  reset(): void {
    this.counters.clear();
    this.lastLogs.clear();
    this.logThrottles.clear();
    console.log('🔄 Logger stats reset'.cyan);
  }
}

// Singleton export
export const logger = OptimizedLogger.getInstance();
// export default logger;