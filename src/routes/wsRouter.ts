import { Router } from 'express';
import WebSocketConfigController from '../controllers/wsController';

const router = Router();

/**
 * @route   GET /api/websockets
 * @desc    Obtener todas las configuraciones de WebSocket
 * @access  Privado
 */
router.get('/websockets', WebSocketConfigController.getAllWebSocketConfigs);

/**
 * @route   GET /api/websockets/:id
 * @desc    Obtener una configuración de WebSocket por ID
 * @access  Privado
 */
router.get('/id/:id', WebSocketConfigController.getWebSocketConfigById);

/**
 * @route   GET /api/websockets/phone/:phoneNumber
 * @desc    Obtener una configuración de WebSocket por número de teléfono
 * @access  Privado
 */
router.get('/:phoneNumber', WebSocketConfigController.getWebSocketConfigByPhone);

/**
 * @route   POST /api/websockets
 * @desc    Crear una nueva configuración de WebSocket
 * @access  Privado
 */
router.post('/', WebSocketConfigController.createWebSocketConfig);

/**
 * @route   PUT /api/websockets/:id
 * @desc    Actualizar una configuración de WebSocket
 * @access  Privado
 */
router.put('/id/:id', WebSocketConfigController.updateWebSocketConfig);

/**
 * @route   DELETE /api/websockets/:id
 * @desc    Eliminar una configuración de WebSocket
 * @access  Privado
 */
router.delete('/id/:id', WebSocketConfigController.deleteWebSocketConfig);

export default router;