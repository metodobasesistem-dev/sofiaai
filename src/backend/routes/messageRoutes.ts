import { Router } from 'express';
import { sessionController } from '../controllers/sessionController.js';

const router = Router();

// The user specifically requested /api/messages/send
router.post('/send', sessionController.sendMessage);

export default router;
