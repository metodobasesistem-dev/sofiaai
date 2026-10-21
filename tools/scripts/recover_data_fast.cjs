const axios = require('axios');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

dotenv.config({ path: '.env.local' });

async function insertMessagesOnly() {
  const API_URL = process.env.EVOLUTION_API_URL;
  const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = "e7ca25cf-5c65-4f3f-aed9-192f6fe28a80";
  const instanceName = "wppai_e7ca25cf"; 

  console.log('Fetching messages again to insert...');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json', 'apikey': GLOBAL_API_KEY }
  });

  try {
    let allMessages = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const { data } = await api.post(`/chat/findMessages/${instanceName}`, { page, limit: 100 });
      if (page === 1 && data.messages?.pages) totalPages = data.messages.pages;
      allMessages = allMessages.concat(data.messages?.records || []);
      page++;
    }

    const normalizePhone = (jid) => jid.split('@')[0].replace(/\\D/g, '');
    const tsToIso = (ts) => new Date(ts > 0 && ts < 1e11 ? ts * 1000 : ts).toISOString();
    const extractText = (msg) => {
       const m = msg.message;
       if (!m) return '';
       return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
    };

    let processedMsgs = [];
    let uniqueWhatsappIds = new Set();
    
    for (const msg of allMessages) {
       const remoteJid = msg.key?.remoteJid || msg.key?.remoteJidAlt;
       if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) continue;
       const cleanPhone = normalizePhone(remoteJid);
       if (!cleanPhone) continue;
       
       const wId = msg.key.id;
       if (uniqueWhatsappIds.has(wId)) continue; // avoid duplicates from api
       uniqueWhatsappIds.add(wId);

       const timestamp = msg.messageTimestamp * 1000;
       processedMsgs.push({
          id: randomUUID(),
          whatsapp_id: wId,
          user_id: userId,
          thread_id: `${userId}_${cleanPhone}`,
          text: extractText(msg) || '(Mensagem sem texto)',
          direction: msg.key.fromMe ? 'outbound' : 'inbound',
          is_ai: false,
          message_type: Object.keys(msg.message || {})[0]?.replace('Message', '') || 'text',
          status: msg.status || 'sent',
          timestamp: timestamp,
          created_at: tsToIso(timestamp)
       });
    }

    console.log(`Upserting ${processedMsgs.length} messages...`);
    
    // Insert msgs in batches
    for (let i = 0; i < processedMsgs.length; i += 500) {
       const batch = processedMsgs.slice(i, i + 500);
       // use ignoreDuplicates to bypass the unique constraint error
       const { error } = await supabase.from('messages').upsert(batch, { onConflict: 'whatsapp_id', ignoreDuplicates: true });
       if (error) console.error(`Error inserting msgs batch:`, error.message);
       console.log(`Processed ${Math.min(i + 500, processedMsgs.length)} / ${processedMsgs.length} messages.`);
    }

    console.log(`\nMessages insertion completed!`);
  } catch (err) {
    console.error('Error during recovery:', err.message);
  }
}

insertMessagesOnly();
