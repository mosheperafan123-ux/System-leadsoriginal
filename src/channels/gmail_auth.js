const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const credentialsPath = path.join(__dirname, '../../credentials.json');
const tokenPath = path.join(__dirname, '../../token.json');

async function authorize() {
    if (!fs.existsSync(credentialsPath)) {
        console.log('❌ No se encontró credentials.json');
        console.log('\nPasos para obtenerlo:');
        console.log('1. Ve a https://console.cloud.google.com/apis/credentials');
        console.log('2. Crea un proyecto (o usa uno existente)');
        console.log('3. Habilita la API de Gmail');
        console.log('4. Crea credenciales OAuth 2.0 (Tipo: Aplicación de escritorio)');
        console.log('5. Descarga el JSON y guárdalo como "credentials.json" en la raíz del proyecto');
        return;
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Generar URL de autorización
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('\n🔐 AUTORIZACIÓN DE GMAIL API\n');
    console.log('1. Abre esta URL en tu navegador:\n');
    console.log(authUrl);
    console.log('\n2. Inicia sesión con tu cuenta de Gmail');
    console.log('3. Autoriza la aplicación');
    console.log('4. Copia el código que aparece y pégalo aquí:\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Código: ', async (code) => {
        rl.close();
        try {
            const { tokens } = await oauth2Client.getToken(code);
            fs.writeFileSync(tokenPath, JSON.stringify(tokens));
            console.log('\n✅ Token guardado exitosamente en token.json');
            console.log('Ahora el sistema puede enviar emails automáticamente.');
        } catch (error) {
            console.error('❌ Error obteniendo token:', error.message);
        }
    });
}

authorize();
