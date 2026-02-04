const Database = require('better-sqlite3');
const config = require('./config');
const path = require('path');

const db = new Database(config.DATABASE_FILE);

function initDb() {
  // Tabla de Leads
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      category TEXT,
      address TEXT,
      city TEXT,
      phone TEXT,
      website TEXT,
      rating REAL,
      reviews_count INTEGER,
      email TEXT,
      instagram_handle TEXT,
      extraction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      extraction_source TEXT DEFAULT 'google_maps',
      email_sent BOOLEAN DEFAULT 0,
      email_sent_at DATETIME,
      sender_email TEXT,
      whatsapp_sent BOOLEAN DEFAULT 0,
      whatsapp_sent_at DATETIME,
      ai_personalized_message TEXT,
      response_status TEXT DEFAULT 'none',
      response_text TEXT,
      response_date DATETIME,
      notes TEXT,
      UNIQUE(business_name, city)
    )
  `);

  // Migración segura: Agregar columna sender_email si no existe
  try {
    const columns = db.prepare("PRAGMA table_info(leads)").all();
    const hasSenderEmail = columns.some(col => col.name === 'sender_email');
    if (!hasSenderEmail) {
      console.log('Migración: Agregando columna sender_email...');
      db.prepare("ALTER TABLE leads ADD COLUMN sender_email TEXT").run();
    }
  } catch (e) {
    console.error('Error en migración:', e.message);
  }

  // Tabla de Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Base de datos inicializada correctamente.');
}

module.exports = {
  db,
  initDb
};
