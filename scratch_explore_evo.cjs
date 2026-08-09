const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

async function exploreEvolutionData() {
  const API_URL = process.env.EVOLUTION_API_URL;
  const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY;
  const instanceName = "wppai_e7ca25cf"; 

  const api = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': GLOBAL_API_KEY
    }
  });

  try {
    console.log(`Fetching chats for ${instanceName}...`);
    const { data: chats } = await api.post(`/chat/findChats/${instanceName}`);
    console.log(`Found ${chats?.length} chats. First chat:`, chats[0]?.remoteJid);
    
    if (chats && chats.length > 0) {
       const remoteJid = chats[0].remoteJid;
       console.log(`Fetching messages for chat ${remoteJid}...`);
       // Let's try GET endpoint for messages? No, Evolution v2 uses POST usually.
       // Let's try sending just the payload for findMessages
       const { data: messagesData } = await api.post(`/chat/findMessages/${instanceName}`, {
          where: { remoteJid: remoteJid }
       });
       console.log(`MessagesData keys:`, Object.keys(messagesData));
       console.log(`MessagesData:`, JSON.stringify(messagesData).substring(0, 300));
    }
  } catch (err) {
    console.error('Error exploring data:', err.response?.data || err.message);
  }
}

exploreEvolutionData();
