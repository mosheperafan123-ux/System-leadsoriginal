const GoogleMapsAPIScraper = require('./src/scrapers/googlemaps_api');
const MessageGenerator = require('./src/ai/message_generator');
const GmailMultiAccountSender = require('./src/channels/gmail_oauth');
const { initDb, db } = require('./src/database');
const chalk = require('chalk');

// Simulamos el límite bajo para el test
const TEST_LIMIT = 2;

async function processLeadPipeline(lead) {
    const generator = new MessageGenerator();
    const sender = new GmailMultiAccountSender();

    console.log(chalk.blue(`\n[TEST] Procesando lead: ${lead.business_name}`));

    try {
        // 1. Generar Mensaje IA
        process.stdout.write(chalk.magenta('   🤖 Generando mensaje... '));
        const message = await generator.generateMessage(lead);

        if (!message || message.includes('[SIMULACIÓN')) {
            console.log(chalk.yellow('Falló generación.'));
            return;
        }
        console.log(chalk.green('OK'));
        console.log(chalk.gray(`   Asunto: ${message.split('\n')[0]}`));

        // 2. Enviar Email (Simulado o Real según config)
        if (!sender.isConfigured()) {
            console.log(chalk.yellow('   ⚠ Gmail no configurado en entorno local. (Se omitirá envío real)'));
            return;
        }

        const subjectMatch = message.match(/Asunto:\s*(.+)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : `Oportunidad para ${lead.business_name}`;
        const body = message.replace(/Asunto:.*\n?/i, '');

        console.log(chalk.cyan('   📧 Intentando enviar email...'));
        // En test local, si quieres enviar de verdad, descomenta abajo. 
        // Para seguridad, solo logueamos que SE HABRÍA enviado.
        // const sent = await sender.sendEmail(lead.email, subject, body, lead);
        const sent = true; // SImulado para el test

        if (sent) {
            console.log(chalk.green(`   ✅ [SIMULACIÓN] Email enviado a ${lead.email}`));

            // 3. Delay aleatorio (1-2s para test rápido)
            const min = 1;
            const max = 2;
            const delaySeconds = (Math.random() * (max - min) + min).toFixed(1);
            console.log(chalk.gray(`   ⏳ Esperando ${delaySeconds}s...`));
            await new Promise(r => setTimeout(r, delaySeconds * 1000));
        } else {
            console.log(chalk.red('   ❌ No se pudo enviar.'));
        }

    } catch (err) {
        console.error(chalk.red('Error en pipeline del lead:'), err.message);
    }
}

async function runTest() {
    console.log(chalk.bold.cyan('🧪 INICIANDO TEST LOCAL DE PIPELINE (V1 API)'));
    initDb();

    // Sobreescribimos la apiKey si no está en env para que use el fallback (o asegurar que falle si no hay)
    // Pero asumimos que el usuario ya puso la key en el .env si quiere probar API V1

    const scraper = new GoogleMapsAPIScraper();
    const keyword = 'Clínicas dentales en Madrid'; // Keyword segura

    try {
        console.log(chalk.yellow(`🔍 Buscando: ${keyword} (Max: ${TEST_LIMIT})`));
        // Pasamos el callback para que procese CADA LEAD apenas lo encuentra
        await scraper.scrape(keyword, TEST_LIMIT, processLeadPipeline);
    } catch (err) {
        console.error(chalk.red('Error en scraping:'), err.message);
    } finally {
        await scraper.close();
        console.log(chalk.bold.cyan('\n✅ TEST FINALIZADO'));
    }
}

runTest();
