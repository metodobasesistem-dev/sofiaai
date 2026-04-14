import { db } from '../src/backend/lib/firebaseAdmin.js';

async function checkAppointments() {
  console.log('--- Checking Appointments ---');
  try {
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

    const leadsSnapshot = await db.collection('leads').limit(5).get();
    console.log(`Checking first ${leadsSnapshot.size} leads for context:`);
    leadsSnapshot.forEach((doc: any) => {
      console.log(`Lead ID: ${doc.id}, Name: ${doc.data().name || 'N/A'}, waId: ${doc.data().waId}`);
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

checkAppointments();
