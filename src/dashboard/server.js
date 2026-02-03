const express = require('express');
const { db, initDb } = require('../database');
const path = require('path');
const config = require('../config');
const GmailMultiAccountSender = require('../channels/gmail_oauth');
const cronParser = require('cron-parser');
const { spawn } = require('child_process');

const SCHEDULES = {
    scraping: '0 * * * *',      // Cada hora
    ai: '15,45 * * * *',        // Cada 30 min
    email: '0 */2 * * *'        // Cada 2 horas
};

const app = express();
const PORT = config.PORT || 3000;

// Inicializar DB
initDb();

// Gmail Multi-Account Sender
const gmailSender = new GmailMultiAccountSender();

// Almacenar sesiones de autenticación temporal
const authSessions = {};

// Estado del scheduler
let schedulerProcess = null;
let schedulerStatus = 'stopped'; // 'running' | 'stopped'
let schedulerStartTime = null;
let schedulerLogs = [];

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==========================================
// OAUTH ENDPOINTS (Multi-cuenta)
// ==========================================

// Página de autenticación de cuentas
app.get('/oauth', (req, res) => {
    const accounts = [
        'Info@artechnocode.online',
        'rafaelmanrique@artechnocode.online',
        'antoniorodriguez@artechnocode.online',
        'contact@artechnocode.online'
    ];

    const configuredAccounts = gmailSender.getStats().accounts;

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Configuración Gmail OAuth</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Inter', sans-serif; 
                    background: linear-gradient(135deg, #f8f9fc 0%, #e8ecf4 100%);
                    min-height: 100vh;
                    padding: 40px;
                }
                .container { max-width: 600px; margin: 0 auto; }
                h1 { 
                    font-size: 2rem; 
                    margin-bottom: 10px;
                    background: linear-gradient(135deg, #1a1a2e, #0066ff);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .subtitle { color: #6b7280; margin-bottom: 30px; }
                .account-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px 24px;
                    margin-bottom: 16px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.3s ease;
                    border: 1px solid rgba(0,0,0,0.06);
                }
                .account-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 30px rgba(0,0,0,0.1);
                }
                .account-info h3 { font-size: 1rem; color: #1a1a2e; }
                .account-info .status { font-size: 0.85rem; margin-top: 4px; }
                .status.configured { color: #10b981; }
                .status.pending { color: #f59e0b; }
                .btn {
                    padding: 10px 20px;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.3s ease;
                    border: none;
                }
                .btn-auth {
                    background: linear-gradient(135deg, #0066ff, #0052cc);
                    color: white;
                }
                .btn-auth:hover { transform: scale(1.05); }
                .btn-done {
                    background: #e8f5e9;
                    color: #10b981;
                    cursor: default;
                }
                .info-box {
                    background: #fef3c7;
                    border: 1px solid #f59e0b;
                    border-radius: 12px;
                    padding: 16px;
                    margin-top: 24px;
                    font-size: 0.9rem;
                    color: #92400e;
                }
                .back-link {
                    display: inline-block;
                    margin-top: 24px;
                    color: #0066ff;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Configuración Gmail</h1>
                <p class="subtitle">Autoriza cada cuenta para habilitar el envío de emails</p>

                ${accounts.map(email => {
        const isConfigured = configuredAccounts.includes(email);
        return `
                        <div class="account-card">
                            <div class="account-info">
                                <h3>${email}</h3>
                                <p class="status ${isConfigured ? 'configured' : 'pending'}">
                                    ${isConfigured ? '✅ Configurada' : '⏳ Pendiente de autorización'}
                                </p>
                            </div>
                            ${isConfigured
                ? '<span class="btn btn-done">✓ Listo</span>'
                : `<a href="/oauth/start?email=${encodeURIComponent(email)}" class="btn btn-auth">Autorizar</a>`
            }
                        </div>
                    `;
    }).join('')}

                <div class="info-box">
                    <strong>⚠️ Importante:</strong><br>
                    Después de autorizar cada cuenta, copia el token que aparece y agrégalo a las variables de entorno en EasyPanel en el formato:<br>
                    <code style="display:block; margin-top:8px; background:#fff; padding:8px; border-radius:6px;">
                        GMAIL_ACCOUNTS=email1:token1,email2:token2,...
                    </code>
                </div>

                <a href="/" class="back-link">← Volver al Dashboard</a>
            </div>
        </body>
        </html>
    `);
});

// Iniciar flujo OAuth para una cuenta específica
app.get('/oauth/start', (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.redirect('/oauth');
    }

    // Guardar email en sesión temporal
    const sessionId = Math.random().toString(36).substring(7);
    authSessions[sessionId] = email;

    const authUrl = gmailSender.getAuthUrl(email) + `&state=${sessionId}`;
    res.redirect(authUrl);
});

// Callback de OAuth
app.get('/oauth/callback', async (req, res) => {
    const { code, state } = req.query;
    const email = authSessions[state] || 'Cuenta';

    if (!code) {
        return res.status(400).send('No se recibió código de autorización');
    }

    try {
        const tokens = await gmailSender.getTokenFromCode(code);
        delete authSessions[state];

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Autorización Exitosa</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { 
                        font-family: 'Inter', sans-serif; 
                        background: linear-gradient(135deg, #f8f9fc 0%, #e8ecf4 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .card {
                        background: white;
                        border-radius: 24px;
                        padding: 40px;
                        max-width: 600px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    }
                    h1 { color: #10b981; font-size: 1.8rem; margin-bottom: 20px; }
                    .email { 
                        color: #0066ff; 
                        font-weight: 600;
                        background: #e0f2fe;
                        padding: 8px 16px;
                        border-radius: 8px;
                        display: inline-block;
                        margin-bottom: 20px;
                    }
                    .token-box {
                        background: #1a1a2e;
                        color: #00ffff;
                        padding: 20px;
                        border-radius: 12px;
                        font-family: monospace;
                        font-size: 0.85rem;
                        word-break: break-all;
                        margin: 20px 0;
                    }
                    .warning {
                        background: #fef3c7;
                        border: 1px solid #f59e0b;
                        padding: 16px;
                        border-radius: 12px;
                        color: #92400e;
                        font-size: 0.9rem;
                    }
                    .format-example {
                        background: #f0fdf4;
                        border: 1px solid #10b981;
                        padding: 16px;
                        border-radius: 12px;
                        margin-top: 20px;
                        font-size: 0.9rem;
                    }
                    .btn {
                        display: inline-block;
                        margin-top: 20px;
                        padding: 12px 24px;
                        background: #0066ff;
                        color: white;
                        border-radius: 10px;
                        text-decoration: none;
                        font-weight: 600;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ Autorización Exitosa</h1>
                    <p class="email">${email}</p>
                    
                    <p>Copia este <strong>Refresh Token</strong>:</p>
                    <div class="token-box" id="token">${tokens.refresh_token}</div>
                    
                    <button onclick="copyToken()" style="padding:10px 20px; border:none; background:#0066ff; color:white; border-radius:8px; cursor:pointer; font-weight:600;">
                        📋 Copiar Token
                    </button>
                    
                    <div class="warning" style="margin-top:20px;">
                        <strong>⚠️ Este token solo se muestra una vez.</strong><br>
                        Guárdalo inmediatamente.
                    </div>
                    
                    <div class="format-example">
                        <strong>📝 Formato para GMAIL_ACCOUNTS:</strong><br>
                        <code>${email}:${tokens.refresh_token}</code>
                    </div>
                    
                    <a href="/oauth" class="btn">← Continuar con otras cuentas</a>
                </div>
                
                <script>
                    function copyToken() {
                        const token = document.getElementById('token').textContent;
                        navigator.clipboard.writeText('${email}:' + token);
                        alert('Copiado: ${email}:token');
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Estado de email
app.get('/api/email/status', (req, res) => {
    res.json(gmailSender.getStats());
});

// ==========================================
// API ENDPOINTS
// ==========================================

// Dashboard principal - Estadísticas generales
app.get('/api/stats', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const stats = {
            total_leads: db.prepare("SELECT COUNT(*) as c FROM leads").get().c,
            leads_today: db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(extraction_date) = ?").get(today).c,
            with_email: db.prepare("SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL").get().c,
            with_phone: db.prepare("SELECT COUNT(*) as c FROM leads WHERE phone IS NOT NULL AND phone != ''").get().c,
            ai_generated: db.prepare("SELECT COUNT(*) as c FROM leads WHERE ai_personalized_message IS NOT NULL").get().c,
            emails_sent: db.prepare("SELECT COUNT(*) as c FROM leads WHERE email_sent = 1").get().c,
            pending_contact: db.prepare("SELECT COUNT(*) as c FROM leads WHERE email_sent = 0 AND email IS NOT NULL").get().c,
            email_config: gmailSender.getStats(),
            next_runs: {
                scraping: cronParser.parseExpression(SCHEDULES.scraping).next().toDate(),
                ai: cronParser.parseExpression(SCHEDULES.ai).next().toDate(),
                email: cronParser.parseExpression(SCHEDULES.email).next().toDate()
            }
        };

        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lista de leads con filtros
app.get('/api/leads', (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let whereClause = '';
        if (status === 'contacted') whereClause = 'WHERE email_sent = 1';
        else if (status === 'pending') whereClause = 'WHERE email_sent = 0 AND email IS NOT NULL';
        else if (status === 'no_email') whereClause = 'WHERE email IS NULL';

        const leads = db.prepare(`
            SELECT * FROM leads 
            ${whereClause}
            ORDER BY extraction_date DESC 
            LIMIT ? OFFSET ?
        `).all(parseInt(limit), parseInt(offset));

        res.json(leads);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Detalle de un lead
app.get('/api/leads/:id', (req, res) => {
    try {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
        if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
        res.json(lead);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Estadísticas por ciudad
app.get('/api/stats/cities', (req, res) => {
    try {
        const cities = db.prepare(`
            SELECT city, COUNT(*) as count, 
                   SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as with_email
            FROM leads 
            WHERE city IS NOT NULL AND city != ''
            GROUP BY city 
            ORDER BY count DESC 
            LIMIT 10
        `).all();
        res.json(cities);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Estadísticas por categoría
app.get('/api/stats/categories', (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT category, COUNT(*) as count
            FROM leads 
            WHERE category IS NOT NULL AND category != ''
            GROUP BY category 
            ORDER BY count DESC 
            LIMIT 10
        `).all();
        res.json(categories);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Timeline de actividad
app.get('/api/activity', (req, res) => {
    try {
        const activity = db.prepare(`
            SELECT 
                date(extraction_date) as date,
                COUNT(*) as extracted,
                SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as emails_found,
                SUM(CASE WHEN email_sent = 1 THEN 1 ELSE 0 END) as contacted
            FROM leads 
            GROUP BY date(extraction_date)
            ORDER BY date DESC 
            LIMIT 7
        `).all();
        res.json(activity);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Logs del sistema
app.get('/api/logs', (req, res) => {
    try {
        const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50').all();
        res.json(logs);
    } catch (e) {
        res.json([]);
    }
});

// ==========================================
// ACCIONES
// ==========================================

// Marcar lead como contactado
app.post('/api/leads/:id/contact', (req, res) => {
    try {
        db.prepare('UPDATE leads SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Eliminar lead
app.delete('/api/leads/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Exportar a CSV
app.get('/api/export/csv', (req, res) => {
    try {
        const leads = db.prepare('SELECT * FROM leads').all();

        const headers = ['ID', 'Negocio', 'Categoría', 'Ciudad', 'Teléfono', 'Email', 'Website', 'Rating', 'Contactado', 'Respuesta', 'Fecha'];
        const rows = leads.map(l => [
            l.id,
            `"${(l.business_name || '').replace(/"/g, '""')}"`,
            `"${(l.category || '').replace(/"/g, '""')}"`,
            `"${(l.city || '').replace(/"/g, '""')}"`,
            l.phone || '',
            l.email || '',
            l.website || '',
            l.rating || '',
            l.email_sent ? 'Sí' : 'No',
            l.response_status || 'none',
            l.extraction_date || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
        res.send(csv);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Registrar respuesta de un lead
app.post('/api/leads/:id/response', (req, res) => {
    try {
        const { status, text } = req.body;
        db.prepare(`
            UPDATE leads 
            SET response_status = ?, response_text = ?, response_date = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(status, text, req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Agregar notas a un lead
app.post('/api/leads/:id/notes', (req, res) => {
    try {
        const { notes } = req.body;
        db.prepare('UPDATE leads SET notes = ? WHERE id = ?').run(notes, req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Buscar leads
app.get('/api/leads/search', (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        const leads = db.prepare(`
            SELECT * FROM leads 
            WHERE business_name LIKE ? OR email LIKE ? OR city LIKE ?
            ORDER BY extraction_date DESC 
            LIMIT 50
        `).all(`%${q}%`, `%${q}%`, `%${q}%`);

        res.json(leads);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Estado del sistema
app.get('/api/system-status', (req, res) => {
    try {
        const emailStats = gmailSender.getStats();
        res.json({
            ai: {
                model: config.OPENAI_MODEL || 'gpt-5-nano-2025-08-07',
                baseUrl: config.OPENAI_BASE_URL || 'https://api.aimlapi.com/v1',
                configured: !!config.OPENAI_API_KEY
            },
            email: {
                accountsConfigured: emailStats.accountsConfigured,
                accounts: emailStats.accounts,
                dailyLimit: emailStats.dailyLimitPerAccount,
                totalSentToday: emailStats.totalSent,
                capacityPerDay: emailStats.totalCapacityPerDay
            },
            schedules: SCHEDULES,
            landingPage: config.LANDING_PAGE_URL
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Leads con respuesta (para seguimiento)
app.get('/api/leads/responded', (req, res) => {
    try {
        const leads = db.prepare(`
            SELECT * FROM leads 
            WHERE response_status != 'none' AND response_status IS NOT NULL
            ORDER BY response_date DESC 
            LIMIT 50
        `).all();
        res.json(leads);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// SCHEDULER CONTROL
// ==========================================

// Iniciar scheduler
app.post('/api/scheduler/start', (req, res) => {
    if (schedulerStatus === 'running') {
        return res.json({ success: false, message: 'El scheduler ya está corriendo' });
    }

    try {
        const schedulerPath = path.join(__dirname, '..', 'scheduler.js');
        schedulerProcess = spawn('node', [schedulerPath], {
            cwd: path.join(__dirname, '..', '..'),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        schedulerStatus = 'running';
        schedulerStartTime = new Date();
        schedulerLogs = [];

        schedulerProcess.stdout.on('data', (data) => {
            const log = data.toString().trim();
            schedulerLogs.push({ time: new Date(), message: log });
            if (schedulerLogs.length > 100) schedulerLogs.shift();
            console.log('[SCHEDULER]', log);
        });

        schedulerProcess.stderr.on('data', (data) => {
            const log = data.toString().trim();
            schedulerLogs.push({ time: new Date(), message: '[ERROR] ' + log });
            console.error('[SCHEDULER ERROR]', log);
        });

        schedulerProcess.on('close', (code) => {
            schedulerStatus = 'stopped';
            schedulerProcess = null;
            console.log(`[SCHEDULER] Proceso terminado con código ${code}`);
        });

        res.json({ success: true, message: 'Scheduler iniciado' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Detener scheduler
app.post('/api/scheduler/stop', (req, res) => {
    if (schedulerStatus !== 'running' || !schedulerProcess) {
        return res.json({ success: false, message: 'El scheduler no está corriendo' });
    }

    try {
        schedulerProcess.kill('SIGTERM');
        schedulerStatus = 'stopped';
        schedulerProcess = null;
        res.json({ success: true, message: 'Scheduler detenido' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Estado del scheduler
app.get('/api/scheduler/status', (req, res) => {
    res.json({
        status: schedulerStatus,
        startTime: schedulerStartTime,
        uptime: schedulerStartTime ? Math.floor((Date.now() - schedulerStartTime) / 1000) : 0,
        recentLogs: schedulerLogs.slice(-10)
    });
});

// Run Test Cycle
app.post('/api/test-run', (req, res) => {
    if (schedulerStatus === 'running') {
        return res.json({ success: false, message: 'Detén el scheduler global antes de ejecutar un test' });
    }

    try {
        const testScriptPath = path.join(__dirname, '..', 'test_cycle.js');
        const testProcess = spawn('node', [testScriptPath], {
            cwd: path.join(__dirname, '..', '..'),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // We don't track test process as the main scheduler, but we can log output
        testProcess.stdout.on('data', (data) => console.log('[TEST]', data.toString().trim()));
        testProcess.stderr.on('data', (data) => console.error('[TEST ERROR]', data.toString().trim()));

        res.json({ success: true, message: 'Ciclo de prueba iniciado (revisa la consola)' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Rescue Pending Emails (Manual Retry)
app.post('/api/rescue-emails', async (req, res) => {
    try {
        if (!gmailSender.getStats().accountsConfigured) {
            return res.json({ success: false, message: 'Gmail no está configurado o no hay cuentas.' });
        }

        // 1. Get pending leads that have a message but no email sent
        const pendingLeads = db.prepare(`
            SELECT * FROM leads 
            WHERE ai_personalized_message IS NOT NULL 
            AND ai_personalized_message NOT LIKE '%[SIMULACIÓN%' 
            AND email_sent = 0 
            AND email IS NOT NULL 
            LIMIT 20
        `).all();

        if (pendingLeads.length === 0) {
            return res.json({ success: true, message: 'No hay leads pendientes por rescatar.', count: 0 });
        }

        console.log(`[RESCUE] Rescatando ${pendingLeads.length} leads...`);

        // 2. Process in background to avoid timeout
        (async () => {
            let successCount = 0;
            for (const lead of pendingLeads) {
                try {
                    const subjectMatch = lead.ai_personalized_message.match(/Asunto:\s*(.+)/i);
                    const subject = subjectMatch ? subjectMatch[1].trim() : `Oportunidad para ${lead.business_name}`;
                    const body = lead.ai_personalized_message.replace(/Asunto:.*\n?/i, '');

                    console.log(`[RESCUE] Enviando a ${lead.business_name}...`);
                    const sent = await gmailSender.sendEmail(lead.email, subject, body, lead);

                    if (sent) {
                        db.prepare('UPDATE leads SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(lead.id);
                        successCount++;
                    }

                    // Random delay 2-5s
                    const delay = Math.floor(Math.random() * 3000) + 2000;
                    await new Promise(r => setTimeout(r, delay));

                } catch (err) {
                    console.error(`[RESCUE ERROR] Lead ${lead.id}:`, err.message);
                }
            }
            console.log(`[RESCUE] Completado. Enviados: ${successCount}/${pendingLeads.length}`);
        })();

        res.json({
            success: true,
            message: `Iniciando envío a ${pendingLeads.length} leads en segundo plano.`,
            count: pendingLeads.length
        });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Auto-start check
if (process.env.AUTO_START_SCHEDULER === 'true') {
    console.log('🔄 Auto-starting scheduler per configuration...');
    // Small delay to ensure DB is ready
    setTimeout(() => {
        const schedulerPath = path.join(__dirname, '..', 'scheduler.js');
        schedulerProcess = spawn('node', [schedulerPath], {
            cwd: path.join(__dirname, '..', '..'),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        schedulerStatus = 'running';
        schedulerStartTime = new Date();

        schedulerProcess.stdout.on('data', (data) => {
            const log = data.toString().trim();
            schedulerLogs.push({ time: new Date(), message: log });
            if (schedulerLogs.length > 100) schedulerLogs.shift();
            console.log('[SCHEDULER]', log);
        });

        schedulerProcess.stderr.on('data', (data) => {
            const log = data.toString().trim();
            schedulerLogs.push({ time: new Date(), message: '[ERROR] ' + log });
            console.error('[SCHEDULER ERROR]', log);
        });

        console.log('✅ Scheduler auto-started');
    }, 2000);
}

// ==========================================
// SERVER
// ==========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Dashboard: http://localhost:${PORT}`);
    console.log(`🔐 OAuth Config: http://localhost:${PORT}/oauth`);
    console.log(`📧 Cuentas configuradas: ${gmailSender.getStats().accountsConfigured}\n`);
});
