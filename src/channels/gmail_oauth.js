const { google } = require('googleapis');
const config = require('../config');
const chalk = require('chalk');

class GmailMultiAccountSender {
    constructor() {
        // Cuentas de email con sus refresh tokens
        this.accounts = this.loadAccounts();
        this.currentAccountIndex = 0;
        this.emailsSentPerAccount = {};

        // Límites de warming up (configurable via ENV)
        // Día 1: 250 por cuenta | Día 2+: 500 por cuenta
        // Cambiar DAILY_LIMIT_PER_ACCOUNT en EasyPanel cuando escale
        this.dailyLimitPerAccount = parseInt(process.env.DAILY_LIMIT_PER_ACCOUNT) || 250;
        this.hourlyLimitPerAccount = Math.ceil(this.dailyLimitPerAccount / 12); // Distribuir en horario laboral

        // Inicializar contadores
        this.accounts.forEach(acc => {
            this.emailsSentPerAccount[acc.email] = 0;
        });
    }


    loadAccounts() {
        // Cargar cuentas desde variables de entorno
        // Formato: GMAIL_ACCOUNTS=email1:token1,email2:token2,...
        const accountsStr = process.env.GMAIL_ACCOUNTS || '';

        if (!accountsStr) {
            // Fallback: formato antiguo con una sola cuenta
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

    getAuthUrl(email) {
        const oauth2Client = this.getOAuth2Client();
        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.compose',
                'https://www.googleapis.com/auth/gmail.readonly'
            ],
            prompt: 'consent',
            login_hint: email // Pre-seleccionar la cuenta
        });
    }

    async getTokenFromCode(code) {
        const oauth2Client = this.getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    }

    // Obtener siguiente cuenta disponible (rotación con balanceo)
    getNextAccount() {
        if (this.accounts.length === 0) return null;

        // Encontrar la cuenta con menos envíos que no haya llegado al límite
        let selectedAccount = null;
        let minSent = Infinity;

        for (const account of this.accounts) {
            const sent = this.emailsSentPerAccount[account.email] || 0;
            if (sent < this.hourlyLimitPerAccount && sent < minSent) {
                minSent = sent;
                selectedAccount = account;
            }
        }

        return selectedAccount;
    }

    // Crear mensaje en formato MIME
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

        const message = messageParts.join('\n');
        return Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    async sendEmail(to, subject, body, leadData = {}) {
        const account = this.getNextAccount();

        if (!account) {
            console.log(chalk.red('❌ No hay cuentas disponibles o todas llegaron al límite'));
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

            // Incrementar contador
            this.emailsSentPerAccount[account.email]++;

            console.log(chalk.green(`✅ Email enviado a ${to}`));
            console.log(chalk.gray(`   Desde: ${account.email} (${this.emailsSentPerAccount[account.email]}/${this.hourlyLimitPerAccount})`));

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

                        // Marcar como leído en Gmail para no procesarlo de nuevo (opcional, por ahora lo dejamos unread para que el humano lo vea)
                        // await gmail.users.messages.modify({ userId: 'me', id: messageMeta.id, requestBody: { removeLabelIds: ['UNREAD'] } });

                        totalResponses++;
                    }
                }

            } catch (error) {
                console.error(chalk.red(`Error verificando inbox de ${account.email}:`), error.message);
            }
        }
        return totalResponses;
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
