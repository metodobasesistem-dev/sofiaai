import { Router } from 'express';
console.log('[Routes] Loading sessionRoutes.ts...');
import { sessionController } from '../controllers/sessionController.js';

const router = Router();

router.use((req, res, next) => {
  console.log(`[sessionRoutes] Request received: ${req.method} ${req.url}`);
  next();
});

router.post('/create', sessionController.createSession);
router.get('/status/:userId', sessionController.getStatus);
router.post('/send', sessionController.sendMessage);
router.post('/disconnect', sessionController.disconnectSession);
router.get('/health', (req, res) => res.json({ status: 'ok', message: 'Session router is active' }));

export default router;
