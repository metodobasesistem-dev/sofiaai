import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

async function checkAppointments() {
  console.log('--- Checking Appointments (Self-Contained) ---');
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    const db = getFirestore();

    const appointmentsSnapshot = await db.collection('appointments').get();
    console.log(`Total appointments found: ${appointmentsSnapshot.size}`);

    if (appointmentsSnapshot.size === 0) {
      console.log('No appointments found in database.');
    } else {
      appointmentsSnapshot.forEach((doc: any) => {
        const app = doc.data();
        const dateStr = app.date instanceof Object ? JSON.stringify(app.date) : app.date;
        console.log(`- ID: ${doc.id}`);
        console.log(`  userId: ${app.userId}`);
        console.log(`  leadId: ${app.leadId}`);
        console.log(`  clientName: ${app.clientName}`);
        console.log(`  date: ${dateStr}`);
        console.log(`  time: ${app.time}`);
        console.log(`  timestamp: ${app.timestamp?.toDate ? app.timestamp.toDate() : app.timestamp}`);
        console.log('---');
      });
    }

    const sessionsSnapshot = await db.collection('sessions').limit(5).get();
    console.log(`\nChecking first ${sessionsSnapshot.size} sessions for context:`);
    sessionsSnapshot.forEach((doc: any) => {
      console.log(`Session ID: ${doc.id}, userId: ${doc.data().userId}`);
    });

    const usersSnapshot = await db.collection('users').get();
    console.log(`\nFound ${usersSnapshot.size} users:`);
    usersSnapshot.forEach((doc: any) => {
      console.log(`User ID: ${doc.id}, Email: ${doc.data().email}`);
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

checkAppointments();
