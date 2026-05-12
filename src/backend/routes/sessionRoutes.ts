import { Router } from 'express';
console.log('[Routes] Loading sessionRoutes.ts...');
import { sessionController } from '../controllers/sessionController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.use((req, res, next) => {
  console.log(`[sessionRoutes] Request received: ${req.method} ${req.url}`);
  next();
});

router.post('/create',     requireAuth, sessionController.createSession);
router.get('/status/:userId', requireAuth, sessionController.getStatus);
router.get('/restore/:userId', requireAuth, sessionController.restoreSession);
router.post('/send',       requireAuth, sessionController.sendMessage);
router.post('/disconnect', requireAuth, sessionController.disconnectSession);
router.post('/delete',     requireAuth, sessionController.deleteSession);
router.get('/health', (req, res) => res.json({ status: 'ok', message: 'Session router is active' }));

export default router;
