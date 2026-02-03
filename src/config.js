require('dotenv').config();

module.exports = {
  // Database
  DATABASE_FILE: process.env.DATABASE_FILE || 'leads.db',

  // OpenAI / AIMLAPI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.aimlapi.com/v1',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5-nano-2025-08-07',

  // Gmail OAuth2 (Google Workspace)
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,

  // Landing Page para CTA
  LANDING_PAGE_URL: process.env.LANDING_PAGE_URL || 'https://artechnocode.online',

  // Perfiles de email para rotación (evitar spam)
  EMAIL_PROFILES: (process.env.EMAIL_PROFILES || '').split(',').filter(Boolean),

  // N8N Webhook (alternativo)
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,

  // Scraping
  MAX_LEADS_PER_DAY: parseInt(process.env.MAX_LEADS_PER_DAY) || 500,
  HEADLESS_MODE: process.env.HEADLESS_MODE !== 'false',

  // Server
  PORT: parseInt(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development'
};
