const { db } = require('./src/database');

console.log('\n=== REPORTE DE TESTING ===\n');

// Stats
const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
const withEmail = db.prepare('SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL').get().c;
const withAI = db.prepare('SELECT COUNT(*) as c FROM leads WHERE ai_personalized_message IS NOT NULL').get().c;

console.log(`Total Leads en DB: ${totalLeads}`);
console.log(`Con Email Detectado: ${withEmail}`);
console.log(`Con Mensaje IA: ${withAI}`);

// Sample
console.log('\n--- Muestra de Leads ---');
const sample = db.prepare('SELECT business_name, email, ai_personalized_message FROM leads LIMIT 3').all();
sample.forEach((l, i) => {
    console.log(`\n[${i + 1}] ${l.business_name}`);
    console.log(`    Email: ${l.email || 'NO DETECTADO'}`);
    console.log(`    Mensaje IA: ${l.ai_personalized_message ? l.ai_personalized_message.substring(0, 80) + '...' : 'NO GENERADO'}`);
});
