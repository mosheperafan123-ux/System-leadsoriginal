/**
 * Google Maps Places API Scraper
 * Faster and more reliable than browser scraping
 */

const axios = require('axios');
const config = require('../config');
const { db } = require('../database');
const chalk = require('chalk');
const EmailFinder = require('./email_finder');
const { chromium } = require('playwright');

class GoogleMapsAPIScraper {
    constructor() {
        this.apiKey = config.GOOGLE_MAPS_API_KEY;
        this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
        this.emailFinder = null;
        this.browser = null;
        this.context = null;
    }

    async init() {
        // Initialize browser for email finding (still need to visit websites)
        this.browser = await chromium.launch({
            headless: config.HEADLESS_MODE,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 },
            locale: 'es-ES'
        });
        this.emailFinder = new EmailFinder(this.context);
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async scrape(keyword, maxLeads = 100) {
        if (!this.apiKey) {
            console.log(chalk.yellow('⚠ No hay API Key de Google Maps, usando scraper tradicional...'));
            const GoogleMapsScraper = require('./googlemaps');
            const fallback = new GoogleMapsScraper();
            const result = await fallback.scrape(keyword, maxLeads);
            await fallback.close();
            return result;
        }

        if (!this.context) await this.init();

        console.log(chalk.yellow(`🔍 [API] Buscando: ${keyword}`));

        // Extract city from keyword
        const cityMatch = keyword.match(/en\s+(.+?)(?:\s*,|$)/i);
        const searchCity = cityMatch ? cityMatch[1].trim() : 'España';

        let leads = [];
        let nextPageToken = null;

        try {
            // First search
            let allPlaces = [];

            do {
                const searchUrl = nextPageToken
                    ? `${this.baseUrl}/textsearch/json?pagetoken=${nextPageToken}&key=${this.apiKey}`
                    : `${this.baseUrl}/textsearch/json?query=${encodeURIComponent(keyword)}&language=es&region=es&key=${this.apiKey}`;

                const response = await axios.get(searchUrl);
                const data = response.data;

                if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                    console.log(chalk.red(`API Error: ${data.status} - ${data.error_message || ''}`));
                    break;
                }

                if (data.results) {
                    allPlaces = allPlaces.concat(data.results);
                }

                nextPageToken = data.next_page_token;

                // Google requires a short delay before using next_page_token
                if (nextPageToken) {
                    await new Promise(r => setTimeout(r, 2000));
                }

            } while (nextPageToken && allPlaces.length < maxLeads * 2);

            console.log(chalk.green(`📍 Encontrados ${allPlaces.length} negocios vía API`));

            // Process each place
            for (let i = 0; i < Math.min(allPlaces.length, maxLeads * 2) && leads.length < maxLeads; i++) {
                const place = allPlaces[i];

                try {
                    // Get place details
                    const detailsUrl = `${this.baseUrl}/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types&language=es&key=${this.apiKey}`;
                    const detailsResponse = await axios.get(detailsUrl);
                    const details = detailsResponse.data.result;

                    if (!details) continue;

                    const lead = {
                        business_name: details.name || '',
                        category: details.types ? details.types[0].replace(/_/g, ' ') : 'Negocio local',
                        address: details.formatted_address || '',
                        city: searchCity,
                        phone: details.formatted_phone_number || '',
                        website: details.website || '',
                        rating: details.rating || 0,
                        reviews_count: details.user_ratings_total || 0,
                        email: null
                    };

                    // Only process if has website
                    if (lead.website) {
                        console.log(chalk.gray(`  -> Buscando email en ${lead.website}...`));
                        try {
                            lead.email = await this.emailFinder.findEmail(lead.website);
                        } catch (err) { }

                        if (lead.email) {
                            const saved = this.saveLead(lead);
                            if (saved) {
                                leads.push(lead);
                                console.log(chalk.cyan(`[${leads.length}/${maxLeads}] ${lead.business_name} - ${lead.email}`));
                            }
                        } else {
                            console.log(chalk.gray(`  -> ${lead.business_name} (sin email, saltando)`));
                        }
                    }

                    // Small delay to be nice to the email finder
                    await new Promise(r => setTimeout(r, 500));

                } catch (err) {
                    console.log(chalk.gray(`  Error procesando: ${err.message}`));
                }
            }

        } catch (err) {
            console.error(chalk.red('Error en API scraping:'), err.message);
        }

        return leads;
    }

    saveLead(lead) {
        try {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO leads 
                (business_name, category, address, city, phone, website, rating, reviews_count, email)
                VALUES (@business_name, @category, @address, @city, @phone, @website, @rating, @reviews_count, @email)
            `);
            const result = stmt.run(lead);
            return result.changes > 0;
        } catch (e) {
            return false;
        }
    }
}

module.exports = GoogleMapsAPIScraper;
