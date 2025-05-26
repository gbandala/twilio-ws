import { WebSocketConfig } from '../models/wsModel';
import { WebSocketConfigResponseDTO, CrearWebSocketConfigDTO, ActualizarWebSocketConfigDTO } from './wsDTO';
import { Request } from 'express';

/**
 * Clase para mappear entre modelos y DTOs de WebSocketConfig
 */
export class WebSocketConfigMapper {
  /**
   * Crea un DTO a partir de un request
   */
  static fromRequest(req: Request): CrearWebSocketConfigDTO {
    const dto = new CrearWebSocketConfigDTO();
    const body = req.body;

    dto.id = body.id;
    dto.phoneNumber = body.phoneNumber;
    dto.prompt = body.prompt;
    dto.welcomeMessage = body.welcomeMessage;
    dto.voiceModel = body.voiceModel;

    // Validar que isActive sea un booleano, o usar true por defecto
    if (body.isActive === undefined) {
      dto.isActive = true;
    } else {
      // Convertir explícitamente a booleano
      dto.isActive = body.isActive === true || body.isActive === 'true';
    }


    return dto;
  }

  /**
   * Crea un DTO de actualización a partir de un request
   */
  static fromRequestForUpdate(req: Request): ActualizarWebSocketConfigDTO {
    const dto = new ActualizarWebSocketConfigDTO();
    const body = req.body;

    if (body.phoneNumber !== undefined) dto.phoneNumber = body.phoneNumber;
    if (body.prompt !== undefined) dto.prompt = body.prompt;
    if (body.welcomeMessage !== undefined) dto.welcomeMessage = body.welcomeMessage;
    if (body.voiceModel !== undefined) dto.voiceModel = body.voiceModel;

    // Si isActive está definido en el body, lo procesamos
    if (body.isActive !== undefined) {
      // Convertir explícitamente a booleano
      dto.isActive = body.isActive === true || body.isActive === 'true';
    }



    return dto;
  }

  /**
   * Convierte un DTO de creación a un modelo
   */
  static toWebSocketConfig(dto: CrearWebSocketConfigDTO): WebSocketConfig {
    const config = new WebSocketConfig();

    config.id = dto.id;
    config.phoneNumber = dto.phoneNumber;
    config.prompt = dto.prompt;
    config.welcomeMessage = dto.welcomeMessage;
    config.voiceModel = dto.voiceModel;
    config.isActive = dto.isActive || true;
    config.basePath = dto.basePath;

    return config;
  }

  /**
   * Aplica actualizaciones de un DTO a un modelo existente
   */
  static applyUpdates(config: WebSocketConfig, dto: ActualizarWebSocketConfigDTO): WebSocketConfig {
    if (dto.phoneNumber !== undefined) config.phoneNumber = dto.phoneNumber;
    if (dto.prompt !== undefined) config.prompt = dto.prompt;
    if (dto.welcomeMessage !== undefined) config.welcomeMessage = dto.welcomeMessage;
    if (dto.voiceModel !== undefined) config.voiceModel = dto.voiceModel;
    if (dto.isActive !== undefined) config.isActive = dto.isActive;
    if (dto.basePath !== undefined) config.basePath = dto.basePath;

    return config;
  }

  /**
   * Convierte un modelo a un DTO de respuesta
   */
  static toResponseDTO(config: WebSocketConfig): WebSocketConfigResponseDTO {
    const response = new WebSocketConfigResponseDTO();
    response.id = config.id;
    const createdAt = config.createdAt || new Date();
    response.created_at = createdAt instanceof Date ?
      createdAt.toISOString() :
      createdAt.toString();


    response.phoneNumber = config.phoneNumber;
    response.prompt = config.prompt;
    response.welcomeMessage = config.welcomeMessage;
    response.voiceModel = config.voiceModel;
    response.isActive = config.isActive;
    response.basePath = config.basePath;

    return response;
  }

  /**
   * Convierte una lista de modelos a una lista de DTOs de respuesta
   */
  static toResponseDTOList(configs: WebSocketConfig[]): WebSocketConfigResponseDTO[] {
    return configs.map(this.toResponseDTO);
  }
}