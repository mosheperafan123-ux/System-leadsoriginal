const cron = require('node-cron');
const chalk = require('chalk');
const GoogleMapsScraper = require('./scrapers/googlemaps_api'); // Uses API if available, fallback to Playwright
const MessageGenerator = require('./ai/message_generator');
const GmailMultiAccountSender = require('./channels/gmail_oauth');
const { initDb, db } = require('./database');

// ===========================================
// CONFIGURACIÓN DE KEYWORDS A SCRAPEAR
// ===========================================
// ===========================================
// CONFIGURACIÓN DE KEYWORDS A SCRAPEAR (ESPAÑA)
// ===========================================
const NICHES = [
    'Clínicas estéticas',
    'Clínicas dentales',
    'Salones de belleza',
    'Centros de estética',
    'Odontólogos'
];

const CITIES = [
    // Top 10
    'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Murcia', 'Palma', 'Las Palmas', 'Bilbao',
    // Top 20
    'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Gijón', 'L\'Hospitalet de Llobregat', 'Vitoria-Gasteiz', 'A Coruña', 'Elche', 'Granada',
    // Top 30
    'Terrassa', 'Badalona', 'Oviedo', 'Cartagena', 'Sabadell', 'Jerez de la Frontera', 'Móstoles', 'Santa Cruz de Tenerife', 'Pamplona', 'Almería',
    // Top 40
    'Alcalá de Henares', 'Fuenlabrada', 'Leganés', 'San Sebastián', 'Getafe', 'Burgos', 'Albacete', 'Santander', 'Castellón de la Plana', 'Logroño',
    // Top 50
    'Badajoz', 'Salamanca', 'Huelva', 'Lleida', 'Marbella', 'Tarragona', 'Dos Hermanas', 'León', 'Torrejón de Ardoz', 'Parla',
    // Top 60
    'Mataró', 'Cádiz', 'Santa Coloma de Gramenet', 'Algeciras', 'Jaén', 'Alcobendas', 'Ourense', 'Reus', 'Telde', 'Barakaldo',
    // Top 70
    'Lugo', 'Girona', 'Santiago de Compostela', 'San Fernando', 'Cáceres', 'Las Rozas de Madrid', 'Roquetas de Mar', 'Lorca', 'Sant Cugat del Vallès', 'El Ejido',
    // Top 80
    'El Puerto de Santa María', 'San Sebastián de los Reyes', 'Cornellà de Llobregat', 'Melilla', 'Pozuelo de Alarcón', 'Coslada', 'Ceuta', 'Torrevieja', 'Talavera de la Reina', 'Guadalajara',
    // Top 90
    'Toledo', 'Rivas-Vaciamadrid', 'Chiclana de la Frontera', 'Pontevedra', 'Sant Boi de Llobregat', 'Torrent', 'Orihuela', 'Avilés', 'Arona', 'Palencia',
    // Top 100+
    'Vélez-Málaga', 'Getxo', 'Mijas', 'Fuengirola', 'Rubí', 'Alcalá de Guadaíra', 'Gandía', 'Manresa', 'Ciudad Real', 'Majadahonda',
    'Valdemoro', 'Benidorm', 'Torremolinos', 'Estepona', 'Sanlúcar de Barrameda', 'Paterna', 'Benalmádena', 'Santa Lucía de Tirajana', 'Castelldefels', 'Viladecans',
    'Sagunto', 'Ferrol', 'Ponferrada', 'Collado Villalba', 'La Línea de la Concepción', 'Arrecife', 'Irún', 'Zamora', 'Granollers', 'Boadilla del Monte'
];

// Generar combinaciones
const KEYWORDS = [];
NICHES.forEach(niche => {
    CITIES.forEach(city => {
        KEYWORDS.push(`${niche} en ${city}`);
    });
});

// Cuántos leads extraer por ciclo
// Cuántos leads extraer por ciclo
const LEADS_PER_CYCLE = 100;

// ===========================================
// FUNCIONES PRINCIPALES
// ===========================================

// ===========================================
// PROCESAMIENTO LINEAL (PIPELINE)
// ===========================================

async function processLeadPipeline(lead) {
    const generator = new MessageGenerator();
    const sender = new GmailMultiAccountSender();

    try {
        // 1. Generar Mensaje IA
        process.stdout.write(chalk.magenta('   🤖 Generando mensaje... '));
        const message = await generator.generateMessage(lead);

        if (!message || message.includes('[SIMULACIÓN')) {
            console.log(chalk.yellow('Falló generación.'));
            return;
        }

        // Guardar mensaje en DB
        db.prepare('UPDATE leads SET ai_personalized_message = ? WHERE id = ?').run(message, lead.id);
        console.log(chalk.green('OK'));

        // 2. Enviar Email (Instantáneo)
        if (!sender.isConfigured()) {
            console.log(chalk.yellow('   ⚠ Gmail no configurado. Saltando envío.'));
            return;
        }

        const subjectMatch = message.match(/Asunto:\s*(.+)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : `Oportunidad para ${lead.business_name}`;
        const body = message.replace(/Asunto:.*\n?/i, '');

        const sent = await sender.sendEmail(lead.email, subject, body, lead);

        if (sent) {
            // 3. Delay aleatorio (1-5s) para "humanizar" y no saturar
            const min = 1;
            const max = 5;
            const delaySeconds = (Math.random() * (max - min) + min).toFixed(1);
            console.log(chalk.gray(`   ⏳ Esperando ${delaySeconds}s...`));
            await new Promise(r => setTimeout(r, delaySeconds * 1000));
        } else {
            console.log(chalk.red('   ❌ No se pudo enviar (límite o error).'));
        }

    } catch (err) {
        console.error(chalk.red('Error en pipeline del lead:'), err.message);
    }
}

async function runPipelineCycle() {
    console.log(chalk.bold.cyan('\n=== CICLO PIPELINE (TIEMPO REAL) ==='));
    console.log(chalk.gray(`Hora: ${new Date().toLocaleString('es-ES')}`));

    initDb();

    // Verificar Límite Diario Global
    const dailyLimit = parseInt(process.env.DAILY_LIMIT_PER_ACCOUNT) || 450;
    const accounts = (process.env.GMAIL_ACCOUNTS || '').split(',').length || 1;
    const totalDailyCapacity = dailyLimit * accounts;
    const emailsSentToday = db.prepare("SELECT COUNT(*) as c FROM leads WHERE email_sent = 1 AND DATE(email_sent_at) = DATE('now')").get().c;

    if (emailsSentToday >= totalDailyCapacity) {
        console.log(chalk.yellow(`🛑 Límite diario alcanzado (${emailsSentToday}/${totalDailyCapacity}). Pausando.`));
        return;
    }

    const scraper = new GoogleMapsScraper();
    const keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];

    try {
        // Pasamos el callback para que procese CADA LEAD apenas lo encuentra
        await scraper.scrape(keyword, LEADS_PER_CYCLE, processLeadPipeline);
    } catch (err) {
        console.error(chalk.red('Error en scraping:'), err.message);
    } finally {
        await scraper.close();
    }

    printStats();
}

async function runAIGenerationCycle() {
    console.log(chalk.bold.magenta('\n=== CICLO DE GENERACIÓN IA ==='));

    const generator = new MessageGenerator();
    const pendingLeads = db.prepare(`
        SELECT * FROM leads 
        WHERE ai_personalized_message IS NULL 
        LIMIT 150
    `).all();

    console.log(`Procesando ${pendingLeads.length} leads sin mensaje...`);

    for (const lead of pendingLeads) {
        try {
            const message = await generator.generateMessage(lead);
            // Solo guardar si el mensaje se generó correctamente
            if (message && !message.includes('[SIMULACIÓN')) {
                db.prepare('UPDATE leads SET ai_personalized_message = ? WHERE id = ?').run(message, lead.id);
                process.stdout.write(chalk.green('.'));
            } else {
                process.stdout.write(chalk.yellow('?')); // Mensaje no generado
            }
        } catch (err) {
            process.stdout.write(chalk.red('x'));
        }
    }
    console.log(' Completado');
}

async function runEmailCycle() {
    console.log(chalk.bold.blue('\n=== CICLO DE ENVÍO (Gmail OAuth) ==='));

    const sender = new GmailMultiAccountSender();

    if (!sender.isConfigured()) {
        console.log(chalk.yellow('⚠ Gmail no configurado. Saltando envío.'));
        return;
    }

    // Enviar TODOS los pendientes, no solo 50
    const readyLeads = db.prepare(`
        SELECT * FROM leads 
        WHERE ai_personalized_message IS NOT NULL 
        AND email_sent = 0 
        AND email IS NOT NULL
    `).all();

    console.log(`Enviando a ${readyLeads.length} leads...`);

    let sentCount = 0;
    for (const lead of readyLeads) {
        const subjectMatch = lead.ai_personalized_message.match(/Asunto:\s*(.+)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : `Oportunidad para ${lead.business_name}`;
        const body = lead.ai_personalized_message.replace(/Asunto:.*\n?/i, '');

        const sent = await sender.sendEmail(lead.email, subject, body, lead);

        if (!sent) {
            console.log(chalk.yellow('🛑 Límite diario alcanzado. Parando envío.'));
            break;
        }

        sentCount++;

        // Rate limit aleatorio (4-10 segundos) para evitar spam y parecer humano
        const min = 4;
        const max = 10;
        const delaySeconds = (Math.random() * (max - min) + min).toFixed(1);

        console.log(chalk.gray(`   ⏳ Esperando ${delaySeconds}s...`));
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
    }

    console.log(chalk.green(`✅ Ciclo de envío completado. Enviados: ${sentCount}`));
}

function printStats() {
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as con_email,
            SUM(CASE WHEN ai_personalized_message IS NOT NULL THEN 1 ELSE 0 END) as con_ia,
            SUM(CASE WHEN email_sent = 1 THEN 1 ELSE 0 END) as enviados
        FROM leads
    `).get();

    console.log(chalk.bold('\n📊 ESTADÍSTICAS'));
    console.log(`   Total leads: ${stats.total}`);
    console.log(`   Con email: ${stats.con_email}`);
    console.log(`   Con mensaje IA: ${stats.con_ia}`);
    console.log(`   Contactados: ${stats.enviados}`);
}

// ===========================================
// REPORTE DIARIO POR EMAIL
// ===========================================

const REPORT_EMAIL = 'mosheperafan123@gmail.com';

async function sendDailyReport() {
    console.log(chalk.bold.yellow('\n=== REPORTE DIARIO ==='));

    // 1. Verificar respuestas antes del reporte
    const gmailChecker = new GmailMultiAccountSender();
    if (gmailChecker.isConfigured()) {
        await gmailChecker.checkInboxForResponses(db);
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // Obtener estadísticas del día
        const stats = {
            total_leads: db.prepare("SELECT COUNT(*) as c FROM leads").get().c,
            leads_hoy: db.prepare("SELECT COUNT(*) as c FROM leads WHERE DATE(extraction_date) = DATE('now')").get().c,
            emails_enviados_hoy: db.prepare("SELECT COUNT(*) as c FROM leads WHERE email_sent = 1 AND DATE(email_sent_at) = DATE('now')").get().c,
            respuestas_hoy: db.prepare("SELECT COUNT(*) as c FROM leads WHERE response_status != 'none' AND response_status IS NOT NULL AND DATE(response_date) = DATE('now')").get().c,
            interesados: db.prepare("SELECT COUNT(*) as c FROM leads WHERE response_status = 'interested'").get().c,
            total_contactados: db.prepare("SELECT COUNT(*) as c FROM leads WHERE email_sent = 1").get().c
        };

        // Construir el HTML del email
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background: #f8f9fc; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h1 { color: #1a1a2e; margin-bottom: 10px; }
        .subtitle { color: #6b7280; margin-bottom: 30px; }
        .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .stat-card { background: #f3f4f6; border-radius: 12px; padding: 16px; text-align: center; }
        .stat-value { font-size: 2rem; font-weight: 700; color: #0066ff; }
        .stat-label { font-size: 0.9rem; color: #6b7280; }
        .success { color: #10b981; }
        .highlight { background: linear-gradient(135deg, #0066ff, #7c3aed); color: white; }
        .highlight .stat-value { color: white; }
        .highlight .stat-label { color: rgba(255,255,255,0.8); }
        .footer { margin-top: 30px; text-align: center; font-size: 0.85rem; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Reporte Diario - LeadGen AI</h1>
        <p class="subtitle">${today}</p>
        
        <div class="stat-grid">
            <div class="stat-card highlight">
                <div class="stat-value">${stats.leads_hoy}</div>
                <div class="stat-label">Leads Nuevos Hoy</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.emails_enviados_hoy}</div>
                <div class="stat-label">Emails Enviados Hoy</div>
            </div>
            <div class="stat-card">
                <div class="stat-value success">${stats.respuestas_hoy}</div>
                <div class="stat-label">Respuestas Hoy</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.interesados}</div>
                <div class="stat-label">Total Interesados</div>
            </div>
        </div>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <h3 style="color: #1a1a2e;">📈 Acumulado Total</h3>
        <p><strong>Total Leads:</strong> ${stats.total_leads}</p>
        <p><strong>Total Contactados:</strong> ${stats.total_contactados}</p>
        
        <div class="footer">
            <p>Sistema AR Technocode LeadGen AI</p>
            <p>Este es un reporte automático generado a las 23:00</p>
        </div>
    </div>
</body>
</html>`;

        // Enviar el email
        const account = gmailChecker.getNextAccount(); // Usamos la misma instancia

        if (account) {
            // FIX: sendEmail signature is (to, subject, body, leadData) not (account, to, subject, body)
            // The class handles account selection internally via getNextAccount or we can verify if we force one.
            // Actually GmailMultiAccountSender.sendEmail selects an account INTERNALLY.
            // Passing 'account' as first arg was the bug.

            await gmailChecker.sendEmail(
                REPORT_EMAIL,
                `📊 Reporte Diario LeadGen - ${today}`,
                htmlContent
            );
            console.log(chalk.green(`✅ Reporte enviado a ${REPORT_EMAIL}`));
        } else {
            console.log(chalk.yellow('⚠ No hay cuentas de Gmail configuradas para enviar el reporte'));
        }

    } catch (err) {
        console.error(chalk.red('Error enviando reporte diario:'), err.message);
    }
}

// ===========================================
// CICLO PRINCIPAL LINEAL
// ===========================================

// Ciclo maestro: Solo invoca el Pipeline
async function runMainCycle() {
    await runPipelineCycle();
}

console.log(chalk.bold.cyan('🚀 Sistema de Leads iniciado (Modo Lineal)'));
console.log(chalk.gray('Flujo: Scrape → IA → Email → Repeat (cada 15 min)'));

initDb();

// Ejecutar ciclo principal cada 15 minutos
cron.schedule('*/15 * * * *', runMainCycle);

// Reporte diario a las 23:00
cron.schedule('0 23 * * *', sendDailyReport);

// Ejecutar uno inicial al arrancar
runMainCycle();

