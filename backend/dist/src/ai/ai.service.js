"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const documentos_service_1 = require("../documentos/documentos.service");
const ai_logs_service_1 = require("./ai-logs.service");
const configuracion_service_1 = require("../configuracion/configuracion.service");
const ROL_CONFIG = {
    administrador: {
        label: 'Administrador',
        descripcion: 'Tienes acceso completo a toda la información del sistema.',
        temasRestringidos: [],
        mensajeRestringido: '',
    },
    docente: {
        label: 'Docente',
        descripcion: 'Tienes acceso a información académica y administrativa.',
        temasRestringidos: [
            'nomina',
            'salario',
            'contrato personal',
            'datos personales de otros docentes',
        ],
        mensajeRestringido: 'Esa información es de carácter confidencial y no puedo proporcionarla. Te sugiero contactar directamente con el área administrativa.',
    },
    estudiante: {
        label: 'Estudiante',
        descripcion: 'Tienes acceso a información académica y personal.',
        temasRestringidos: [
            'pagos',
            'facturas',
            'deudas',
            'boletines',
            'notas',
            'calificaciones',
            'historial académico',
        ],
        mensajeRestringido: 'Para consultar información sobre pagos, boletines o notas, puedes acceder directamente a la plataforma institucional o dirigirte a la institución para que te brinden esa información.',
    },
    padre: {
        label: 'Padre/Madre',
        descripcion: 'Tienes acceso a información académica y de pagos de tu hijo.',
        temasRestringidos: [
            'información de otros estudiantes',
            'datos de docentes',
            'información administrativa interna',
        ],
        mensajeRestringido: 'Esa información no está disponible para consulta. Si necesitas más detalles, te sugerimos contactar directamente con la institución.',
    },
};
function normalizarRol(rol) {
    const r = (rol ?? '')
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (r.includes('admin'))
        return 'administrador';
    if (r.includes('docente') || r.includes('profesor'))
        return 'docente';
    if (r.includes('padre') || r.includes('madre') || r.includes('acudiente'))
        return 'padre';
    if (r.includes('estudiante') || r.includes('alumno'))
        return 'estudiante';
    return 'estudiante';
}
let AiService = AiService_1 = class AiService {
    config;
    documentosService;
    aiLogs;
    configuracionService;
    logger = new common_1.Logger(AiService_1.name);
    apiKey;
    apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    constructor(config, documentosService, aiLogs, configuracionService) {
        this.config = config;
        this.documentosService = documentosService;
        this.aiLogs = aiLogs;
        this.configuracionService = configuracionService;
        this.apiKey = this.config.get('GEMINI_API_KEY') ?? '';
    }
    async chat(message, history, clientName, colegio, tipoSolicitud, rol = 'estudiante') {
        if (!message?.trim())
            return {
                reply: 'Por favor escribe un mensaje.',
                transfer: false,
                showFeedback: false,
            };
        const rolNormalizado = normalizarRol(rol);
        const configDefault = ROL_CONFIG[rolNormalizado] ?? ROL_CONFIG['estudiante'];
        const msgLower = message.toLowerCase();
        const globalConfig = await this.configuracionService.getGlobal();
        const aiCfg = globalConfig.aiPromptConfig;
        const rolFromDb = aiCfg?.roles?.[rolNormalizado];
        const config = {
            ...configDefault,
            ...(rolFromDb || {}),
            temasRestringidos: rolFromDb?.temasRestringidos ?? configDefault.temasRestringidos,
            mensajeRestringido: rolFromDb?.mensajeRestringido || configDefault.mensajeRestringido,
        };
        const esRestringido = config.temasRestringidos.some((t) => msgLower.includes(t.toLowerCase()));
        if (esRestringido) {
            const msgRestringido = config.mensajeRestringido;
            this.aiLogs.guardar({
                colegio,
                rol: rolNormalizado,
                tipoSolicitud,
                clientName,
                pregunta: message,
                respuesta: msgRestringido,
                esRestringido: true,
                chunksUsados: [],
            });
            return {
                reply: msgRestringido,
                transfer: false,
                showFeedback: false,
                documentos: [],
            };
        }
        const ragResult = await this.documentosService
            .buscarRelevantes(message, colegio || undefined, rolNormalizado, 3)
            .catch(() => ({ contexto: '', documentos: [], chunks: [] }));
        const { contexto, documentos } = ragResult;
        const chunks = ragResult.chunks ?? [];
        const tieneContexto = contexto.trim().length > 0;
        this.logger.debug(`[RAG] tuvoContexto=${tieneContexto} | chunks=${chunks.length} | colegio=${colegio} | rol=${rolNormalizado}`);
        const systemPrompt = this.buildSystemPrompt(clientName, colegio, tipoSolicitud, config, contexto, tieneContexto, aiCfg);
        const historyFiltered = history.filter((h) => h?.text &&
            typeof h.text === 'string' &&
            h.text.trim().length > 0 &&
            (h.role === 'user' || h.role === 'model'));
        const contents = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            {
                role: 'model',
                parts: [
                    {
                        text: `Entendido. Estoy listo para ayudar a ${clientName} como ${config.label}.`,
                    },
                ],
            },
            ...historyFiltered.map((h) => ({
                role: h.role,
                parts: [{ text: h.text.trim() }],
            })),
            { role: 'user', parts: [{ text: message.trim() }] },
        ];
        const t0 = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey,
            },
            body: JSON.stringify({
                contents,
                generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
            }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) {
            const err = await response.text();
            this.aiLogs.guardar({
                colegio,
                rol: rolNormalizado,
                tipoSolicitud,
                clientName,
                pregunta: message,
                huboError: true,
                errorMsg: `Gemini ${response.status}: ${err}`,
                chunksUsados: [],
            });
            this.logger.error(`Gemini API error: ${response.status} - ${err}`);
            throw new Error('Error al procesar tu mensaje. Intenta de nuevo.');
        }
        const data = await response.json();
        const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
        const tiempoMs = Date.now() - t0;
        if (raw === 'TRANSFER_TO_ADVISOR') {
            this.aiLogs.guardar({
                colegio,
                rol: rolNormalizado,
                tipoSolicitud,
                clientName,
                pregunta: message,
                transfer: true,
                tiempoRespuestaMs: tiempoMs,
                chunksUsados: [],
            });
            return { reply: '', transfer: true, showFeedback: false };
        }
        const feedbackMatch = raw.match(/\[FEEDBACK:(YES|NO)\]\s*$/);
        const showFeedback = feedbackMatch?.[1] === 'YES';
        const reply = raw.replace(/\[FEEDBACK:(YES|NO)\]\s*$/, '').trim();
        const tokens = Math.round((systemPrompt.length + message.length) / 4);
        this.aiLogs.guardar({
            colegio,
            rol: rolNormalizado,
            tipoSolicitud,
            clientName,
            pregunta: message,
            respuesta: reply,
            chunksUsados: chunks.map((c) => ({
                nombre: c.nombre,
                categoria: c.categoria,
                chunkIndex: c.chunkIndex ?? 0,
                distancia: c.distancia ?? null,
                fragmento: (c.contenido ?? '').slice(0, 200),
            })),
            tuvoContexto: tieneContexto,
            tiempoRespuestaMs: tiempoMs,
            tokensEstimados: tokens,
            transfer: false,
            esRestringido: false,
        });
        const docsParaDevolver = showFeedback && tieneContexto && documentos.length > 0
            ? [documentos[0]]
            : [];
        return {
            reply: reply || 'Lo siento, no pude procesar tu consulta.',
            transfer: false,
            showFeedback,
            documentos: docsParaDevolver,
        };
    }
    async improveWhatsappDraft(draft, profile = {}) {
        const cleanDraft = this.compactText(draft, 900);
        if (!cleanDraft)
            return { reply: '' };
        const prompt = `Mejora la redaccion del siguiente borrador para enviarlo por WhatsApp a un cliente.

Reglas:
- Corrige ortografia, tildes, puntuacion, capitalizacion y errores de digitacion.
- Conserva exactamente la intencion, datos, promesas, fechas, precios, nombres y preguntas del texto original.
- No agregues informacion nueva.
- No respondas por el cliente ni inventes solucion.
- Hazlo claro, amable, profesional y natural.
- Devuelve SOLO el texto final, sin explicaciones, sin comillas, sin markdown, sin frases como "Texto mejorado:" ni ningun otro prefijo.
- Maximo 90 palabras.

Ejemplo:
Borrador: hola msi nombre es carlos andre,s
Texto mejorado: Hola, mi nombre es Carlos Andrés.

Perfil breve:
Cliente: ${this.compactText(profile.clientName, 80) || 'Cliente WhatsApp'}
Institucion: ${this.compactText(profile.institution, 90) || 'No registrada'}
Rol: ${this.compactText(profile.role, 60) || 'Cliente'}

Borrador:
${cleanDraft}`;
        const reply = await this.generateCompactText(prompt, 500, 0.2);
        return { reply: this.cleanAiPlainText(reply) || cleanDraft };
    }
    async summarizeWhatsappConversation(input) {
        const messages = (input.messages ?? [])
            .filter((message) => this.compactText(message.body, 220))
            .slice(-20)
            .map((message) => `${message.fromMe ? 'Asesor' : 'Cliente'}: ${this.compactText(message.body, 180)}`)
            .join('\n');
        if (!messages) {
            return {
                summary: 'Aun no hay mensajes suficientes para resumir esta conversacion.',
            };
        }
        const notes = (input.notes ?? [])
            .map((note) => this.compactText(note, 120))
            .filter(Boolean)
            .slice(0, 3)
            .join(' | ');
        const prompt = `Resume para un asesor una conversacion de WhatsApp usando solo la informacion dada.

Reglas:
- Maximo 70 palabras.
- Un solo parrafo.
- Menciona: situacion actual, necesidad del cliente y siguiente paso sugerido.
- Relaciona el resumen con el perfil si aporta contexto.
- No inventes datos.
- Sin markdown, sin emojis, sin saludo.

Perfil:
Nombre: ${this.compactText(input.clientName, 80) || 'Cliente WhatsApp'}
Rol: ${this.compactText(input.role, 60) || 'No registrado'}
Institucion: ${this.compactText(input.institution, 90) || 'No registrada'}
Ciudad: ${this.compactText(input.city, 60) || 'No registrada'}
Telefono: ${this.compactText(input.phone, 40) || 'No registrado'}
Notas internas: ${notes || 'Sin notas'}

Ultimos mensajes:
${messages}`;
        const summary = await this.generateCompactText(prompt, 200, 0.1);
        return {
            summary: this.cleanAiPlainText(summary) ||
                'No se pudo generar un resumen claro.',
        };
    }
    async chatStream(message, history, clientName, colegio, tipoSolicitud, rol, emit) {
        const rolNormalizado = normalizarRol(rol);
        const configDefault = ROL_CONFIG[rolNormalizado] ?? ROL_CONFIG['estudiante'];
        const msgLower = message.toLowerCase();
        const globalConfig = await this.configuracionService.getGlobal();
        const aiCfg = globalConfig.aiPromptConfig;
        const rolFromDb = aiCfg?.roles?.[rolNormalizado];
        const config = {
            ...configDefault,
            ...(rolFromDb || {}),
            temasRestringidos: rolFromDb?.temasRestringidos ?? configDefault.temasRestringidos,
            mensajeRestringido: rolFromDb?.mensajeRestringido || configDefault.mensajeRestringido,
        };
        const esRestringido = config.temasRestringidos.some((t) => msgLower.includes(t.toLowerCase()));
        if (esRestringido) {
            const msgRestringido = config.mensajeRestringido;
            this.aiLogs.guardar({
                colegio,
                rol: rolNormalizado,
                tipoSolicitud,
                clientName,
                pregunta: message,
                respuesta: msgRestringido,
                esRestringido: true,
                chunksUsados: [],
            });
            emit('chunk', { text: msgRestringido });
            return;
        }
        const ragResult = await this.documentosService
            .buscarRelevantes(message, colegio || undefined, rolNormalizado, 3)
            .catch(() => ({ contexto: '', documentos: [], chunks: [] }));
        const { contexto, documentos } = ragResult;
        const chunks = ragResult.chunks ?? [];
        const tieneContexto = contexto.trim().length > 0;
        this.logger.debug(`[RAG] tuvoContexto=${tieneContexto} | chunks=${chunks.length} | colegio=${colegio} | rol=${rolNormalizado}`);
        const systemPrompt = this.buildSystemPrompt(clientName, colegio, tipoSolicitud, config, contexto, tieneContexto, aiCfg);
        const historyFiltered = history.filter((h) => h?.text?.trim() && (h.role === 'user' || h.role === 'model'));
        const contents = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            {
                role: 'model',
                parts: [{ text: `Entendido. Listo para ayudar a ${clientName}.` }],
            },
            ...historyFiltered.map((h) => ({
                role: h.role,
                parts: [{ text: h.text.trim() }],
            })),
            { role: 'user', parts: [{ text: message.trim() }] },
        ];
        const t0 = Date.now();
        const streamUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent' +
            '?alt=sse';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey,
            },
            body: JSON.stringify({
                contents,
                generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
            }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) {
            const err = await response.text();
            this.aiLogs.guardar({
                colegio,
                rol: rolNormalizado,
                tipoSolicitud,
                clientName,
                pregunta: message,
                huboError: true,
                errorMsg: `Gemini stream ${response.status}`,
                chunksUsados: [],
            });
            this.logger.error(`Gemini stream error: ${response.status} - ${err}`);
            throw new Error('Error al procesar tu mensaje. Intenta de nuevo.');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let textoAcumulado = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.startsWith('data: '))
                    continue;
                const json = line.slice(6).trim();
                if (!json || json === '[DONE]')
                    continue;
                try {
                    const parsed = JSON.parse(json);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                    if (text) {
                        textoAcumulado += text;
                        emit('chunk', { text });
                    }
                }
                catch {
                }
            }
        }
        const respondioAlgo = textoAcumulado.includes('[FEEDBACK:YES]');
        if (respondioAlgo && tieneContexto && documentos.length > 0) {
            emit('metadata', {
                documentos: [
                    {
                        nombre: documentos[0].nombre,
                        pdfUrl: documentos[0].pdfUrl,
                        categoria: documentos[0].categoria,
                    },
                ],
            });
        }
        this.aiLogs.guardar({
            colegio,
            rol: rolNormalizado,
            tipoSolicitud,
            clientName,
            pregunta: message,
            respuesta: textoAcumulado,
            chunksUsados: chunks.map((c) => ({
                nombre: c.nombre,
                categoria: c.categoria,
                chunkIndex: c.chunkIndex ?? 0,
                distancia: c.distancia ?? null,
                fragmento: (c.contenido ?? '').slice(0, 200),
            })),
            tuvoContexto: tieneContexto,
            tiempoRespuestaMs: Date.now() - t0,
            tokensEstimados: Math.round((systemPrompt.length + message.length) / 4),
        });
    }
    async generateCompactText(prompt, maxOutputTokens, temperature) {
        if (!this.apiKey)
            throw new Error('GEMINI_API_KEY no esta configurada');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey,
                },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature, maxOutputTokens },
                }),
            });
            if (!response.ok) {
                const err = await response.text();
                this.logger.error(`Gemini API error: ${response.status} - ${err}`);
                throw new Error('Error al procesar tu mensaje. Intenta de nuevo.');
            }
            const data = await response.json();
            const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
            const finishReason = data.candidates?.[0]?.finishReason;
            const usage = data.usageMetadata;
            if (usage) {
                this.logger.log(`Gemini: finishReason=${finishReason} outputTokens=${usage.candidatesTokenCount ?? '?'} totalTokens=${usage.totalTokenCount ?? '?'}`);
            }
            if (finishReason === 'MAX_TOKENS') {
                this.logger.warn(`Gemini truncado (MAX_TOKENS, ${text.length} chars). Devolviendo borrador original.`);
                return '';
            }
            return text;
        }
        catch (err) {
            if (err?.name === 'AbortError') {
                throw new Error('Gemini no respondio a tiempo. Intenta de nuevo.');
            }
            throw err;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    compactText(value, maxLength) {
        const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
        return clean.length > maxLength
            ? `${clean.slice(0, maxLength).trim()}...`
            : clean;
    }
    cleanAiPlainText(value) {
        return value
            .replace(/\[FEEDBACK:(YES|NO)\]/gi, '')
            .replace(/^["'`]+|["'`]+$/g, '')
            .trim();
    }
    buildSystemPrompt(clientName, colegio, tipoSolicitud, config, contexto, tieneContexto, aiPromptConfig) {
        if (aiPromptConfig?.promptPersonalizado) {
            let prompt = aiPromptConfig.promptPersonalizado;
            prompt = prompt.replace(/\{\{CLIENT_NAME\}\}/g, clientName);
            prompt = prompt.replace(/\{\{COLEGIO\}\}/g, colegio);
            prompt = prompt.replace(/\{\{ROL\}\}/g, config.label);
            prompt = prompt.replace(/\{\{DESCRIPCION_ROL\}\}/g, config.descripcion);
            prompt = prompt.replace(/\{\{MOTIVO\}\}/g, tipoSolicitud);
            prompt = prompt.replace(/\{\{TEMAS_RESTRINGIDOS\}\}/g, config.temasRestringidos.join(', '));
            prompt = prompt.replace(/\{\{MENSAJE_RESTRINGIDO\}\}/g, config.mensajeRestringido || '');
            if (tieneContexto) {
                prompt = prompt.replace(/\{\{CONTEXTO_RAG\}\}/g, `INFORMACIÓN DE LA BASE DE CONOCIMIENTO:\n${contexto}\nFIN DE LA BASE DE CONOCIMIENTO.`);
            }
            else {
                prompt = prompt.replace(/\{\{CONTEXTO_RAG\}\}/g, '');
            }
            return prompt;
        }
        const nombre = aiPromptConfig?.nombreAsistente || 'asistente virtual de atención al cliente';
        const especialidad = aiPromptConfig?.especialidad || 'colegios';
        const instrucciones = aiPromptConfig?.instruccionesGenerales ||
            'Responde de forma clara, amable y concisa en español. NO uses emojis. Adapta el lenguaje al rol: técnico para administradores/docentes, sencillo para estudiantes y padres.';
        const frasesTransferencia = aiPromptConfig?.frasesTransferencia?.length
            ? aiPromptConfig.frasesTransferencia.join('", "')
            : 'asesor", "humano", "persona", "agente';
        const feedbackReglas = aiPromptConfig?.feedbackPositivo ||
            'SOLO si resolviste completamente una pregunta real y concreta';
        const partes = [];
        partes.push(`Eres un/a ${nombre} especializado en ${especialidad}.`, `Estás atendiendo a ${clientName}, quien tiene el rol de ${config.label} en el colegio "${colegio}".`, `El motivo de su consulta es: ${tipoSolicitud}.`, '', 'PERFIL DEL USUARIO:', `- Rol: ${config.label}`, `- ${config.descripcion}`);
        if (config.temasRestringidos.length > 0) {
            partes.push(`- Temas que NO debes responder para este rol: ${config.temasRestringidos.join(', ')}.`, `  Si preguntan sobre estos temas, responde: "${config.mensajeRestringido}"`);
        }
        else {
            partes.push('- Tiene acceso completo a toda la información disponible.');
        }
        if (tieneContexto) {
            partes.push('', 'INFORMACIÓN DE LA BASE DE CONOCIMIENTO:', 'La siguiente información proviene de documentos oficiales del sistema.', 'Úsala para responder con precisión. NO inventes información que no esté aquí.', '', contexto, '', 'FIN DE LA BASE DE CONOCIMIENTO.');
        }
        partes.push('', 'Reglas importantes:', `- ${instrucciones}`, `- NO uses emojis en ninguna respuesta.`, tieneContexto
            ? '- Basa tu respuesta PRINCIPALMENTE en la información de la base de conocimiento.'
            : '- Responde con información general disponible.', `- Si el cliente menciona "${frasesTransferencia}" o pide hablar con alguien, responde ÚNICAMENTE: TRANSFER_TO_ADVISOR`, `- Si la pregunta toca temas restringidos para el rol ${config.label}, redirige amablemente.`, '', '────────────────────────────────────────', 'CONTROL DE FEEDBACK', '────────────────────────────────────────', `Usa [FEEDBACK:YES] ${feedbackReglas}.`, 'Usa [FEEDBACK:NO] en cualquier otro caso (saludos, ambigüedades, redirects, etc).', 'Agrega SIEMPRE al final exactamente uno: [FEEDBACK:YES] o [FEEDBACK:NO]');
        return partes.join('\n');
    }
    getApiKey() {
        return this.apiKey;
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        documentos_service_1.DocumentosService,
        ai_logs_service_1.AiLogsService,
        configuracion_service_1.ConfiguracionService])
], AiService);
//# sourceMappingURL=ai.service.js.map