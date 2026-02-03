const GoogleMapsScraper = require('./src/scrapers/googlemaps');
const { initDb } = require('./src/database');

(async () => {
    initDb();

    const scraper = new GoogleMapsScraper();
    console.log('Iniciando prueba de scraping...');

    try {
        // Buscamos algo genérico en Bogotá para probar
        await scraper.scrape('Restaurantes en Bogotá', 3);
    } catch (error) {
        console.error('Error en prueba:', error);
    } finally {
        // await scraper.close(); // Dejar abierto un momento para ver si queremos debuggear visualmente (si headless=false)
        await scraper.close();
    }
})();
