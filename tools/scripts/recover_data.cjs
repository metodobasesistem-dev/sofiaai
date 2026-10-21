const axios = require('axios');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

dotenv.config({ path: '.env.local' });

async function recoverData() {
  const API_URL = process.env.EVOLUTION_API_URL;
  const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = "e7ca25cf-5c65-4f3f-aed9-192f6fe28a80";
  const instanceName = "wppai_e7ca25cf"; 

  console.log('Starting data recovery for:', userId);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const api = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': GLOBAL_API_KEY
    }
  });

  try {
    // 1. Fetch all chats
    console.log(`Fetching chats for ${instanceName}...`);
    let allChats = [];
    let page = 1;
    while (true) {
      const { data } = await api.post(`/chat/findChats/${instanceName}`, { page, limit: 100 });
      const chats = data.records || data.chats || data;
      if (!chats || chats.length === 0) break;
      allChats = allChats.concat(chats);
      console.log(`Fetched page ${page} of chats. Total so far: ${allChats.length}`);
      if (chats.length < 100) break;
      page++;
    }
    
    console.log(`Total chats to process: ${allChats.length}`);

    // Clean phone number helper
    const normalizePhone = (jid) => jid.split('@')[0].replace(/\\D/g, '');
    const tsToIso = (ts) => new Date(ts > 0 && ts < 1e11 ? ts * 1000 : ts).toISOString();
    const extractText = (msg) => {
       const m = msg.message;
       if (!m) return '';
       return m.conversation || 
              m.extendedTextMessage?.text || 
              m.imageMessage?.caption || 
              m.videoMessage?.caption || 
              '';
    };

    let totalMessagesProcessed = 0;

    for (const chat of allChats) {
      const remoteJid = chat.remoteJid || chat.id;
      // skip system / group messages if we only want DMs, or just try them anyway
      if (remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) continue;

      const cleanPhone = normalizePhone(remoteJid);
      if (!cleanPhone) continue;

      const threadId = `${userId}_${cleanPhone}`;
      const contactName = chat.pushName || cleanPhone;
      
      // Upsert Contact
      await supabase.from('contacts').upsert({
        id: threadId,
        user_id: userId,
        telefone: cleanPhone,
        nome: contactName,
        status_funil: 'Lead',
        source: 'whatsapp',
        data_criacao: tsToIso(chat.updatedAt || Date.now())
      }, { onConflict: 'id' });

      // Upsert Thread
      await supabase.from('threads').upsert({
        id: threadId,
        user_id: userId,
        remote_jid: remoteJid,
        display_phone: cleanPhone,
        contact_name: contactName,
        status: 'human', // Set all restored threads to human to avoid AI accidentally replying
        updated_at: tsToIso(chat.updatedAt || Date.now())
      }, { onConflict: 'id' });

      // Fetch messages for this chat
      let msgPage = 1;
      let chatMsgCount = 0;
      while (true) {
        const { data: mData } = await api.post(`/chat/findMessages/${instanceName}`, { 
          where: { remoteJid }, 
          page: msgPage, 
          limit: 100 
        });
        const records = mData.messages?.records || mData.records || [];
        if (!records || records.length === 0) break;
        
        const messagesToInsert = records.map(msg => {
           const timestamp = msg.messageTimestamp * 1000;
           return {
              id: randomUUID(),
              whatsapp_id: msg.key.id,
              user_id: userId,
              thread_id: threadId,
              text: extractText(msg) || '(Mensagem sem texto)',
              direction: msg.key.fromMe ? 'outbound' : 'inbound',
              is_ai: false,
              message_type: Object.keys(msg.message || {})[0]?.replace('Message', '') || 'text',
              status: msg.status || 'sent',
              timestamp: timestamp,
              created_at: tsToIso(timestamp)
           };
        });

        if (messagesToInsert.length > 0) {
           const { error } = await supabase.from('messages').upsert(messagesToInsert, { onConflict: 'id' });
           if (error) console.error(`Error inserting msgs for ${remoteJid}:`, error.message);
        }

        chatMsgCount += records.length;
        totalMessagesProcessed += records.length;
        if (records.length < 100) break;
        msgPage++;
      }
      
      console.log(`Processed ${chatMsgCount} msgs for ${contactName}`);
    }

    console.log(`\nRecovery completed successfully! Processed ${allChats.length} chats and ${totalMessagesProcessed} messages.`);
  } catch (err) {
    console.error('Error during recovery:', err.response?.data || err.message);
  }
}

recoverData();
