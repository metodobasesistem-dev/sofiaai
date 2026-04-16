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

export default router;
