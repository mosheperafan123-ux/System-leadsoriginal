# LeadGen AI - Sistema de Generación de Leads

Sistema automatizado para extraer leads de Google Maps, encontrar emails, generar mensajes personalizados con IA, y enviar emails via Gmail OAuth2 con rotación de perfiles.

## 🚀 Deployment Rápido (EasyPanel)

1. **Crear App en EasyPanel**
   - Tipo: Docker
   - Conectar repo de GitHub
   - Branch: main

2. **Configurar Variables de Entorno**
   ```
   NODE_ENV=production
   PORT=3000
   GMAIL_CLIENT_ID=tu-client-id
   GMAIL_CLIENT_SECRET=tu-client-secret
   GMAIL_REDIRECT_URI=https://tu-dominio.com/oauth/callback
   EMAIL_PROFILES=email1@dominio.com,email2@dominio.com
   OPENAI_API_KEY=sk-xxx
   ```

3. **Autenticar Gmail**
   - Visitar: `https://tu-dominio.com/oauth/start`
   - Autorizar con cuenta de Google Workspace
   - Copiar el GMAIL_REFRESH_TOKEN y agregarlo a las variables

4. **Listo!**
   - Dashboard: `https://tu-dominio.com`

## 📋 Comandos Locales

```bash
# Instalar dependencias
npm install
npx playwright install chromium

# Ejecutar dashboard
npm run dashboard

# Ejecutar scraping manual
npm start

# Ejecutar en modo automático (cron)
npm run scheduler
```

## 🔧 Estructura del Proyecto

```
├── src/
│   ├── dashboard/          # Dashboard web
│   │   ├── server.js       # API Express + OAuth
│   │   └── public/         # Frontend
│   ├── scrapers/
│   │   ├── googlemaps.js   # Scraper de Google Maps
│   │   └── email_finder.js # Extractor de emails
│   ├── channels/
│   │   ├── gmail_oauth.js  # Envío Gmail con rotación
│   │   └── n8n_sender.js   # Alternativa via N8N
│   ├── ai/
│   │   └── message_generator.js
│   ├── database.js
│   └── config.js
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 📧 Rotación de Emails

El sistema rota automáticamente entre los perfiles configurados en `EMAIL_PROFILES`:
- Máximo 20 emails/hora por perfil
- Balancea carga entre cuentas
- Evita caer en spam de Gmail

## 🔐 Google Cloud Console Setup

1. Crear proyecto en Google Cloud Console
2. Habilitar Gmail API
3. Crear credenciales OAuth 2.0 (Web application)
4. Agregar redirect URIs autorizados:
   - `http://localhost:3000/oauth/callback` (desarrollo)
   - `https://tu-dominio.com/oauth/callback` (producción)

## ⚠️ Importante

- Nunca commitear `.env` con credenciales
- El `GMAIL_REFRESH_TOKEN` solo se muestra una vez en la autenticación
- Usar cuentas de Google Workspace para mayor volumen
