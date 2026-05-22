import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_TOKEN = process.env.EVOLUTION_AUTH_BASE64;
const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL;
const SECRET = process.env.EVOLUTION_WEBHOOK_SECRET;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': API_KEY || ''
  }
});

async function runTestFlow() {
  console.log("=== EVOLUTION API INTEGRATION TEST FLOW ===");
  console.log(`Evolution URL: ${API_URL}`);
  console.log(`API Key: ${API_KEY ? 'Present (ends with ' + API_KEY.slice(-4) + ')' : 'Missing'}`);
  console.log(`Instance Token: ${INSTANCE_TOKEN ? 'Present (ends with ' + INSTANCE_TOKEN.slice(-4) + ')' : 'Missing'}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Webhook Secret: ${SECRET}`);

  const testInstanceName = "test_antigravity_instance";

  try {
    // Step 1: Create instance
    console.log(`\n1. Creating test instance: "${testInstanceName}"...`);
    const createRes = await api.post('/instance/create', {
      instanceName: testInstanceName,
      token: INSTANCE_TOKEN,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true
    });
    console.log("Create Instance Response Status:", createRes.status);
    console.log("Create Instance Response:", JSON.stringify(createRes.data, null, 2));

    // Step 2: Configure Webhook (if URL is present)
    if (WEBHOOK_URL) {
      console.log(`\n2. Configuring Webhook for "${testInstanceName}"...`);
      let targetWebhookUrl = WEBHOOK_URL;
      if (SECRET && !targetWebhookUrl.includes('token=')) {
        const separator = targetWebhookUrl.includes('?') ? '&' : '?';
        targetWebhookUrl = `${targetWebhookUrl}${separator}token=${SECRET}`;
      }
      console.log(`Target Webhook URL: ${targetWebhookUrl}`);
      
      const webhookRes = await api.post(`/webhook/set/${testInstanceName}`, {
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
      console.log("Webhook Set Response Status:", webhookRes.status);
      console.log("Webhook Set Response:", JSON.stringify(webhookRes.data, null, 2));
    } else {
      console.log("\n2. Webhook configuration skipped (no BACKEND_WEBHOOK_URL set).");
    }

    // Step 3: Fetch QR Code
    console.log(`\n3. Fetching QR Code / Connection state for "${testInstanceName}"...`);
    const connectRes = await api.get(`/instance/connect/${testInstanceName}`);
    console.log("Connect Response Status:", connectRes.status);
    if (connectRes.data && connectRes.data.code) {
      console.log("Success! Pairing/QR Code data received.");
      console.log("QR Code Base64 (first 100 chars):", connectRes.data.base64?.substring(0, 100) + "...");
      console.log("Pairing Code:", connectRes.data.code);
    } else {
      console.log("Connect Response:", JSON.stringify(connectRes.data, null, 2));
    }

    // Step 4: Check instance connection state
    console.log(`\n4. Checking connection state for "${testInstanceName}"...`);
    const stateRes = await api.get(`/instance/connectionState/${testInstanceName}`);
    console.log("Connection State Response:", JSON.stringify(stateRes.data, null, 2));

    // Step 5: Clean up (Delete the instance)
    console.log(`\n5. Deleting test instance "${testInstanceName}" for cleanup...`);
    const logoutRes = await api.post(`/instance/logout/${testInstanceName}`).catch(() => ({ status: 'skipped (already logged out)' }));
    console.log("Logout status:", logoutRes.status);

    const deleteRes = await api.delete(`/instance/delete/${testInstanceName}`);
    console.log("Delete Instance Response Status:", deleteRes.status);
    console.log("Delete Instance Response:", JSON.stringify(deleteRes.data, null, 2));

    console.log("\n=== TEST FLOW COMPLETED SUCCESSFULLY! ===");
  } catch (error) {
    console.error("\n❌ TEST FLOW FAILED:", error.response?.data || error.message);
    
    // Attempt cleanup if instance was created
    try {
      console.log(`\nAttempting cleanup: Deleting "${testInstanceName}"...`);
      await api.delete(`/instance/delete/${testInstanceName}`);
      console.log("Cleanup delete successful.");
    } catch (e) {
      console.log("Cleanup delete failed or instance did not exist.");
    }
  }
}

runTestFlow();
