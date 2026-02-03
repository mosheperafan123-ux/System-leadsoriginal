const { db } = require('./src/database');

const leads = db.prepare('SELECT business_name, phone, website, email, rating FROM leads').all();
console.table(leads);
