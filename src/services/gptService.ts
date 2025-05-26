// services/gptService.ts
import { EventEmitter } from 'events';
import OpenAI from 'openai';

/**
 * Define las interfaces para los mensajes de contexto del usuario
 */
interface UserContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

/**
 * Define la interfaz para la respuesta parcial de GPT
 */
interface GptReply {
  partialResponseIndex: number | null;
  partialResponse: string;
}

/**
 * Servicio para comunicación con OpenAI GPT
 */
export class GptService extends EventEmitter {
  private openai: OpenAI;
  private userContext: UserContextMessage[];
  public partialResponseIndex: number;

  /**
   * Constructor: configura el asistente de IA con su personalidad e información inicial
   * @param customPrompt Prompt personalizado para la personalidad del asistente
   * @param welcomeMessage Mensaje de bienvenida personalizado
   */
  constructor(customPrompt?: string, welcomeMessage?: string) {
    super();
    this.openai = new OpenAI();
    
    // Prompt personalizado o por defecto
    const systemPrompt = customPrompt || 
      `You are a helpful assistant for Bart's Automotive. 
      Keep your responses brief but friendly. Don't ask more than 1 question at a time. 
      If asked about services not listed below, politely explain we don't offer that service but can refer them to another shop.
      Key Information:
      - Hours: Monday to Friday 9 AM to 5 PM
      - Address: 123 Little Collins Street, Melbourne
      - Services: Car service, brake repairs, transmission work, towing, and general repairs
      You must add a '•' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.`;

    // Mensaje de bienvenida personalizado o por defecto
    const defaultWelcomeMessage = 'Welcome to Bart\'s Automotive. • How can I help you today?';
    const greetingMessage = welcomeMessage || defaultWelcomeMessage;

    this.userContext = [
      // Instrucciones iniciales e información para la IA
      { 'role': 'system', 'content': systemPrompt },
      // Mensaje de bienvenida
      { 'role': 'assistant', 'content': greetingMessage },
    ];
    this.partialResponseIndex = 0;    // Rastrea piezas de respuesta para mantener el orden
  }

  /**
   * Almacena el ID único de la llamada
   */
  setCallSid(callSid: string): void {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  /**
   * Agrega nuevos mensajes al historial de conversación
   */
  updateUserContext(name: string, role: 'system' | 'user' | 'assistant', text: string): void {
    if (name !== 'user') {
      this.userContext.push({ 'role': role, 'name': name, 'content': text });
    } else {
      this.userContext.push({ 'role': role, 'content': text });
    }
  }

  /**
   * Función principal que maneja la obtención de respuestas de GPT
   * Emite eventos 'gptreply' con fragmentos de respuesta
   */
  async completion(text: string, interactionCount: number = 0, role: 'system' | 'user' | 'assistant' = 'user', name: string = 'user'): Promise<void> {
    // Agrega el mensaje del usuario al historial de conversación
    this.updateUserContext(name, role, text);

    try {
      // Obtiene respuesta en streaming de GPT
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o',  // Puede ser ajustado según configuración
        messages: this.userContext,
        stream: true,
      });

      // Rastrea tanto la respuesta completa como los fragmentos para hablar
      let completeResponse = '';
      let partialResponse = '';

      // Procesa cada pieza de la respuesta de GPT según llega
      for await (const chunk of stream) {
        let content = chunk.choices[0]?.delta?.content || '';
        let finishReason = chunk.choices[0].finish_reason;

        completeResponse += content;
        partialResponse += content;

        // Cuando encontramos un marcador de pausa (•) o el final, enviamos ese fragmento para habla
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const gptReply: GptReply = { 
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          };
          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }

      // Agrega la respuesta completa de GPT al historial de conversación
      this.userContext.push({'role': 'assistant', 'content': completeResponse});
      console.log(`GPT -> user context length: ${this.userContext.length}`);
    } catch (error) {
      console.error('Error en la solicitud a GPT:', error);
      // Emitir un mensaje de error
      this.emit('error', error);
    }
  }

  /**
   * Actualiza el prompt del sistema
   */
  updateSystemPrompt(newPrompt: string): void {
    // Buscar el mensaje del sistema en el contexto y actualizarlo
    for (let i = 0; i < this.userContext.length; i++) {
      if (this.userContext[i].role === 'system' && !this.userContext[i].name) {
        this.userContext[i].content = newPrompt;
        return;
      }
    }
    
    // Si no se encuentra un mensaje del sistema, añadir uno nuevo
    this.userContext.unshift({ 'role': 'system', 'content': newPrompt });
  }
}