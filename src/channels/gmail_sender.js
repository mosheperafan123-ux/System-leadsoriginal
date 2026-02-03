const { google } = require('googleapis');
const config = require('../config');
const path = require('path');
const fs = require('fs');

class GmailSender {
    constructor() {
        this.gmail = null;
        this.initialized = false;
    }

    async init() {
        // Cargar credenciales OAuth2 desde archivo
        const credentialsPath = path.join(__dirname, '../../credentials.json');
        const tokenPath = path.join(__dirname, '../../token.json');

        if (!fs.existsSync(credentialsPath)) {
            console.error('❌ Falta credentials.json - Descárgalo de Google Cloud Console');
            console.log('   1. Ve a https://console.cloud.google.com/apis/credentials');
            console.log('   2. Crea credenciales OAuth 2.0 para aplicación de escritorio');
            console.log('   3. Descarga el JSON y guárdalo como credentials.json');
            return false;
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsPath));
        const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

        const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        // Verificar si ya tenemos token
        if (fs.existsSync(tokenPath)) {
            const token = JSON.parse(fs.readFileSync(tokenPath));
            oauth2Client.setCredentials(token);
        } else {
            console.log('❌ Falta token.json - Ejecuta: node src/channels/gmail_auth.js');
            return false;
        }

        this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        this.initialized = true;
        console.log('✅ Gmail API inicializada correctamente');
        return true;
    }

    async sendEmail(to, subject, htmlBody) {
        if (!this.initialized) {
            console.error('Gmail no inicializado');
            return false;
        }

        // Crear el email en formato MIME
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `From: ${config.EMAIL_FROM}`,
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            '',
            htmlBody
        ];
        const message = messageParts.join('\n');

        // Codificar en base64url
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        try {
            const res = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodedMessage }
            });
            console.log(`✅ Email enviado a ${to} (ID: ${res.data.id})`);
            return true;
        } catch (error) {
            console.error(`❌ Error enviando a ${to}:`, error.message);
            return false;
        }
    }
}

module.exports = GmailSender;
