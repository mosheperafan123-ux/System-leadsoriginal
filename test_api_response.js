require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');

async function testMapsAPI() {
    console.log(chalk.bold.cyan('🧪 VALIDACIÓN API GOOGLE MAPS V1\n'));

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error(chalk.red('❌ Error: No se encontró GOOGLE_MAPS_API_KEY en .env'));
        console.log(chalk.yellow('   Agrega tu clave al archivo .env para este test.'));
        return;
    }

    const keyword = 'Clínicas dentales en Madrid';
    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';

    // Field Mask: Pedimos específicamente la web y teléfono
    const fieldMask = [
        'places.displayName',
        'places.formattedAddress',
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.types'
    ].join(',');

    console.log(`🔑 API Key: ...${apiKey.slice(-5)}`);
    console.log(`🔍 Buscando: "${keyword}"`);
    console.log(`📋 Campos solicitados: ${fieldMask}\n`);

    try {
        const response = await axios.post(baseUrl, {
            textQuery: keyword,
            pageSize: 5
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': fieldMask
            }
        });

        const places = response.data.places || [];

        if (places.length === 0) {
            console.log(chalk.yellow('⚠ La API devolvió 0 resultados.'));
        } else {
            console.log(chalk.green(`✅ ÉXITO: Se encontraron ${places.length} resultados.\n`));

            places.forEach((place, i) => {
                console.log(chalk.bold(`${i + 1}. ${place.displayName.text}`));
                console.log(`   📍 Dirección: ${place.formattedAddress}`);
                console.log(`   📞 Teléfono: ${place.nationalPhoneNumber || 'N/A'}`);
                console.log(`   🌐 Web: ${place.websiteUri ? chalk.green(place.websiteUri) : chalk.red('SIN WEB')}`);
                console.log('---');
            });
        }

    } catch (err) {
        console.error(chalk.red('\n❌ Error en la petición API:'));
        if (err.response) {
            console.error(chalk.red(`   Status: ${err.response.status}`));
            console.error(chalk.red(`   Data: ${JSON.stringify(err.response.data, null, 2)}`));
        } else {
            console.error(err.message);
        }
    }
}

testMapsAPI();
