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

        try {
            const completion = await this.openai.chat.completions.create({
                model: config.OPENAI_MODEL,
                messages: [
                    {
                        role: "system",
                        content: `Eres el Director de Estrategia de AR Technocode, una compañía de "Private Tech" (Tecnología Privada a Medida), NO una agencia de marketing ni IA genérica.

            Tu Objetivo: Filtrar y seleccionar 3 socios estratégicos en España para desarrollar su infraestructura de ventas automatizada.

            Filosofía:
            - No vendemos "chatbots". Creamos sistemas de software de propiedad privada que transforman la captación y seguimiento de pacientes.
            - Exclusividad: Solo aceptamos 3 proyectos este trimestre para garantizar calidad boutique.

            Estructura del Email (Estricta):
            Debes seguir EXACTAMENTE esta estructura y contenido.

            Asunto: Reporte de Eficiencia: Tiempos de respuesta y fuga de capital | ${lead.business_name}

            Hola, equipo de ${lead.business_name}.

            Les escribo porque he notado un patrón en su sector que Harvard Business Review llama "El Valle de la Muerte de los 5 Minutos".

            Los datos muestran que si un paciente potencial les escribe y no recibe respuesta en 5 minutos, la probabilidad de que agende con ustedes cae un 400%.

            Básicamente, si su recepción está ocupada o cerrada, le están regalando el paciente a la clínica de enfrente.

            En AR Technocode desarrollamos Infraestructura Private Tech a medida (no software genérico) que atiende, cualifica y agenda vía WhatsApp en 3 segundos, las 24 horas.

            Si quieren detener esa fuga de ingresos hoy mismo, pueden agendar una cita en nuestra pagina web con nuestro equipo:

            ${config.LANDING_PAGE_URL}

            Atentamente,

            Rafael Manrique
            Director de Tecnología AR Technocode

            Reglas:
            - NO cambies ni una palabra del cuerpo del mensaje.
            - Solo reemplaza [Nombre de la Clínica] con ${lead.business_name}.
            - El Asunto debe ser exactamente el especificado arriba.
                    },
                    {
                        role: "user",
                        content: `Redacta la invitación exclusiva para:
                            Negocio: ${ lead.business_name }
Nicho: ${ lead.category || 'Salud/Belleza' }
Ciudad: ${ lead.city || 'España' }`
                    }
                ],
                // temperature: 0.7, // Comentado porque el modelo o1 no soporta temperatura personalizada
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error(chalk.red('Error generando mensaje con IA:'), error.message);
            // CRÍTICO: Retornar null para evitar enviar emails con contenido de prueba
            return null;
        }
    }

    getMockMessage(lead) {
        // Si no hay API Key, no generar mensaje (evita enviar emails de prueba)
        console.warn(chalk.yellow(`  ⚠ No se pudo generar mensaje para ${ lead.business_name } - Sin API Key`));
        return null;
    }
}

module.exports = MessageGenerator;
