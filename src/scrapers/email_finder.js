const chalk = require('chalk');

class EmailFinder {
    constructor(browserContext) {
        this.context = browserContext;

        // Lista negra de dominios/patrones de email inválidos
        this.invalidPatterns = [
            'sentry', 'wixpress', 'wix.com', 'localhost',
            'example.com', 'test.com', 'noreply', 'no-reply',
            'donotreply', 'mailer-daemon', 'postmaster',
            '@0.0.0.0', '@127.0.0.1', 'email@email',
            'your-email', 'youremail', 'correo@correo',
            'info@info', 'email@example', 'usuario@',
            '.png', '.jpg', '.gif', '.webp', '@2x'
        ];
    }

    isValidEmail(email) {
        if (!email || email.length < 6) return false;

        const lowerEmail = email.toLowerCase();

        // Verificar contra lista negra
        for (const pattern of this.invalidPatterns) {
            if (lowerEmail.includes(pattern)) return false;
        }

        // Verificar formato básico
        if (!email.includes('@') || !email.includes('.')) return false;

        // Verificar que no sea muy largo (spam)
        if (email.length > 60) return false;

        return true;
    }

    async findEmail(url) {
        if (!url) return null;
        if (!url.startsWith('http')) url = 'http://' + url;

        let page = null;
        try {
            console.log(chalk.gray(`Visitando web: ${url}`));
            page = await this.context.newPage();

            // Bloquear recursos pesados
            await page.route('**/*.{png,jpg,jpeg,gif,css,font,woff,woff2,svg,ico}', route => route.abort());

            await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });

            // 1. Buscar mailto
            let email = await this.extractFromMailto(page);
            if (email && this.isValidEmail(email)) return email;

            // 2. Buscar en texto visible
            email = await this.extractFromText(page);
            if (email && this.isValidEmail(email)) return email;

            // 3. Intentar ir a página de contacto
            const contactLink = await page.$('a[href*="contact"], a[href*="contacto"], a[href*="Contact"]');
            if (contactLink) {
                console.log(chalk.gray('  -> Yendo a página de contacto...'));
                await contactLink.click({ timeout: 5000 }).catch(() => { });
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => { });

                email = await this.extractFromMailto(page);
                if (email && this.isValidEmail(email)) return email;

                email = await this.extractFromText(page);
                if (email && this.isValidEmail(email)) return email;
            }

            return null;

        } catch (e) {
            return null;
        } finally {
            if (page) await page.close();
        }
    }

    async extractFromMailto(page) {
        try {
            const mailtoLinks = await page.$$eval('a[href^="mailto:"]', els => els.map(el => el.href));
            for (const mailto of mailtoLinks) {
                const email = decodeURIComponent(mailto.replace('mailto:', '').split('?')[0]);
                if (this.isValidEmail(email)) return email;
            }
        } catch (e) { }
        return null;
    }

    async extractFromText(page) {
        try {
            const content = await page.content();
            const emails = content.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g);

            if (emails && emails.length > 0) {
                // Filtrar y priorizar emails de contacto reales
                const priorityKeywords = ['info@', 'contacto@', 'contact@', 'reservas@', 'ventas@', 'hola@', 'admin@'];

                // Primero buscar emails con palabras clave prioritarias
                for (const keyword of priorityKeywords) {
                    const priorityEmail = emails.find(e => e.toLowerCase().includes(keyword));
                    if (priorityEmail && this.isValidEmail(priorityEmail)) return priorityEmail;
                }

                // Si no, retornar el primer email válido
                for (const email of emails) {
                    if (this.isValidEmail(email)) return email;
                }
            }
        } catch (e) { }
        return null;
    }
}

module.exports = EmailFinder;
