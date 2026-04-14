import { db } from './src/backend/lib/firebaseAdmin.js';

async function debugThreads() {
  console.log('--- DEBUG: THREADS NO FIRESTORE ---');
  const threadsSnapshot = await db.collection('threads').get();
  
  if (threadsSnapshot.empty) {
    console.log('Nenhuma thread encontrada.');
    return;
  }

  for (const doc of threadsSnapshot.docs) {
    const threadData = doc.data();
    console.log(`Thread ID: ${doc.id}`);
    console.log(`  Contact Name: ${threadData.contactName}`);
    console.log(`  Remote JID: ${threadData.remoteJid}`);
    
    const messagesSnapshot = await db.collection('threads')
      .doc(doc.id)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    console.log(`  Mensagens no sub-coleção: ${messagesSnapshot.size}`);
    messagesSnapshot.docs.forEach(m => {
      const mData = m.data();
      console.log(`    [${mData.direction}] ${mData.text?.substring(0, 30)}... (TS: ${mData.timestamp})`);
    });
    console.log('-------------------');
  }
}

debugThreads().catch(console.error);
