import { Request, Response, NextFunction } from 'express';
import WebSocketConfigService from '../services/wsService';
import { WebSocketConfigMapper } from '../dtos/wsMapper';
import  { logger } from '../utils/logger';

/**
 * Controlador para las operaciones con WebSocketConfig
 */
class WebSocketConfigController {
  /**
   * Obtiene la lista de todas las configuraciones de WebSocket
   */
  async getAllWebSocketConfigs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const configs = await WebSocketConfigService.listWebSocketConfigs();
      const responseDTOs = WebSocketConfigMapper.toResponseDTOList(configs);
      
      res.status(200).json({
        success: true,
        data: responseDTOs
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene una configuración de WebSocket específica por su ID
   */
  async getWebSocketConfigById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID de la configuración es requerido'
        });
        return;
      }

      const config = await WebSocketConfigService.getWebSocketConfig(id);
      const responseDTO = WebSocketConfigMapper.toResponseDTO(config);
      
      res.status(200).json({
        success: true,
        data: responseDTO
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene una configuración de WebSocket por número de teléfono
   */
  async getWebSocketConfigByPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber } = req.params;
      
      if (!phoneNumber) {
        res.status(400).json({
          success: false,
          error: 'Número de teléfono es requerido'
        });
        return;
      }

      const config = await WebSocketConfigService.getWebSocketConfigByPhone(phoneNumber);
      const responseDTO = WebSocketConfigMapper.toResponseDTO(config);
      
      res.status(200).json({
        success: true,
        data: responseDTO
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva configuración de WebSocket
   */
  async createWebSocketConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const configDTO = WebSocketConfigMapper.fromRequest(req);
      logger.detailed('info', `Creando WebSocket config con datos: ${JSON.stringify(configDTO)}`);

      const config = WebSocketConfigMapper.toWebSocketConfig(configDTO);
      const createdConfig = await WebSocketConfigService.createWebSocketConfig(config);
      
      const responseDTO = WebSocketConfigMapper.toResponseDTO(createdConfig);
      
      res.status(201).json({
        success: true,
        data: responseDTO
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza una configuración de WebSocket existente
   */
  async updateWebSocketConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID de la configuración es requerido'
        });
        return;
      }

      const updateDTO = WebSocketConfigMapper.fromRequestForUpdate(req);
      logger.detailed('info', `Actualizando WebSocket config ${id} con datos: ${JSON.stringify(updateDTO)}`);
      
      const updatedConfig = await WebSocketConfigService.updateWebSocketConfig(id, updateDTO);
      const responseDTO = WebSocketConfigMapper.toResponseDTO(updatedConfig);
      
      res.status(200).json({
        success: true,
        data: responseDTO
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Elimina una configuración de WebSocket
   */
  async deleteWebSocketConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID de la configuración es requerido'
        });
        return;
      }

      logger.detailed('info', `Eliminando WebSocket config ${id}`);
      
      await WebSocketConfigService.deleteWebSocketConfig(id);
      
      res.status(200).json({
        success: true,
        message: `WebSocket config ${id} eliminada exitosamente`
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new WebSocketConfigController();