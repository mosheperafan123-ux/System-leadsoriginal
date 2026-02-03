const { db, initDb } = require('./src/database');

console.log('🧹 Limpiando base de datos...\n');

initDb();

// 1. Eliminar duplicados (mantener solo el primero de cada business_name)
const deleteDuplicates = db.prepare(`
    DELETE FROM leads 
    WHERE id NOT IN (
        SELECT MIN(id) FROM leads GROUP BY business_name
    )
`);
const dupResult = deleteDuplicates.run();
console.log(`✅ Eliminados ${dupResult.changes} duplicados`);

// 2. Limpiar emails inválidos (sentry, wix tracking, localhost, etc)
const invalidEmailPatterns = [
    '%sentry%',
    '%wixpress%',
    '%localhost%',
    '%@0.0.0.0%',
    '%noreply%',
    '%no-reply%',
    '%example.com%'
];

let cleanedEmails = 0;
for (const pattern of invalidEmailPatterns) {
    const result = db.prepare(`UPDATE leads SET email = NULL WHERE email LIKE ?`).run(pattern);
    cleanedEmails += result.changes;
}
console.log(`✅ Limpiados ${cleanedEmails} emails inválidos`);

// 3. Limpiar nombres vacíos o muy cortos
const cleanNames = db.prepare(`DELETE FROM leads WHERE business_name IS NULL OR LENGTH(business_name) < 3`);
const namesResult = cleanNames.run();
console.log(`✅ Eliminados ${namesResult.changes} leads con nombres inválidos`);

// 4. Estadísticas finales
const stats = db.prepare(`
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as con_email,
        SUM(CASE WHEN category IS NOT NULL AND category != '' THEN 1 ELSE 0 END) as con_categoria
    FROM leads
`).get();

console.log('\n📊 Estado actual de la BD:');
console.log(`   Total leads: ${stats.total}`);
console.log(`   Con email válido: ${stats.con_email}`);
console.log(`   Con categoría: ${stats.con_categoria}`);

// 5. Mostrar algunos emails para verificar
console.log('\n📧 Emails actuales:');
const emails = db.prepare('SELECT business_name, email FROM leads WHERE email IS NOT NULL LIMIT 10').all();
emails.forEach(e => console.log(`   ${e.business_name}: ${e.email}`));

console.log('\n✅ Limpieza completada.');
