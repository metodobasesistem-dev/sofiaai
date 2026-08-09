const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function quickTest() {
  const api = axios.create({
    baseURL: process.env.EVOLUTION_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_API_KEY
    }
  });

  const { data } = await api.post(`/chat/findMessages/wppai_e7ca25cf`, {
    page: 1, limit: 100
  });

  console.log('Total messages:', data.messages?.total || data.length);
  console.log('Total pages:', data.messages?.pages);
  console.log('Records returned:', data.messages?.records?.length);
  if (data.messages?.records?.length > 0) {
     console.log('First message remoteJid:', data.messages.records[0].key.remoteJid);
  }
}

quickTest();
