const chalk = require('chalk');
const GoogleMapsScraper = require('./scrapers/googlemaps');
const MessageGenerator = require('./ai/message_generator');
const GmailOAuthSender = require('./channels/gmail_oauth');
const { initDb, db } = require('./database');

async function runTestCycle() {
    console.log(chalk.bold.cyan('\n=== TEST RUN: CICLO DE PRUEBA (10 Leads) ===\n'));

    try {
        initDb();

        // 1. Scraping (Limit 10)
        console.log(chalk.blue('\n[1/4] Extracción de Leads (Test Limit: 10)...'));
        const scraper = new GoogleMapsScraper();

        // Use target niches for Spain
        const keywords = [
            'Clínicas dentales en Madrid',
            'Clínicas estéticas en Barcelona',
            'Salones de belleza en Sevilla'
        ];
        const target = keywords[Math.floor(Math.random() * keywords.length)];

        await scraper.scrape(target, 10);
        await scraper.close();

        // 2. IA Generation
        console.log(chalk.blue('\n[2/4] Generación de mensajes IA...'));
        const generator = new MessageGenerator();
        const pendingLeads = db.prepare('SELECT * FROM leads WHERE ai_personalized_message IS NULL LIMIT 20').all();

        for (const lead of pendingLeads) {
            process.stdout.write(chalk.gray(`Procesando ${lead.business_name}... `));
            const message = await generator.generateMessage(lead);
            db.prepare('UPDATE leads SET ai_personalized_message = ? WHERE id = ?').run(message, lead.id);
            process.stdout.write(chalk.green('✔\n'));
        }

        // 3. Email Sending (Test mode)
        console.log(chalk.blue('\n[3/4] Enviando emails de prueba...'));
        const emailSender = new GmailOAuthSender();

        if (emailSender.isConfigured()) {
            const readyLeads = db.prepare(`
                SELECT * FROM leads 
                WHERE ai_personalized_message IS NOT NULL 
                AND email_sent = 0 
                AND email IS NOT NULL 
                LIMIT 10
            `).all();

            console.log(`   ${readyLeads.length} leads candidatos para test de envío`);

            for (const lead of readyLeads) {
                const subjectMatch = lead.ai_personalized_message.match(/Asunto:\s*(.+)/i);
                const subject = subjectMatch ? subjectMatch[1].trim() : `Oportunidad para ${lead.business_name}`;
                const body = lead.ai_personalized_message.replace(/Asunto:.*\n?/i, '');

                await emailSender.sendEmail(lead.email, subject, body, lead);

                // Mark as sent
                db.prepare('UPDATE leads SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(lead.id);

                // Small delay
                await new Promise(r => setTimeout(r, 2000));
            }
        } else {
            console.log(chalk.yellow('   ⚠ Gmail no configurado o sin cuentas. Saltando envío real.'));
        }

        console.log(chalk.bold.green('\n✅ TEST COMPLETADO'));

    } catch (error) {
        console.error(chalk.red('\n❌ ERROR EN TEST:'), error);
        process.exit(1);
    }
}

runTestCycle();
