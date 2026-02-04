const axios = require('axios');
const chalk = require('chalk');

const API_KEY = 'AIzaSyA6kXzlhNsCAmisRIExDL9iHiM0hxRnmKQ'; // La clave del user
const QUERY = 'Clínicas dentales en Madrid';

async function testNewApi() {
    console.log(chalk.cyan(`Probando NEW Places API (v1) con query: "${QUERY}"`));
    const url = `https://places.googleapis.com/v1/places:searchText`;

    // Solicitamos campos específicos en la máscara (incluyendo website y teléfono)
    const fieldMask = 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.id';

    try {
        const res = await axios.post(url, {
            textQuery: QUERY
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': fieldMask
            }
        });

        const data = res.data;

        if (data.places && data.places.length > 0) {
            console.log(chalk.green(`✅ Resultados encontrados: ${data.places.length}`));

            const first = data.places[0];
            console.log(chalk.white('\nEjemplo del primer resultado:'));
            console.log(`Nombre: ${first.displayName?.text}`);
            console.log(`Address: ${first.formattedAddress}`);
            console.log(`ID: ${first.id}`);

            // Verificamos el santo grial: website en la lista
            if (first.websiteUri) {
                console.log(chalk.green(`✅ Website: ${first.websiteUri}`));
            } else {
                console.log(chalk.red(`❌ Website: NO DEVUELTO`));
            }

            if (first.nationalPhoneNumber) {
                console.log(chalk.green(`✅ Teléfono: ${first.nationalPhoneNumber}`));
            } else {
                console.log(chalk.red(`❌ Teléfono: NO DEVUELTO`));
            }

        } else {
            console.log('No se encontraron resultados.');
        }

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log(e.response.data);
    }
}

testNewApi();
