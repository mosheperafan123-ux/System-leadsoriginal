const config = require('../config');

class N8nEmailSender {
    constructor() {
        this.webhookUrl = config.N8N_WEBHOOK_URL;
    }

    async sendEmail(to, subject, body, leadData = {}) {
        if (!this.webhookUrl) {
            console.log('⚠ N8N_WEBHOOK_URL no configurada en .env');
            return false;
        }

        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to,
                    subject,
                    body,
                    // Datos extra del lead para personalización en n8n si lo necesitas
                    businessName: leadData.business_name || '',
                    phone: leadData.phone || '',
                    website: leadData.website || ''
                })
            });

            if (response.ok) {
                console.log(`✅ Email enviado a ${to} via n8n`);
                return true;
            } else {
                console.error(`❌ Error n8n: ${response.status}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error conexión n8n:`, error.message);
            return false;
        }
    }
}

module.exports = N8nEmailSender;
