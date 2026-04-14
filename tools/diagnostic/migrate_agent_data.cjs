const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin using the same logic as the app
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (!admin.apps.length) {
    let credential;
    if (fs.existsSync(serviceAccountPath)) {
        console.log('Using local service account credentials...');
        credential = admin.credential.cert(serviceAccountPath);
    } else {
        console.warn('No service-account.json found. Using applicationDefault...');
        credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
        projectId: config.projectId,
        credential: credential
    });
}

const db = admin.firestore();

async function migrate() {
    console.log('Starting migration...');
    const usersSnapshot = await db.collection('users').get();
    
    let migratedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;

        console.log(`Processing user: ${userId} (${userData.email || 'no-email'})`);

        // Find active agent for this user
        const agentsSnapshot = await db.collection('agents')
            .where('userId', '==', userId)
            .where('status_ativo', '==', true)
            .limit(1)
            .get();

        if (agentsSnapshot.empty) {
            console.log(`  - No active agent found for user ${userId}. Skipping.`);
            continue;
        }

        const agentDoc = agentsSnapshot.docs[0];
        const agentData = agentDoc.data();

        // Prepare data to migrate
        // Prioritize data from user profile if it exists, otherwise keep agent data
        const updates = {
            companyName: userData.nome_empresa || agentData.companyName || '',
            companyDescription: userData.descricao_empresa || agentData.companyDescription || '',
            companyProducts: userData.produtos_servicos || agentData.companyProducts || '',
            companyFAQ: userData.faq || agentData.companyFAQ || '',
            companyLinks: userData.links_importantes || agentData.companyLinks || '',
            professionalName: agentData.professionalName || userData.name || ''
        };

        await db.collection('agents').doc(agentDoc.id).update(updates);
        console.log(`  - Migrated data to agent ${agentDoc.id} (${agentData.nome})`);
        migratedCount++;
    }

    console.log(`Migration complete. ${migratedCount} agents updated.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
