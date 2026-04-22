import axios from 'axios';

const EVOLUTION_URL = 'https://api.natandesouza.com.br';
const EVOLUTION_API_KEY = 'qt65aNID45ZrxqHYoPDRxArWnyVP7rub';

async function checkInstances() {
  try {
      const { data } = await axios.get(`${EVOLUTION_URL}/instance/fetchInstances`, {
          headers: { apikey: EVOLUTION_API_KEY }
      });
      
      console.log('Instances:', data.map(i => i.name));

      for (const instance of data) {
         try {
             const wh = await axios.get(`${EVOLUTION_URL}/webhook/find/${instance.name}`, {
                 headers: { apikey: EVOLUTION_API_KEY }
             });
             console.log(`Webhook for ${instance.name}:`, JSON.stringify(wh.data, null, 2));
         } catch(e) {
             console.log(`Failed to fetch webhook for ${instance.name}: ${e.message}`);
         }
      }

  } catch (error) {
      console.error('Error:', error.message);
  }
}

checkInstances();
