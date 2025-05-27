import { Router } from 'express';
import WebSocketConfigController from '../controllers/wsController';


const router = Router();

/**
 * @route   GET /api/websockets
 * @desc    Obtener todas las configuraciones de WebSocket
 * @access  Privado
 */
router.get('/list', WebSocketConfigController.getAllWebSocketConfigs);

/**
 * @route   GET /api/websockets/:id
 * @desc    Obtener una configuración de WebSocket por ID
 * @access  Privado
 */
router.get('/:id', WebSocketConfigController.getWebSocketConfigById);

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
router.put('/:id', WebSocketConfigController.updateWebSocketConfig);

/**
 * @route   DELETE /api/websockets/:id
 * @desc    Eliminar una configuración de WebSocket
 * @access  Privado
 */
router.delete('/:id', WebSocketConfigController.deleteWebSocketConfig);
/**
 * @route   POST /api/twilio/incoming/:phoneNumber?
 * @desc    Webhook para llamadas entrantes de Twilio
 * @access  Público
 */
// router.post('/incoming/:phoneNumber', twilioWebhookController.handleIncomingCall);

export default router;