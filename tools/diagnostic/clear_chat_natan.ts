import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function clearNatanChat() {
  console.log('Searching for threads with Natan...');
  const threadsSnapshot = await db.collection('threads')
    .where('name', '==', 'Natan')
    .get();

  if (threadsSnapshot.empty) {
    const fallbackSnapshot = await db.collection('threads')
      .where('contactId', '>=', '55') // Typical Brazilian number start
      .get();
    
    console.log('No threads named Natan found. Found', fallbackSnapshot.size, 'potential threads.');
    // List them for manual selection or just clear all Natan mentions
    for (const doc of fallbackSnapshot.docs) {
       const data = doc.data();
       if (data.name?.includes('Natan') || data.leadName?.includes('Natan')) {
         await deleteThread(doc.id);
       }
    }
  } else {
    for (const doc of threadsSnapshot.docs) {
      await deleteThread(doc.id);
    }
  }
  
  console.log('Done clearing chats.');
}

async function deleteThread(threadId: string) {
  console.log(`Deleting thread: ${threadId}`);
  
  // Delete messages subcollection
  const messagesSnapshot = await db.collection('threads').doc(threadId).collection('messages').get();
  const batch = db.batch();
  messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Deleted ${messagesSnapshot.size} messages in thread ${threadId}`);
  
  // Delete thread document
  await db.collection('threads').doc(threadId).delete();
}

clearNatanChat().catch(console.error);
