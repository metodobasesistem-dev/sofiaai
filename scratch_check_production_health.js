import axios from 'axios';

async function checkProductionHealth() {
  try {
    const res = await axios.get('https://baseai.natandesouza.com.br/api/health/chat');
    console.log('Production Health Check:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error('Error response from production health check:', err.response.status);
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error connecting to production health check:', err.message);
    }
  }
}

checkProductionHealth().then(() => process.exit());
