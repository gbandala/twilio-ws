import { EventEmitter } from 'events';
import { WebSocketConfig } from '../models/wsModel';
import { CrearWebSocketConfigDTO, ActualizarWebSocketConfigDTO } from '../dtos/wsDTO';
import { createError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Servicio para gestionar las configuraciones de WebSocket
 */
class WebSocketConfigService extends EventEmitter {
  private configurations: Map<string, WebSocketConfig>;
  private initialized: boolean = false;

  constructor() {
    super();
    this.configurations = new Map<string, WebSocketConfig>();
    logger.info('WebSocketConfigService inicializado');
  }

  /**
   * Inicializa el servicio cargando las configuraciones desde la base de datos
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Cargar todas las configuraciones desde la base de datos
      const configs = await WebSocketConfig.findAll();

      // Guardar las configuraciones en memoria
      configs.forEach(config => {
        this.configurations.set(config.id, config);
        logger.debug(`Configuración cargada: ${config.id}`);
      });

      this.initialized = true;
      logger.info(`Se cargaron ${configs.length} configuraciones de WebSocket desde la base de datos`);
    } catch (error) {
      logger.error('Error al inicializar WebSocketConfigService:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las configuraciones
   */
  async listWebSocketConfigs(): Promise<WebSocketConfig[]> {
    await this.ensureInitialized();
    return Array.from(this.configurations.values());
  }

  /**
   * Obtener una configuración específica por ID
   */
  async getWebSocketConfig(id: string): Promise<WebSocketConfig> {
    await this.ensureInitialized();
    const config = this.configurations.get(id);

    if (!config) {
      throw createError(`Configuración de WebSocket con ID ${id} no encontrada`, 404, 'CONFIG_NOT_FOUND');
    }

    return config;
  }

  /**
   * Obtener una configuración por número de teléfono
   */
  async getWebSocketConfigByPhone(phoneNumber: string): Promise<WebSocketConfig> {
    await this.ensureInitialized();

    const config = Array.from(this.configurations.values()).find(
      config => config.phoneNumber === phoneNumber
    );

    if (!config) {
      throw createError(`Configuración de WebSocket para el número ${phoneNumber} no encontrada`, 404, 'CONFIG_NOT_FOUND');
    }

    return config;
  }

  /**
   * Crear una nueva configuración
   */
  async createWebSocketConfig(data: CrearWebSocketConfigDTO): Promise<WebSocketConfig> {
    await this.ensureInitialized();

    if (this.configurations.has(data.id)) {
      throw createError(`Ya existe una configuración con ID ${data.id}`, 409, 'DUPLICATE_ID');
    }

    try {
      // Convertir el DTO a un objeto plano antes de pasarlo a Sequelize
      const plainData = {
        id: data.id,
        phoneNumber: data.phoneNumber,
        prompt: data.prompt,
        welcomeMessage: data.welcomeMessage,
        voiceModel: data.voiceModel,
        isActive: data.isActive ?? true,
        basePath: `/connection/${data.id}`
      };

      // Crear la configuración en la base de datos
      const newConfig = await WebSocketConfig.create(plainData);

      // Guardar en memoria
      this.configurations.set(newConfig.id, newConfig);

      // Emitir evento de configuración añadida
      this.emit('configAdded', newConfig);

      return newConfig;
    } catch (error) {
      logger.error('Error al crear configuración de WebSocket:', error);
      throw error;
    }
  }

  /**
   * Actualizar una configuración existente
   */
  async updateWebSocketConfig(id: string, data: ActualizarWebSocketConfigDTO): Promise<WebSocketConfig> {
    await this.ensureInitialized();

    const config = await this.getWebSocketConfig(id);

    try {
      // Convertir el DTO a un objeto plano antes de pasarlo a Sequelize
      const plainData: any = {};

      if (data.phoneNumber !== undefined) plainData.phoneNumber = data.phoneNumber;
      if (data.prompt !== undefined) plainData.prompt = data.prompt;
      if (data.welcomeMessage !== undefined) plainData.welcomeMessage = data.welcomeMessage;
      if (data.voiceModel !== undefined) plainData.voiceModel = data.voiceModel;
      if (data.isActive !== undefined) plainData.isActive = data.isActive;
      
      // Actualizar la configuración en la base de datos
      await config.update(plainData);

      // Actualizar en memoria
      this.configurations.set(id, config);

      // Emitir evento de configuración actualizada
      this.emit('configUpdated', config);

      return config;
    } catch (error) {
      logger.error(`Error al actualizar configuración de WebSocket ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar una configuración
   */
  async deleteWebSocketConfig(id: string): Promise<void> {
    await this.ensureInitialized();

    const config = await this.getWebSocketConfig(id);

    try {
      // Eliminar de la base de datos
      await config.destroy();

      // Eliminar de memoria
      this.configurations.delete(id);

      // Emitir evento de configuración eliminada
      this.emit('configRemoved', config);
    } catch (error) {
      logger.error(`Error al eliminar configuración de WebSocket ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener configuración por ruta base
   */
  getConfigByBasePath(path: string): WebSocketConfig | undefined {
    return Array.from(this.configurations.values()).find(
      config => path.startsWith(config.basePath)
    );
  }

  /**
   * Asegura que el servicio esté inicializado
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Exportar una instancia única para ser utilizada en toda la aplicación
export default new WebSocketConfigService();