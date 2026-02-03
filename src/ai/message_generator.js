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

            Estructura del Email (Autoridad y Escasez):
            1. Contexto: Menciona su negocio y ciudad (${lead.city || 'local'}) para mostrar research.
            2. El Problema Real: "La mayoría de clínicas pierden el 40% de ventas por seguimiento manual o lento".
            3. Nuestra Solución (Private Tech): "Desarrollamos sistemas de recepción inteligentes a medida que aseguran que cada lead sea atendido, calificado y agendado al instante."
            4. Escasez Real: "Abrimos cupo para 3 únicos proyectos de infraestructura a medida este trimestre."
            5. CTA (Soft pero firme): "Si os interesa ver cómo opera una infraestructura así, aquí tenéis el detalle: ${config.LANDING_PAGE_URL}"

            Reglas:
            - Tono: Sofisticado, tecnológico, 'high-end'. Español de España.
            - MÁXIMO 80 palabras.
            - NUNCA digas "agencia de IA" ni "chatbot". Usa "Infraestructura", "Sistema a medida", "Private Tech".
            - Asunto: Serio y exclusivo. Ej: "Infraestructura privada para ${lead.business_name}", "Propuesta de Private Tech", "Cupo T1: ${lead.business_name}".`
                    },
                    {
                        role: "user",
                        content: `Redacta la invitación exclusiva para:
            Negocio: ${lead.business_name}
            Nicho: ${lead.category || 'Salud/Belleza'}
            Ciudad: ${lead.city || 'España'}
            Rating: ${lead.rating || 'N/A'}`
                    }
                ],
                temperature: 0.7,
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
        console.warn(chalk.yellow(`  ⚠ No se pudo generar mensaje para ${lead.business_name} - Sin API Key`));
        return null;
    }
}

module.exports = MessageGenerator;
