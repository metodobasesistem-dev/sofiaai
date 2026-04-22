import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const EVOLUTION_URL = 'https://api.natandesouza.com.br';
const EVOLUTION_API_KEY = 'qt65aNID45ZrxqHYoPDRxArWnyVP7rub';

async function fetchEvolutionMessages() {
  try {
      console.log('Fetching instances...');
      const { data: instances } = await axios.get(`${EVOLUTION_URL}/instance/fetchInstances`, {
          headers: { apikey: EVOLUTION_API_KEY }
      });
      
      const instanceNames = instances.map(i => i.name);
      console.log('Instances found:', instanceNames);

      for (const instance of instanceNames) {
         try {
             const messages = await axios.post(`${EVOLUTION_URL}/chat/findMessages/${instance}`, {
                 limit: 10
             }, {
                 headers: { apikey: EVOLUTION_API_KEY }
             });
             console.log(`\nMessages for ${instance}:`);
             console.log(JSON.stringify(messages.data, null, 2));
         } catch(e) {
             console.log(`Failed to fetch messages for ${instance}:`, e.response?.data || e.message);
         }
      }
  } catch (error) {
      console.error('Error:', error.message);
  }
}

fetchEvolutionMessages();
