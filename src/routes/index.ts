// routes/index.ts
import { Router } from 'express';
import websocketRoutes from './wsRouter';
import twilioWebhookRoutes from './twilioWebhookRouter';

const router = Router();

// Punto base para verificar estado del API
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Ultravox Agents API funcionando correctamente',
    version: '1.0.0',
  });
});



// Rutas para WebSocket Configurations
router.use('/websockets', websocketRoutes);

// Rutas para Webhooks de Twilio
// router.use('/', twilioWebhookRoutes);

export default router;