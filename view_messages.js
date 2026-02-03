const { db } = require('./src/database');
const chalk = require('chalk');

const leads = db.prepare('SELECT business_name, ai_personalized_message FROM leads WHERE ai_personalized_message IS NOT NULL').all();

console.log(chalk.bold('--- Mensajes Generados ---'));
leads.forEach(l => {
    console.log(chalk.cyan(`\n[${l.business_name}]`));
    console.log(l.ai_personalized_message);
    console.log(chalk.gray('-'.repeat(50)));
});
