const axios = require('axios');

async function checkEvolution() {
  const GLOBAL_API_KEY = "7JPyIijqM7xmPmD1M3hJ39ylVUqtwZR0";

  const api = axios.create({
    baseURL: "http://evo-fgovoagr6gudl5xln2ow0lh7.2.24.217.98.sslip.io",
    headers: {
      'Content-Type': 'application/json',
      'apikey': GLOBAL_API_KEY
    }
  });

  try {
    const { data: instances } = await api.get(`/instance/fetchInstances`);
    console.log(`Instances:`);
    instances.forEach(i => console.log(` - ${i.instanceName || i.name} (owner: ${i.ownerJid})`));
  } catch (err) {
    console.error(`Evolution API error:`, err.response?.data || err.message);
  }
}

checkEvolution();
