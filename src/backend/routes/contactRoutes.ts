import { Router } from 'express';
import { contactController } from '../controllers/contactController.js';

const router = Router();

// Route to sync existing threads to contacts
router.post('/sync', contactController.syncContacts);

export default router;
