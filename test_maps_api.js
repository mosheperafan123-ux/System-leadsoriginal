const axios = require('axios');
const chalk = require('chalk');

const API_KEY = 'AIzaSyA6kXzlhNsCAmisRIExDL9iHiM0hxRnmKQ'; // La clave del user
const QUERY = 'Clínicas dentales en Madrid';

async function testApi() {
    console.log(chalk.cyan(`Probando TextSearch con query: "${QUERY}"`));
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(QUERY)}&key=${API_KEY}`;

    try {
        const res = await axios.get(url);
        const data = res.data;

        console.log(chalk.yellow(`Status: ${data.status}`));
        if (data.results && data.results.length > 0) {
            console.log(chalk.green(`Resultados en pagina 1: ${data.results.length}`));

            const first = data.results[0];
            console.log(chalk.white('\nEjemplo del primer resultado (Campos devueltos):'));
            console.log(Object.keys(first));

            console.log('\n--- Datos Clave ---');
            console.log(`Nombre: ${first.name}`);
            console.log(`Address: ${first.formatted_address}`);
            console.log(`Place ID: ${first.place_id}`);
            // Verificamos si devuelve website o teléfono en la lista
            console.log(`Website: ${first.website || '❌ NO DEVUELTO'}`);
            console.log(`Teléfono: ${first.formatted_phone_number || '❌ NO DEVUELTO'}`);

            if (data.next_page_token) {
                console.log(chalk.blue('\n✅ Hay token de pagina siguiente (max 60 resultados totales en 3 llamadas)'));
            }
        } else {
            console.log('No se encontraron resultados.');
        }

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log(e.response.data);
    }
}

testApi();
