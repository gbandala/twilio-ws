// controllers/twilioWebhookController.ts
import { Request, Response, NextFunction } from 'express';
import websocketConfigService from '../services/wsService';
import { createError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { twiml } from 'twilio';

// Interfaz para mensajes de Twilio
interface TwilioMessage {
  event: string;
  start?: {
    streamSid: string;
    callSid: string;
  };
  media?: {
    payload: string;
  };
  mark?: {
    name: string;
  };
  sequenceNumber?: number;
}

/**
 * Controlador para los webhooks de Twilio
 */
class TwilioWebhookController {
  /**
   * Maneja las llamadas entrantes de Twilio
   */
  async handleIncomingCall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log('........................Llamada entrante a Twilio Webhook.................');
      // Obtener el número de teléfono de los parámetros o usar un valor por defecto
      const phoneNumber = req.params.phoneNumber || 'default';

      // logger.debug(`..............Llamada entrante para el número: ${phoneNumber}`);

      // Buscar la configuración correspondiente al número de teléfono
      let config;

      try {
        config = await websocketConfigService.getWebSocketConfigByPhone(phoneNumber);
        // console.log('.............Configuración de WebSocket para el número:', config);
      } catch (error) {
        logger.error(`No se encontró configuración para el número: ${phoneNumber}`);
        next(createError(`No hay configuración activa para el número: ${phoneNumber}`, 404, 'CONFIG_NOT_FOUND'));
        return;
      }

      if (!config.isActive) {
        logger.error(`La configuración para el número ${phoneNumber} está inactiva`);
        next(createError(`La configuración para el número ${phoneNumber} está inactiva`, 400, 'CONFIG_INACTIVE'));
        return;
      }

      // Obtener el servidor desde las variables de entorno
      const serverHost = process.env.SERVER || req.get('host') || 'localhost';
     const websocketPath = `/connection/${phoneNumber}`;
      // console.log(`............Servidor WebSocket: ${serverHost}${websocketPath}`);
      // console.log(`............Servidor WebSocket: ${serverHost}${config.basePath}`);
      // 

      // Generar TwiML response para establecer la conexión WebSocket
      // const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      //     <Response>
      //       <Say language="es-MX">La llamada puede ser monitoreada o grabada.</Say>
      //       <Connect>
      //         <Stream url="wss://${serverHost}${websocketPath}" />
      //       </Connect>
      //     </Response>`;

      // // Enviar respuesta
      // res.type('text/xml');
      // res.send(twiml);
      const VoiceResponse = twiml.VoiceResponse;
      const response = new VoiceResponse();
      const connect = response.connect();
      response.say({ language: 'es-MX' }, 'La llamada puede ser monitoreada o grabada.');
      // Indica a Twilio dónde conectar el flujo de medios de la llamada
      connect.stream({ url: `wss://${serverHost}${websocketPath}` });
      res.type('text/xml');
      res.end(response.toString());

      // logger.debug(`TwiML enviado para la conexión WebSocket: ${websocketPath}`);
    } catch (error) {
      logger.error('Error al manejar la llamada entrante:', error);
      next(createError('Error al manejar la llamada entrante', 500, 'INTERNAL_SERVER_ERROR'));
      next(error);
    }
  }
}

export default new TwilioWebhookController();