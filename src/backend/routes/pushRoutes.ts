import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { PushNotificationService } from '../services/pushNotificationService.js';

const router = Router();

// Endpoint para registrar assinatura do browser
router.post('/subscribe', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const subscription = req.body;

  try {
    await PushNotificationService.saveSubscription(userId, subscription);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
