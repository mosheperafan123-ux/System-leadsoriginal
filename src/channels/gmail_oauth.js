const { google } = require('googleapis');
const config = require('../config');
const chalk = require('chalk');
const { db } = require('../database'); // Import DB for persistence

class GmailMultiAccountSender {
    constructor() {
        // Cuentas de email con sus refresh tokens
        this.accounts = this.loadAccounts();
        this.currentAccountIndex = 0;

        // Límites (configurable via ENV)
        this.dailyLimitPerAccount = parseInt(process.env.DAILY_LIMIT_PER_ACCOUNT) || 450;

        // Inicializar contadores desde la DB para persistencia
        this.emailsSentPerAccount = {};
        this.syncCounters();

        console.log(chalk.gray(`   📧 Sender inicializado con ${this.accounts.length} cuentas. Límite diario: ${this.dailyLimitPerAccount}`));
    }

    syncCounters() {
        this.accounts.forEach(acc => {
            try {
                // Contar emails enviados HOY por esta cuenta
                const row = db.prepare(`
                    SELECT COUNT(*) as c 
                    FROM leads 
                    WHERE email_sent = 1 
                    AND sender_email = ? 
                    AND DATE(email_sent_at) = DATE('now')
                `).get(acc.email);

                this.emailsSentPerAccount[acc.email] = row ? row.c : 0;
            } catch (e) {
                console.error(`Error sincronizando counter para ${acc.email}:`, e.message);
                this.emailsSentPerAccount[acc.email] = 0;
            }
        });
    }

    loadAccounts() {
        const accountsStr = process.env.GMAIL_ACCOUNTS || '';
        if (!accountsStr) {
            if (process.env.GMAIL_REFRESH_TOKEN && process.env.EMAIL_PROFILES) {
                const emails = process.env.EMAIL_PROFILES.split(',');
                return [{
                    email: emails[0],
                    refreshToken: process.env.GMAIL_REFRESH_TOKEN
                }];
            }
            return [];
        }

        return accountsStr.split(',').map(pair => {
            const [email, token] = pair.split(':');
            return { email: email.trim(), refreshToken: token.trim() };
        }).filter(acc => acc.email && acc.refreshToken);
    }

    getOAuth2Client() {
        return new google.auth.OAuth2(
            config.GMAIL_CLIENT_ID,
            config.GMAIL_CLIENT_SECRET,
            config.GMAIL_REDIRECT_URI
        );
    }

    // Obtener siguiente cuenta disponible (rotación estricta con límite diario)
    getNextAccount() {
        if (this.accounts.length === 0) return null;

        // Re-sincronizar contadores ocasionalmente (o confiar en memoria + DB)
        // Por eficiencia confiamos en memoria pero init desde DB

        let selectedAccount = null;
        let minSent = Infinity;

        for (const account of this.accounts) {
            const sentToday = this.emailsSentPerAccount[account.email] || 0;

            // CRÍTICO: Verificar límite diario
            if (sentToday < this.dailyLimitPerAccount) {
                if (sentToday < minSent) {
                    minSent = sentToday;
                    selectedAccount = account;
                }
            }
        }

        if (!selectedAccount) {
            // Check if ALL accounts are full
            const totalSent = Object.values(this.emailsSentPerAccount).reduce((a, b) => a + b, 0);
            console.log(chalk.yellow(`   ⚠ Límite diario alcanzado en todas las cuentas. Total hoy: ${totalSent}`));
        }

        return selectedAccount;
    }

    createMessage(from, to, subject, body) {
        const messageParts = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            body.replace(/\n/g, '<br>')
        ];

        return Buffer.from(messageParts.join('\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    async sendEmail(to, subject, body, lead) {
        // Sincronizar antes de decidir (frenar condiciones de carrera en reinicios)
        this.syncCounters();

        const account = this.getNextAccount();

        // RETORNA FALSE SI NO HAY CUENTAS DISPONIBLES (PAUSA GLOBAL)
        if (!account) {
            return false;
        }

        try {
            const oauth2Client = this.getOAuth2Client();
            oauth2Client.setCredentials({ refresh_token: account.refreshToken });

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            const encodedMessage = this.createMessage(account.email, to, subject, body);

            await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodedMessage }
            });

            // Actualizar DB con el sender_email para persistencia
            db.prepare(`
                UPDATE leads 
                SET email_sent = 1, 
                    email_sent_at = CURRENT_TIMESTAMP, 
                    sender_email = ? 
                WHERE id = ?
            `).run(account.email, lead.id);

            // Actualizar contador en memoria
            this.emailsSentPerAccount[account.email]++;

            console.log(chalk.green(`✅ Email enviado a ${to}`));
            console.log(chalk.gray(`   Desde: ${account.email} (${this.emailsSentPerAccount[account.email]}/${this.dailyLimitPerAccount})`));

            return true;

        } catch (error) {
            console.error(chalk.red(`❌ Error enviando desde ${account.email}:`), error.message);
            return false;
        }
    }

    // Checking for responses 
    async checkInboxForResponses(db) {
        console.log(chalk.blue('📩 Verificando respuestas en Inboxes...'));
        let totalResponses = 0;

        for (const account of this.accounts) {
            try {
                const oauth2Client = this.getOAuth2Client();
                oauth2Client.setCredentials({ refresh_token: account.refreshToken });
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                // Listar mensajes no leídos (UNREAD) en el Inbox
                const res = await gmail.users.messages.list({
                    userId: 'me',
                    q: 'is:unread in:inbox',
                    maxResults: 50
                });

                if (!res.data.messages || res.data.messages.length === 0) continue;

                console.log(chalk.gray(`   Cuenta ${account.email}: ${res.data.messages.length} mensajes nuevos`));

                for (const messageMeta of res.data.messages) {
                    const msg = await gmail.users.messages.get({
                        userId: 'me',
                        id: messageMeta.id
                    });

                    const headers = msg.data.payload.headers;
                    const fromHeader = headers.find(h => h.name === 'From');

                    if (!fromHeader) continue;

                    // Extraer email limpio
                    const emailMatch = fromHeader.value.match(/<(.+)>/);
                    const email = emailMatch ? emailMatch[1] : fromHeader.value;

                    // Buscar si este email pertenece a un lead contactado
                    const lead = db.prepare('SELECT * FROM leads WHERE email = ? AND email_sent = 1').get(email);

                    if (lead) {
                        console.log(chalk.green(`   ✨ ¡RESPUESTA DETECTADA! De: ${lead.business_name} (${email})`));

                        // Obtener snippet del mensaje
                        const snippet = msg.data.snippet;

                        // Actualizar lead
                        db.prepare(`
                            UPDATE leads 
                            SET response_status = 'responded', 
                                response_text = ?, 
                                response_date = CURRENT_TIMESTAMP 
                            WHERE id = ?
                        `).run(snippet, lead.id);

                        totalResponses++;
                    }
                }

            } catch (error) {
                console.error(chalk.red(`Error verificando inbox de ${account.email}:`), error.message);
            }
        }
        return totalResponses;
    }
}


// Resetear contadores (llamar cada hora)
resetCounters() {
    this.accounts.forEach(acc => {
        this.emailsSentPerAccount[acc.email] = 0;
    });
    console.log(chalk.blue('🔄 Contadores de email reseteados'));
}

// Estadísticas de envío
getStats() {
    return {
        accounts: this.accounts.map(a => a.email),
        sentPerAccount: this.emailsSentPerAccount,
        dailyLimitPerAccount: this.dailyLimitPerAccount,
        hourlyLimitPerAccount: this.hourlyLimitPerAccount,
        totalCapacityPerDay: this.accounts.length * this.dailyLimitPerAccount,
        totalCapacityPerHour: this.accounts.length * this.hourlyLimitPerAccount,
        totalSent: Object.values(this.emailsSentPerAccount).reduce((a, b) => a + b, 0),
        accountsConfigured: this.accounts.length
    };
}

isConfigured() {
    return this.accounts.length > 0;
}
}

module.exports = GmailMultiAccountSender;
