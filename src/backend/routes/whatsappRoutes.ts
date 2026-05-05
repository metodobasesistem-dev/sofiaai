import { Router } from 'express';
import multer from 'multer';
import { whatsappService } from '../services/whatsappService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/send-voice', upload.single('audio'), async (req, res) => {
  const { userId, remoteJid } = req.body;
  const audioFile = req.file;

  if (!userId || !remoteJid || !audioFile) {
    return res.status(400).json({ error: 'Faltam parâmetros: userId, remoteJid e audio são necessários.' });
  }

  try {
    console.log(`[WhatsappRoutes] 🎙️ Recebido pedido de envio de voz para ${remoteJid}`);
    await whatsappService.sendVoice(userId, remoteJid, audioFile.buffer);
    res.json({ success: true, message: 'Áudio enviado com sucesso!' });
  } catch (err: any) {
    console.error('[WhatsappRoutes] Erro ao enviar áudio:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao enviar áudio.' });
  }
});

router.post('/send-media', upload.single('media'), async (req, res) => {
  const { userId, remoteJid, caption } = req.body;
  const mediaFile = req.file;

  if (!userId || !remoteJid || !mediaFile) {
    return res.status(400).json({ error: 'Faltam parâmetros: userId, remoteJid e media são necessários.' });
  }

  try {
    console.log(`[WhatsappRoutes] 📎 Recebido pedido de envio de mídia para ${remoteJid}`);
    await whatsappService.sendMedia(userId, remoteJid, mediaFile.buffer, mediaFile.mimetype, mediaFile.originalname, caption);
    res.json({ success: true, message: 'Mídia enviada com sucesso!' });
  } catch (err: any) {
    console.error('[WhatsappRoutes] Erro ao enviar mídia:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao enviar mídia.' });
  }
});

router.post('/sync', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Faltando userId' });

  try {
    const result = await whatsappService.syncInstance(userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
