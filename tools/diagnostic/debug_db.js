import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve('service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'wppai-dev-770d3'
});

const db = admin.firestore();

async function debug() {
  const uid = 'WUmNt8pzzKPOxxhcozxPfy63onL2';
  console.log('--- DEBUG USER ---');
  const userDoc = await db.collection('users').doc(uid).get();
  console.log(JSON.stringify(userDoc.data(), null, 2));

  console.log('\n--- DEBUG AGENTS ---');
  const agents = await db.collection('agents').where('userId', '==', uid).get();
  agents.forEach(doc => {
    console.log(`Agent ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

debug().catch(console.error);
