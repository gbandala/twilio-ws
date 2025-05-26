// models/websocket.model.ts
/**
 * Interfaz para la configuración de WebSocket
 */
export interface WebSocketConfig {
  id: string;                  // Identificador único del WebSocket
  phoneNumber: string;         // Número de teléfono asociado
  prompt: string;              // Prompt personalizado para GPT
  welcomeMessage?: string;     // Mensaje de bienvenida personalizado
  voiceModel: string;          // Modelo de voz a utilizar
  isActive: boolean;           // Estado del WebSocket (activo/inactivo)
  basePath: string;            // Ruta base para el WebSocket (generado automáticamente como "/connection/{id}")
}

/**
 * Tipo para crear una nueva configuración de WebSocket
 */
export type CreateWebSocketConfigRequest = WebSocketConfig;

/**
 * Tipo para actualizar una configuración de WebSocket existente
 */
export type UpdateWebSocketConfigRequest = Partial<WebSocketConfig>;