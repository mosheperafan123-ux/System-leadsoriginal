const chalk = require('chalk');
const GoogleMapsScraper = require('./scrapers/googlemaps');
const { initDb, db } = require('./database');

async function massExtraction() {
    console.log(chalk.bold.cyan('\n🔍 EXTRACCIÓN MASIVA DE PRUEBA (30 leads)\n'));

    initDb();

    const keywords = [
        'Restaurantes en Bogotá',
        'Clinicas dentales en Bogotá',
        'Hoteles en Bogotá',
        'Consultorios médicos en Bogotá',
        'Gimnasios en Bogotá'
    ];

    const scraper = new GoogleMapsScraper();
    let totalExtracted = 0;
    let totalEmails = 0;

    for (const keyword of keywords) {
        if (totalExtracted >= 30) break;

        console.log(chalk.yellow(`\n📍 Keyword: ${keyword}`));

        try {
            const leads = await scraper.scrape(keyword, 8);
            totalExtracted += leads.length;

            for (const lead of leads) {
                if (lead.email) totalEmails++;
            }

            console.log(chalk.green(`   Extraídos: ${leads.length} | Total: ${totalExtracted}`));
        } catch (err) {
            console.error(chalk.red(`   Error: ${err.message}`));
        }
    }

    await scraper.close();

    // Estadísticas finales
    console.log(chalk.bold.cyan('\n=== RESUMEN FINAL ==='));

    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as con_email,
            SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as con_telefono,
            SUM(CASE WHEN website IS NOT NULL THEN 1 ELSE 0 END) as con_web
        FROM leads
    `).get();

    console.log(`Total leads en DB: ${stats.total}`);
    console.log(`Con Email: ${stats.con_email}`);
    console.log(`Con Teléfono: ${stats.con_telefono}`);
    console.log(`Con Website: ${stats.con_web}`);

    // Mostrar algunos emails encontrados
    const emailLeads = db.prepare('SELECT business_name, email, city FROM leads WHERE email IS NOT NULL LIMIT 10').all();

    if (emailLeads.length > 0) {
        console.log(chalk.green('\n📧 Emails encontrados:'));
        emailLeads.forEach(l => {
            console.log(`   ${l.business_name}: ${l.email}`);
        });
    }

    console.log(chalk.bold.green('\n✅ Extracción completada.'));
}

massExtraction();
