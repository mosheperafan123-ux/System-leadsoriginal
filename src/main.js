const chalk = require('chalk');
const GoogleMapsScraper = require('./scrapers/googlemaps');
const MessageGenerator = require('./ai/message_generator');
const GmailOAuthSender = require('./channels/gmail_oauth');
const { initDb, db } = require('./database');
const config = require('./config');

async function main() {
    console.log(chalk.bold.cyan('\n=== LeadGen AI - Sistema de Generación de Leads ===\n'));

    try {
        // 1. Inicializar
        console.log(chalk.gray('Inicializando base de datos...'));
        initDb();

        // 2. Scraping
        console.log(chalk.blue('\n[1/4] Extracción de Leads...'));
        const scraper = new GoogleMapsScraper();

        const keywords = [
            'Restaurantes en Bogotá',
            'Clínicas dentales en Medellín',
            'Hoteles en Cartagena',
            'Spas en Bogotá',
            'Agencias de marketing en Cali'
        ];
        const target = keywords[Math.floor(Math.random() * keywords.length)];

        await scraper.scrape(target, 10);
        await scraper.close();

        // 3. IA Personalization
        console.log(chalk.blue('\n[2/4] Generación de mensajes IA...'));
        const generator = new MessageGenerator();

        const pendingLeads = db.prepare('SELECT * FROM leads WHERE ai_personalized_message IS NULL LIMIT 20').all();

        for (const lead of pendingLeads) {
            process.stdout.write(chalk.gray(`Procesando ${lead.business_name}... `));
            const message = await generator.generateMessage(lead);
            db.prepare('UPDATE leads SET ai_personalized_message = ? WHERE id = ?').run(message, lead.id);
            process.stdout.write(chalk.green('✔\n'));
        }

        // 4. Email Sending via Gmail OAuth (con rotación)
        console.log(chalk.blue('\n[3/4] Enviando emails...'));
        const emailSender = new GmailOAuthSender();
        const initialized = await emailSender.init();

        if (initialized) {
            const readyLeads = db.prepare(`
                SELECT * FROM leads 
                WHERE ai_personalized_message IS NOT NULL 
                AND email_sent = 0 
                AND email IS NOT NULL 
                LIMIT 20
            `).all();

            console.log(`   ${readyLeads.length} leads listos para contactar`);

            for (const lead of readyLeads) {
                const subjectMatch = lead.ai_personalized_message.match(/Asunto:\s*(.+)/i);
                const subject = subjectMatch ? subjectMatch[1].trim() : `Oportunidad para ${lead.business_name}`;
                const body = lead.ai_personalized_message.replace(/Asunto:.*\n?/i, '');

                const sent = await emailSender.sendEmail(lead.email, subject, body, lead);

                if (sent) {
                    db.prepare('UPDATE leads SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(lead.id);
                }

                // Rate limit aleatorio (1-5 segundos) para evitar spam
                const min = 1;
                const max = 5;
                const delaySeconds = (Math.random() * (max - min) + min).toFixed(1);

                console.log(chalk.gray(`   ⏳ Esperando ${delaySeconds}s...`));
                await new Promise(r => setTimeout(r, delaySeconds * 1000));
            }

            // Mostrar estadísticas de envío
            const stats = emailSender.getStats();
            console.log(chalk.cyan('\n   Estadísticas de envío:'));
            for (const email of stats.profiles) {
                console.log(`   - ${email}: ${stats.sentPerProfile[email]} emails`);
            }
        } else {
            console.log(chalk.yellow('   ⚠ Gmail no configurado. Saltando envío de emails.'));
        }

        // 5. Resumen
        console.log(chalk.blue('\n[4/4] Resumen...'));
        const dbStats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as con_email,
                SUM(CASE WHEN email_sent = 1 THEN 1 ELSE 0 END) as enviados
            FROM leads
        `).get();

        console.log(chalk.white(`   Total Leads: ${dbStats.total}`));
        console.log(chalk.white(`   Con Email: ${dbStats.con_email}`));
        console.log(chalk.white(`   Contactados: ${dbStats.enviados}`));

        console.log(chalk.bold.green('\n✨ Ciclo completado.'));

    } catch (error) {
        console.error(chalk.red('\nERROR:'), error);
    }
}

main();
