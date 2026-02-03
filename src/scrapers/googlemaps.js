const { chromium } = require('playwright');
const { db } = require('../database');
const config = require('../config');
const chalk = require('chalk');
const EmailFinder = require('./email_finder');

class GoogleMapsScraper {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.emailFinder = null;
    }

    async init() {
        console.log(chalk.blue('Iniciando navegador...'));
        this.browser = await chromium.launch({
            headless: config.HEADLESS_MODE,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 },
            locale: 'es-ES',
            geolocation: { longitude: -3.7038, latitude: 40.4168 }, // Madrid
            permissions: ['geolocation']
        });
        this.page = await this.context.newPage();
        this.emailFinder = new EmailFinder(this.context);
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async scrape(keyword, maxLeads = 10) {
        if (!this.page) await this.init();

        console.log(chalk.yellow(`Buscando: ${keyword}`));

        // Extraer ciudad del keyword para guardarla
        const cityMatch = keyword.match(/en\s+(.+?)(?:\s*,|$)/i);
        const searchCity = cityMatch ? cityMatch[1].trim() : '';

        await this.page.goto(`https://www.google.com/maps/search/${encodeURIComponent(keyword)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Manejar dialogo de cookies de Google (GDPR - Europa)
        try {
            const acceptButton = await this.page.$('button[aria-label*="Aceptar"], button[aria-label*="Accept"], form[action*="consent"] button');
            if (acceptButton) {
                console.log(chalk.gray('  -> Aceptando cookies...'));
                await acceptButton.click();
                await this.page.waitForTimeout(2000);
            }
        } catch (e) {
            // Cookie dialog may not appear, continue
        }

        // Esperar que la página cargue completamente
        await this.page.waitForTimeout(3000);

        // Esperar lista de resultados (múltiples selectores)
        try {
            await this.page.waitForSelector('div[role="feed"], div.Nv2PK, div[aria-label*="Resultados"]', { timeout: 20000 });
        } catch (e) {
            // Intentar scroll por si la página cargó pero el feed no apareció
            await this.page.evaluate(() => window.scrollBy(0, 300));
            await this.page.waitForTimeout(2000);

            // Segundo intento
            const hasFeed = await this.page.$('div[role="feed"], div.Nv2PK, a[href*="/maps/place/"]');
            if (!hasFeed) {
                console.log(chalk.red('No se encontraron resultados.'));
                return [];
            }
        }

        let leads = [];
        let scrollAttempts = 0;
        const maxScrolls = 5;

        // Scroll para cargar más resultados
        while (leads.length < maxLeads && scrollAttempts < maxScrolls) {
            const feed = await this.page.$('div[role="feed"]');
            if (feed) {
                await feed.evaluate(el => el.scrollBy(0, 800));
                await this.page.waitForTimeout(1500);
            }
            scrollAttempts++;
        }

        // Obtener todos los links de negocios
        const links = await this.page.$$('a[href*="/maps/place/"]');
        console.log(chalk.green(`Encontrados ${links.length} negocios`));

        // Procesar cada uno
        for (let i = 0; i < Math.min(links.length, maxLeads); i++) {
            try {
                // Re-obtener links porque el DOM puede cambiar
                const currentLinks = await this.page.$$('a[href*="/maps/place/"]');
                if (i >= currentLinks.length) break;

                const link = currentLinks[i];
                await link.scrollIntoViewIfNeeded();
                await link.click();
                await this.page.waitForTimeout(2500);

                const lead = await this.extractDetails(searchCity);

                if (lead.business_name && lead.business_name.length > 2) {
                    const saved = this.saveLead(lead);
                    if (saved) {
                        leads.push(lead);
                        console.log(chalk.cyan(`[${leads.length}/${maxLeads}] ${lead.business_name}`));
                    }
                }
            } catch (err) {
                console.log(chalk.gray(`  Saltando elemento ${i}: ${err.message}`));
            }
        }

        return leads;
    }

    async extractDetails(city = '') {
        const details = {
            business_name: '',
            category: '',
            address: '',
            city: city,
            phone: '',
            website: '',
            rating: 0,
            reviews_count: 0,
            email: null
        };

        try {
            // Nombre del negocio (selector principal)
            const nameEl = await this.page.$('h1.DUwDvf, h1.fontHeadlineLarge');
            if (nameEl) {
                details.business_name = await nameEl.textContent();
            }

            // Categoría (múltiples selectores)
            try {
                // Selector principal: botón de categoría
                let categoryEl = await this.page.$('button[jsaction*="category"]');
                if (categoryEl) {
                    details.category = await categoryEl.textContent();
                }

                // Fallback 1: texto debajo del nombre
                if (!details.category || details.category === '') {
                    const categorySpan = await this.page.$('span.DkEaL');
                    if (categorySpan) details.category = await categorySpan.textContent();
                }

                // Fallback 2: primer span con role button cerca del nombre
                if (!details.category || details.category === '') {
                    const altCategory = await this.page.$('div.LBgpqf button span');
                    if (altCategory) details.category = await altCategory.textContent();
                }

                // Fallback 3: extraer del keyword de búsqueda
                if (!details.category || details.category === '') {
                    details.category = 'Negocio local';
                }
            } catch (e) {
                details.category = 'Negocio local';
            }

            // Datos de contacto y dirección
            const infoButtons = await this.page.$$('button[data-item-id]');
            for (const btn of infoButtons) {
                const itemId = await btn.getAttribute('data-item-id');
                const text = await btn.textContent();

                if (itemId && itemId.includes('phone')) {
                    details.phone = text.replace(/\s+/g, '');
                }
                if (itemId && itemId.includes('address')) {
                    details.address = text;
                }
            }

            // Website (método alternativo)
            const websiteLink = await this.page.$('a[data-item-id="authority"]');
            if (websiteLink) {
                details.website = await websiteLink.getAttribute('href');
            } else {
                // Fallback: buscar en textos
                const texts = await this.page.$$eval('.Io6YTe', nodes => nodes.map(n => n.textContent));
                for (const t of texts) {
                    if (t.includes('.') && !t.includes(' ') && !t.includes('+') && t.length < 50) {
                        details.website = t;
                        break;
                    }
                }
            }

            // Rating
            const ratingEl = await this.page.$('div.F7nice span[aria-hidden="true"]');
            if (ratingEl) {
                const ratingText = await ratingEl.textContent();
                details.rating = parseFloat(ratingText.replace(',', '.')) || 0;
            }

            // Reviews count
            const reviewsEl = await this.page.$('div.F7nice span[aria-label*="reseña"]');
            if (reviewsEl) {
                const reviewsText = await reviewsEl.getAttribute('aria-label');
                const match = reviewsText.match(/(\d+)/);
                if (match) details.reviews_count = parseInt(match[1]);
            }

            // Buscar email si tiene website
            if (details.website) {
                console.log(chalk.gray(`  -> Buscando email en ${details.website}...`));
                try {
                    details.email = await this.emailFinder.findEmail(details.website);
                    if (details.email) {
                        console.log(chalk.green(`  -> ✅ Email: ${details.email}`));
                    }
                } catch (err) { }
            }

        } catch (e) {
            // Silenciar errores de extracción parcial
        }

        return details;
    }

    saveLead(lead) {
        try {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO leads 
                (business_name, category, address, city, phone, website, rating, reviews_count, email)
                VALUES (@business_name, @category, @address, @city, @phone, @website, @rating, @reviews_count, @email)
            `);
            const result = stmt.run(lead);
            return result.changes > 0; // true si se insertó, false si era duplicado
        } catch (e) {
            return false;
        }
    }
}

module.exports = GoogleMapsScraper;
