const OpenAI = require('openai');
const config = require('../config');
const chalk = require('chalk');

class MessageGenerator {
    constructor() {
        this.openai = null;
        if (config.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: config.OPENAI_API_KEY,
                baseURL: config.OPENAI_BASE_URL
            });
        } else {
            console.warn(chalk.yellow('⚠ API Key de OpenAI no configurada. Los mensajes serán simulados.'));
        }
    }

    async generateMessage(lead) {
        if (!this.openai) {
            return this.getMockMessage(lead);
        }

        // Determinar tipo de saludo según categoría
        // Determinar tipo de saludo según categoría
        let tipoNegocio = 'Negocio'; // Default más seguro
        const cat = (lead.category || '').toLowerCase();

        if (cat.includes('dental') || cat.includes('odonto') || cat.includes('dentista')) {
            tipoNegocio = 'Clínica Dental';
        } else if (cat.includes('salón') || cat.includes('salon') || cat.includes('peluquería') || cat.includes('peluqueria') || cat.includes('barbe')) {
            tipoNegocio = 'Salón de Belleza';
        } else if (cat.includes('estética') || cat.includes('estetica') || cat.includes('belleza') || cat.includes('spa')) {
            tipoNegocio = 'Centro de Estética';
        } else if (cat.includes('clínica') || cat.includes('clinica')) {
            tipoNegocio = 'Clínica';
        }

        const emailTemplate = `Asunto: Reporte de Ineficiencia Operativa y Fuga de Capital | ${lead.business_name}

Hola, equipo de ${tipoNegocio} ${lead.business_name}.

Les escribo porque hemos analizado los protocolos de atención en su sector y detectado tres puntos críticos que están drenando su facturación diaria:

1. Latencia de Respuesta: Su recepción tarda minutos (u horas) en contestar WhatsApps.
   - La Consecuencia: El paciente ansioso escribe a la siguiente clínica de la lista y cierra la cita allí.

2. Horario Limitado: Su negocio cierra a las 6:00 PM, pero la demanda no.
   - La Consecuencia: Pierden el 45% de las solicitudes que llegan de noche o fines de semana.

3. Seguimiento Manual: Dependen de la memoria humana para reactivar pacientes antiguos.
   - La Consecuencia: Miles de dólares en tratamientos se quedan "en el aire" por falta de insistencia.

No existe capacidad humana al nivel de nuestros sistemas.

Esto no es una opinión, es estadística. Harvard Business Review confirma que si un lead no se atiende en 5 minutos, la probabilidad de cierre cae un 400%.

En AR Technocode desarrollamos Infraestructura Private Tech que elimina este problema de raíz: atiende, cualifica y agenda en 3 segundos, las 24 horas, sin errores y sin descanso.

Si quieren detener esa fuga de ingresos hoy mismo, vean la demostración técnica aquí:

https://artechnocode.online/

Atentamente,

Rafael Manrique
Director de Tecnología AR Technocode`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: config.OPENAI_MODEL,
                messages: [
                    {
                        role: "system",
                        content: `Eres Rafael Manrique, Director de Tecnología de AR Technocode.
Tu única tarea es devolver EXACTAMENTE el mensaje que se te proporciona, sin cambiar NI UNA SOLA PALABRA.
No agregues saludos extra, no cambies formato, no inventes nada.
Solo devuelve el mensaje tal cual.`
                    },
                    {
                        role: "user",
                        content: `Devuelve este mensaje exactamente como está, sin modificaciones:\n\n${emailTemplate}`
                    }
                ],
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error(chalk.red('Error generando mensaje con IA:'), error.message);
            // Si falla la IA, usar el template directamente
            return emailTemplate;
        }
    }

    getMockMessage(lead) {
        // Si no hay API Key, no generar mensaje (evita enviar emails de prueba)
        console.warn(chalk.yellow(`  ⚠ No se pudo generar mensaje para ${lead.business_name} - Sin API Key`));
        return null;
    }
}

module.exports = MessageGenerator;
