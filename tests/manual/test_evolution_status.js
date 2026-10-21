import axios from 'axios';

const EVOLUTION_URL = 'https://api.natandesouza.com.br';
const EVOLUTION_API_KEY = 'qt65aNID45ZrxqHYoPDRxArWnyVP7rub';

async function checkStatus() {
  try {
      const { data } = await axios.get(`${EVOLUTION_URL}/instance/connectionState/wppai_6524ad04`, {
          headers: { apikey: EVOLUTION_API_KEY }
      });
      console.log('Connection State:', JSON.stringify(data, null, 2));
  } catch (error) {
      console.error('Error:', error.message);
  }
}

checkStatus();
