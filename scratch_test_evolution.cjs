const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function createTestInstance() {
  const API_URL = process.env.EVOLUTION_API_URL;
  const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY;
  const INSTANCE_TOKEN = process.env.EVOLUTION_AUTH_BASE64;
  const testInstanceName = "wppai_test_" + Date.now();

  console.log(`Using API URL: ${API_URL}`);
  console.log(`Using Global API Key: ${GLOBAL_API_KEY.substring(0, 5)}...`);

  const api = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': GLOBAL_API_KEY
    }
  });

  try {
    console.log(`Creating test instance: ${testInstanceName}...`);
    const { data } = await api.post('/instance/create', {
      instanceName: testInstanceName,
      token: INSTANCE_TOKEN,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true
    });
    console.log('Instance created successfully!');
    console.log(JSON.stringify(data, null, 2));

    // Wait a bit and delete it to keep things clean
    console.log(`Deleting test instance: ${testInstanceName}...`);
    await api.delete(`/instance/delete/${testInstanceName}`);
    console.log('Test instance deleted successfully.');

  } catch (err) {
    console.error('Error testing Evolution API:', err.response?.data || err.message);
  }
}

createTestInstance();
