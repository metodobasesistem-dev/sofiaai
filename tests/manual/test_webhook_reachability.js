import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testWebhook() {
  console.log('Sending mock webhook...');
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET || '';
  const webhookUrl = `https://baseai.natandesouza.com.br/api/whatsapp/evolution/webhook?token=${secret}`;
  try {
     const res = await axios.post(webhookUrl, {
         event: 'MESSAGES_UPSERT',
         instance: 'wppai_6524ad04',
         data: {
             messages: [{
                 key: { remoteJid: '5511999999999@s.whatsapp.net', id: '12345' },
                 message: { conversation: 'Testing Webhook Reachability' }
             }]
         }
     });
     console.log('Webhook Response:', res.status, res.data);
  } catch (error) {
     console.error('Webhook Error:', error.message);
     if (error.response) {
         console.error(error.response.status, error.response.data);
     }
  }
}

testWebhook();
