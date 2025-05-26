// dtos/wsDTO.ts
/**
 * DTO para WebSocketConfig
 */
export class WebSocketConfigDTO {
  constructor() {
    this.id = '';
    this.phoneNumber = '';
    this.prompt = '';
    this.voiceModel = '';
    this.isActive = false;
    this.basePath = '';
  }
  
  id: string;
  phoneNumber: string;
  prompt: string;
  welcomeMessage?: string;
  voiceModel: string;
  isActive: boolean;
  basePath: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * DTO para crear un WebSocketConfig
 */
export class CrearWebSocketConfigDTO {
  constructor() {
    this.id = '';
    this.phoneNumber = '';
    this.prompt = '';
    this.voiceModel = '';
    this.isActive = true;
    this.basePath = '';
  }

  id: string;
  phoneNumber: string;
  prompt: string;
  welcomeMessage?: string;
  voiceModel: string;
  isActive: boolean;
  basePath: string;
}

/**
 * DTO para actualizar un WebSocketConfig
 */
export class ActualizarWebSocketConfigDTO {
  phoneNumber?: string;
  prompt?: string;
  welcomeMessage?: string;
  voiceModel?: string;
  isActive?: boolean;
  basePath?: string;
}

/**
 * DTO para respuesta de WebSocketConfig
 */
export class WebSocketConfigResponseDTO {
  constructor() {
    this.id = '';
    this.created_at = '';
    this.phoneNumber = '';
    this.prompt = '';
    this.voiceModel = '';
    this.isActive = false;
    this.basePath = '';
  }
  
  id: string;
  created_at: string;
  phoneNumber: string;
  prompt: string;
  welcomeMessage?: string;
  voiceModel: string;
  isActive: boolean;
  basePath: string;
}