import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL;
const SECRET = process.env.EVOLUTION_WEBHOOK_SECRET;

if (!API_URL || !API_KEY) {
  console.error("Missing EVOLUTION_API_URL or EVOLUTION_API_KEY in .env.local");
  process.exit(1);
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': API_KEY
  }
});

async function reconfigureWebhooks() {
  console.log("=== RECONFIGURING ALL WEBHOOKS ON EVOLUTION API ===");
  console.log(`Evolution URL: ${API_URL}`);
  console.log(`Backend Webhook Base URL: ${WEBHOOK_URL}`);
  console.log(`Webhook Secret (Token): ${SECRET ? 'Present' : 'Not configured'}`);

  if (!WEBHOOK_URL || WEBHOOK_URL.includes('your-backend-url')) {
    console.error("❌ ERROR: BACKEND_WEBHOOK_URL is not properly configured.");
    return;
  }

  // Build the target webhook URL with security token
  let targetWebhookUrl = WEBHOOK_URL;
  if (SECRET && !targetWebhookUrl.includes('token=')) {
    const separator = targetWebhookUrl.includes('?') ? '&' : '?';
    targetWebhookUrl = `${targetWebhookUrl}${separator}token=${SECRET}`;
  }
  console.log(`Target Webhook URL: ${targetWebhookUrl}\n`);

  try {
    // 1. Fetch all instances from Evolution API
    console.log("1. Fetching active instances from Evolution API...");
    const { data: instances } = await api.get('/instance/fetchInstances');
    console.log(`Found ${instances.length} instances.`);

    if (instances.length === 0) {
      console.log("No instances found. Nothing to reconfigure.");
      return;
    }

    // 2. Loop and set webhooks for each instance
    for (const inst of instances) {
      const name = inst.instance?.instanceName || inst.name || inst;
      console.log(`\n--- Instance: ${name} ---`);
      
      try {
        console.log(`Updating Webhook for instance "${name}"...`);
        const response = await api.post(`/webhook/set/${name}`, {
          webhook: {
            enabled: true,
            url: targetWebhookUrl,
            webhookByEvents: false,
            events: [
              'MESSAGES_UPSERT',
              'CONNECTION_UPDATE',
              'QRCODE_UPDATED',
              'MESSAGES_UPDATE',
              'MESSAGES_DELETE',
              'SEND_MESSAGE'
            ]
          }
        });
        
        console.log(`✅ Success! Webhook response status: ${response.status}`);
      } catch (err) {
        console.error(`❌ Failed to update webhook for ${name}:`, err.response?.data || err.message);
      }
    }

    console.log("\n=== WEBHOOK RECONFIGURATION COMPLETED ===");
  } catch (error) {
    console.error("❌ CRITICAL ERROR:", error.response?.data || error.message);
  }
}

reconfigureWebhooks();
