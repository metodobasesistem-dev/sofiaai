import { Router } from 'express';
import { sessionController } from '../controllers/sessionController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Ensure all message routes are authenticated
router.use(requireAuth);

router.post('/send', sessionController.sendMessage);
router.post('/delete', sessionController.deleteMessage);
router.post('/react', sessionController.reactToMessage);

export default router;

