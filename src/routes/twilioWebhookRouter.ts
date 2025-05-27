// routes/twilioWebhookRoutes.ts
import { Router } from 'express';
import twilioWebhookController from '../controllers/twilioWebhookController';

const router = Router();

/**
 * @route   POST /api/twilio/incoming/:phoneNumber?
 * @desc    Webhook para llamadas entrantes de Twilio
 * @access  Público
 */
// router.post('/incoming/:phoneNumber', twilioWebhookController.handleIncomingCall);

export default router;