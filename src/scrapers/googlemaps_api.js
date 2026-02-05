/**
 * Google Maps Places API Scraper (V1 - New API)
 * Uses Field Masking to get website/phone in search results (Much cheaper & faster)
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
        this.baseUrl = 'https://places.googleapis.com/v1/places:searchText';
        this.emailFinder = null;
        this.browser = null;
        this.context = null;

        // URLs de redes sociales que NO tienen emails públicos
        this.socialMediaDomains = [
            'instagram.com', 'facebook.com', 'fb.com', 'twitter.com', 'x.com',
            'tiktok.com', 'linkedin.com', 'youtube.com', 'pinterest.com',
            'wa.me', 'whatsapp.com', 't.me', 'telegram.org'
        ];
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

    async scrape(keyword, maxLeads = 100, onLeadFound = null) {
        if (!this.apiKey) {
            console.log(chalk.yellow('⚠ No hay API Key de Google Maps, usando scraper tradicional...'));
            const GoogleMapsScraper = require('./googlemaps');
            const fallback = new GoogleMapsScraper();
            const result = await fallback.scrape(keyword, maxLeads);
            await fallback.close();
            return result;
        }

        if (!this.context) await this.init();

        console.log(chalk.yellow(`🔍 [API V1] Buscando: ${keyword}`));

        // Extract city from keyword
        const cityMatch = keyword.match(/en\s+(.+?)(?:\s*,|$)/i);
        const searchCity = cityMatch ? cityMatch[1].trim() : 'España';

        let leads = [];
        let nextPageToken = null;

        // Field Mask: Critical for cost/speed. Request contact info directly in search.
        const fieldMask = [
            'places.displayName',
            'places.formattedAddress',
            'places.nationalPhoneNumber',
            'places.websiteUri',
            'places.rating',
            'places.userRatingCount',
            'places.types',
            'places.id'
        ].join(',');

        try {
            do {
                const requestBody = {
                    textQuery: keyword,
                    pageSize: 20, // Max allowed per page
                    languageCode: 'es',
                    regionCode: 'ES' // CRÍTICO: Forzar resultados de España
                };

                if (nextPageToken) {
                    requestBody.pageToken = nextPageToken;
                }

                const response = await axios.post(this.baseUrl, requestBody, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': this.apiKey,
                        'X-Goog-FieldMask': fieldMask
                    }
                });

                const data = response.data;
                const places = data.places || [];

                console.log(chalk.green(`📍 Página recibida: ${places.length} resultados`));

                // Process batch
                for (const place of places) {
                    if (leads.length >= maxLeads) break;

                    const lead = {
                        business_name: place.displayName?.text || '',
                        category: place.types ? place.types[0].replace(/_/g, ' ') : 'Negocio local',
                        address: place.formattedAddress || '',
                        city: searchCity,
                        phone: place.nationalPhoneNumber || '',
                        website: place.websiteUri || '', // Direct from search!
                        rating: place.rating || 0,
                        reviews_count: place.userRatingCount || 0,
                        email: null
                    };

                    // Only process if has website (critical filter)
                    if (lead.website) {
                        // Check if duplicate BEFORE finding email to save time
                        const isDuplicate = this.checkDuplicate(lead.business_name);

                        if (!isDuplicate) {
                            // FILTRO: Saltar redes sociales (nunca tienen emails)
                            const isSocialMedia = this.socialMediaDomains.some(domain =>
                                lead.website.toLowerCase().includes(domain)
                            );

                            if (isSocialMedia) {
                                console.log(chalk.gray(`  -> ${lead.business_name} (red social, saltando)`));
                                continue;
                            }

                            console.log(chalk.gray(`  -> Buscando email en ${lead.website}...`));
                            try {
                                lead.email = await this.emailFinder.findEmail(lead.website);
                            } catch (err) { }

                            if (lead.email) {
                                const saved = this.saveLead(lead);
                                if (saved) {
                                    leads.push(lead);
                                    console.log(chalk.cyan(`[${leads.length}/${maxLeads}] ${lead.business_name} - ${lead.email}`));

                                    // CALLBACK PARA PROCESAMIENTO LINEAL (PIPELINE)
                                    if (onLeadFound) {
                                        const result = await onLeadFound(lead);
                                        // Si el callback pide parar (ej: límite de emails alcanzado), abortamos scraping
                                        if (result && result.stop) {
                                            console.log(chalk.red('🛑 Callback solicitó detener scraping (Límite Global Alcanzado).'));
                                            return leads; // Retornamos lo que tenemos y salimos
                                        }
                                    }
                                }
                            } else {
                                console.log(chalk.gray(`  -> ${lead.business_name} (sin email)`));
                            }
                        } else {
                            // console.log(chalk.gray(`  -> ${lead.business_name} (duplicado)`));
                        }
                    }
                }

                nextPageToken = data.nextPageToken;
                // Delay for next page if exists
                if (nextPageToken && leads.length < maxLeads) {
                    await new Promise(r => setTimeout(r, 2000));
                }

            } while (nextPageToken && leads.length < maxLeads);

        } catch (err) {
            console.error(chalk.red('Error en API V1 scraping:'), err.message);
            if (err.response) console.error(err.response.data);
        }

        return leads;
    }

    checkDuplicate(businessName) {
        // Quick check to avoid redundant email finding
        const count = db.prepare('SELECT COUNT(*) as c FROM leads WHERE business_name = ?').get(businessName).c;
        return count > 0;
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
