import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentosService } from '../documentos/documentos.service';
import { AiLogsService } from './ai-logs.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';

export interface AiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiResult {
  reply: string;
  transfer: boolean;
  showFeedback: boolean;
  documentos?: {
    nombre: string;
    pdfUrl: string | null;
    categoria: string | null;
  }[];
}

export interface WhatsappSummaryMessage {
  fromMe: boolean;
  body: string;
  time?: string | number;
}

const ROL_CONFIG: Record<
  string,
  {
    label: string;
    descripcion: string;
    temasRestringidos: string[];
    mensajeRestringido: string;
  }
> = {
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
    mensajeRestringido:
      'Esa información es de carácter confidencial y no puedo proporcionarla. Te sugiero contactar directamente con el área administrativa.',
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
    mensajeRestringido:
      'Para consultar información sobre pagos, boletines o notas, puedes acceder directamente a la plataforma institucional o dirigirte a la institución para que te brinden esa información.',
  },
  padre: {
    label: 'Padre/Madre',
    descripcion: 'Tienes acceso a información académica y de pagos de tu hijo.',
    temasRestringidos: [
      'información de otros estudiantes',
      'datos de docentes',
      'información administrativa interna',
    ],
    mensajeRestringido:
      'Esa información no está disponible para consulta. Si necesitas más detalles, te sugerimos contactar directamente con la institución.',
  },
};

function normalizarRol(rol: string): string {
  const r = (rol ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Seguridad: el chat público es anónimo y el rol lo auto-reporta el cliente.
  // El rol 'admin/administrador' da acceso a documentos con acceso completo, por
  // lo que NO se reconoce para sesiones públicas (siempre cae a 'estudiante').
  if (r.includes('admin') || r.includes('administrador')) return 'estudiante';
  if (r.includes('docente') || r.includes('profesor')) return 'docente';
  if (r.includes('padre') || r.includes('madre') || r.includes('acudiente'))
    return 'padre';
  if (r.includes('estudiante') || r.includes('alumno')) return 'estudiante';
  return 'estudiante';
}

// Coincidencia de temas restringidos con límites de palabra (evita que "pago"
// pegue dentro de "pagar", o "notas" dentro de "notasales", etc.).
function coincideTema(mensaje: string, tema: string): boolean {
  const msg = normalizarTexto(mensaje);
  const t = normalizarTexto(tema);
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i').test(msg);
}

const MAX_HISTORY_MESSAGES = 20; // ~10 turnos cliente↔IA hacia Gemini

function filtrarHistorial(history: AiMessage[]): AiMessage[] {
  const validos = (history ?? []).filter(
    (h) =>
      h?.text &&
      typeof h.text === 'string' &&
      h.text.trim().length > 0 &&
      (h.role === 'user' || h.role === 'model'),
  );
  return validos.slice(-MAX_HISTORY_MESSAGES);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDUCTA — configuración por defecto (overridable desde aiPromptConfig)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_PALABRAS_PROHIBIDAS: string[] = [
  'hijueputa',
  'hijo de puta',
  'hija de puta',
  'gonorrea',
  'malparido',
  'malparida',
  'mal parto',
  'carechimba',
  'careverga',
  'careculo',
  'verga',
  'marica',
  'maricon',
  'pendejo',
  'pendeja',
  'idiota',
  'estupido',
  'estupida',
  'imbecil',
  'retrasado',
  'retrasada',
  'perra',
  'puta',
  'puto',
  'putazo',
  'mierda',
  'carajo',
  'coño',
  'weon',
  'weona',
  'webon',
  'tarado',
  'tarada',
  'inutil',
  'mamahuevo',
  'mamaguevo',
  'mamaguevo',
  'culo',
  'pija',
  'cabron',
  'cabrona',
  'zorra',
  'soplapollas',
  'gilipollas',
  'pelotudo',
  'pelotuda',
  'mogolico',
  'pajero',
  'tonto',
  'estupidazo',
];

const DEFAULT_MENSAJE_GROSERIA =
  'Por favor, mantengamos un trato respetuoso. No puedo ayudarte si usas lenguaje ofensivo. ¿En qué más puedo ayudarte?';

const DEFAULT_MENSAJE_SESION_TERMINADA =
  'Esta conversación ha sido finalizada por el uso continuado de lenguaje ofensivo. Si necesitas ayuda, inicia una nueva conversación manteniendo un trato respetuoso.';

const DEFAULT_MENSAJE_SIN_INFORMACION =
  'No tengo información registrada sobre eso por el momento. ¿Necesitas un agente para una mejor ayuda?';

const SALUDOS: string[] = [
  'hola',
  'buen dia',
  'buenos dias',
  'buenas tardes',
  'buenas noches',
  'buenas',
  'saludos',
  'que tal',
  'hey',
  'que mas',
  'holi',
  'hello',
  'hi',
  'como estas',
  'como estas?',
  'bienvenido',
  'gracias',
  'muchas gracias',
];

function normalizarTexto(texto: string): string {
  return (texto ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esSaludo(mensaje: string): boolean {
  const m = normalizarTexto(mensaje).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!m) return false;
  if (m.length > 40) return false;
  return SALUDOS.some((s) => m.includes(s));
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly apiUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private config: ConfigService,
    private documentosService: DocumentosService,
    private aiLogs: AiLogsService,
    private configuracionService: ConfiguracionService,
  ) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
  }

  // Contador de ofensas por sesión (en memoria; se reinicia al reiniciar el contenedor)
  private readonly contadorOfensas = new Map<string, number>();

  // ── Cargar configuración de conducta (con defaults) ──────────────────────
  private cargarConducta(aiCfg?: Record<string, any> | null) {
    return {
      palabrasProhibidas: Array.isArray(aiCfg?.palabrasProhibidas)
        ? (aiCfg!.palabrasProhibidas as string[]).filter(Boolean)
        : DEFAULT_PALABRAS_PROHIBIDAS,
      mensajeGroseria:
        (aiCfg?.mensajeGroseria as string)?.trim() || DEFAULT_MENSAJE_GROSERIA,
      mensajeSesionTerminada:
        (aiCfg?.mensajeSesionTerminada as string)?.trim() ||
        DEFAULT_MENSAJE_SESION_TERMINADA,
      mensajeSinInformacion:
        (aiCfg?.mensajeSinInformacion as string)?.trim() ||
        DEFAULT_MENSAJE_SIN_INFORMACION,
      limiteGroserias: Math.max(
        1,
        Number(aiCfg?.limiteGroserias) || 3,
      ),
      sugerirAsesorAutomatico: (aiCfg?.sugerirAsesorAutomatico as boolean) !== false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // chat() — respuesta completa
  // ─────────────────────────────────────────────────────────────────────────
  async chat(
    message: string,
    history: AiMessage[],
    clientName: string,
    colegio: string,
    tipoSolicitud: string,
    rol: string = 'estudiante',
  ): Promise<AiResult> {
    if (!message?.trim())
      return {
        reply: 'Por favor escribe un mensaje.',
        transfer: false,
        showFeedback: false,
      };

    const rolNormalizado = normalizarRol(rol);
    const configDefault = ROL_CONFIG[rolNormalizado] ?? ROL_CONFIG['estudiante'];
    const msgLower = message.toLowerCase();

    // ── Cargar config IA de DB ───────────────────────────────────────────────
    const globalConfig = await this.configuracionService.getGlobal();
    const aiCfg = (globalConfig as any).aiPromptConfig;

    // ── Merge: DB roles override hardcoded defaults ──────────────────────────
    const rolFromDb = aiCfg?.roles?.[rolNormalizado];
    const config = {
      ...configDefault,
      ...(rolFromDb || {}),
      temasRestringidos: rolFromDb?.temasRestringidos ?? configDefault.temasRestringidos,
      mensajeRestringido: rolFromDb?.mensajeRestringido || configDefault.mensajeRestringido,
    };

    // ── Conducta (palabras prohibidas / avisos / límites) ───────────────────
    const conducta = this.cargarConducta(aiCfg);

    // ── D1: groserías → aviso (endpoint legacy sin sesión, siempre avisa) ──
    const ofensa = conducta.palabrasProhibidas.some((w) =>
      normalizarTexto(message).includes(normalizarTexto(w)),
    );
    if (ofensa) {
      this.aiLogs.guardar({
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta: conducta.mensajeGroseria,
        esOfensivo: true,
        chunksUsados: [],
      });
      this.logger.warn(`[IA] Ofensa detectada (legacy) | rol=${rolNormalizado}`);
      return {
        reply: conducta.mensajeGroseria,
        transfer: false,
        showFeedback: false,
        documentos: [],
      };
    }

    // ── D2: saludos / cortesías → respuesta breve sin asesor ────────────────
    if (esSaludo(message)) {
      const saludo = `¡Hola ${clientName}! Soy el asistente virtual del colegio "${colegio}". ¿En qué puedo ayudarte hoy?`;
      this.aiLogs.guardar({
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta: saludo,
        chunksUsados: [],
      });
      return { reply: saludo, transfer: false, showFeedback: false, documentos: [] };
    }

    // ── Tema restringido ────────────────────────────────────────────────────
    const esRestringido = config.temasRestringidos.some((t) =>
      coincideTema(msgLower, t),
    );
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

    // ── RAG ─────────────────────────────────────────────────────────────────
    const ragResult = await this.documentosService
      .buscarRelevantes(message, colegio || undefined, rolNormalizado, 5)
      .catch(() => ({ contexto: '', documentos: [], chunks: [] }));

    const { contexto, documentos } = ragResult;
    const chunks = (ragResult as any).chunks ?? [];
    const tieneContexto = contexto.trim().length > 0;

    this.logger.debug(
      `[RAG] tuvoContexto=${tieneContexto} | chunks=${chunks.length} | colegio=${colegio} | rol=${rolNormalizado}`,
    );

    // ── D2: sin documentos del rol → no inventar, sugerir asesor ────────────
    if (!tieneContexto && conducta.sugerirAsesorAutomatico) {
      this.aiLogs.guardar({
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta: conducta.mensajeSinInformacion,
        chunksUsados: [],
        tuvoContexto: false,
      });
      return {
        reply: conducta.mensajeSinInformacion,
        transfer: false,
        showFeedback: false,
        documentos: [],
      };
    }

    const systemPrompt = this.buildSystemPrompt(
      clientName,
      colegio,
      tipoSolicitud,
      config,
      contexto,
      tieneContexto,
      aiCfg,
    );

    const historyFiltered = filtrarHistorial(history);

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
    let raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    const finishReason: string | undefined = data.candidates?.[0]?.finishReason;
    const tiempoMs = Date.now() - t0;

    if (finishReason === 'MAX_TOKENS') {
      this.logger.warn(
        `Gemini truncado por MAX_TOKENS en chat() (${raw.length} chars)`,
      );
      raw = `${raw}\n\n(La respuesta se cortó por extensión; intenta reformular tu pregunta.)`;
    }

    // ── Transfer ─────────────────────────────────────────────────────────────
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
      chunksUsados: chunks.map((c: any) => ({
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

    // Solo devolver el documento más relevante (ya viene ordenado por distancia)
    // y solo si la IA realmente respondió algo concreto
    const docsParaDevolver =
      showFeedback && tieneContexto && documentos.length > 0
        ? [documentos[0]]
        : [];

    return {
      reply: reply || 'Lo siento, no pude procesar tu consulta.',
      transfer: false,
      showFeedback,
      documentos: docsParaDevolver,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // chatStream() — respuesta en tiempo real via SSE
  // ─────────────────────────────────────────────────────────────────────────
  async improveWhatsappDraft(
    draft: string,
    profile: { clientName?: string; institution?: string; role?: string } = {},
    tone: string = 'formal',
  ): Promise<{ replies: string[] }> {
    const cleanDraft = this.compactText(draft, 900);
    if (!cleanDraft) return { replies: [] };

    const toneRules: Record<string, string> = {
      formal:   'Tono FORMAL: serio, institucional y profesional; trata al cliente de usted y evita expresiones coloquiales.',
      educado:  'Tono EDUCADO: amable, cortes y respetuoso; demuestra consideracion por el cliente.',
      directo:  'Tono DIRECTO: claro, conciso y sin rodeos; va al punto sin perder la amabilidad.',
    };

    const prompt = `Mejora la redaccion del siguiente borrador para enviarlo por WhatsApp a un cliente y genera 3 variantes distintas.

Reglas por variante:
- Corrige ortografia, tildes, puntuacion, capitalizacion y errores de digitacion.
- Conserva exactamente la intencion, datos, promesas, fechas, precios, nombres y preguntas del texto original.
- No agregues informacion nueva.
- No respondas por el cliente ni inventes solucion.
- ${toneRules[tone] ?? toneRules.formal}
- Hazlo claro, amable, profesional y natural.
- Maximo 90 palabras.

Formato de salida: EXACTAMENTE 3 bloques, cada uno encabezado por una linea de solo "=" (sin texto adyacente), seguida de "VARIANTE N", un salto de linea y el texto de esa variante:

=====
VARIANTE 1
(texto de la variante 1)

=====
VARIANTE 2
(texto de la variante 2)

=====
VARIANTE 3
(texto de la variante 3)

Las 3 variantes deben ser realmente distintas entre si: cambia la estructura, el orden de la informacion, el saludo o la forma de expresion, pero manteniendo el mismo tono, el mismo contenido y la misma longitud aproximada.
Dentro de cada bloque usa SOLO el texto, sin comillas, sin markdown, sin prefijos como "Texto mejorado:" ni ninguna otra etiqueta.

Perfil breve:
Cliente: ${this.compactText(profile.clientName, 80) || 'Cliente WhatsApp'}
Institucion: ${this.compactText(profile.institution, 90) || 'No registrada'}
Rol: ${this.compactText(profile.role, 60) || 'Cliente'}

Borrador:
${cleanDraft}`;

    const raw = this.cleanAiPlainText(
      await this.generateCompactText(prompt, 1400, 0.8),
    );
    const replies = this.splitImproveVariants(raw);
    return { replies: replies.length ? replies : [raw || cleanDraft] };
  }

  private splitImproveVariants(text: string): string[] {
    return text
      .split(/={3,}/)
      .map((block) =>
        block
          .replace(/^\s*VARIANTE\s*\d+\s*:?\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((block) => block.length > 0)
      .slice(0, 3);
  }

  async summarizeWhatsappConversation(input: {
    clientName?: string;
    institution?: string;
    role?: string;
    city?: string;
    phone?: string;
    notes?: string[];
    messages?: WhatsappSummaryMessage[];
  }): Promise<{ summary: string }> {
    const raw = (input.messages ?? [])
      .filter((message) => this.compactText(message.body, 220))
      .slice(0, 1000);

    if (!raw.length) {
      return {
        summary:
          '**Metadatos:** Sin mensajes\n**De que trata:** Aun no hay mensajes suficientes para analizar esta conversacion.',
      };
    }

    const lines = raw.map(
      (message) =>
        `${message.fromMe ? 'Asesor' : 'Cliente'}: ${this.compactText(message.body, 150)}`,
    );
    const transcript = lines.join('\n');

    const notes = (input.notes ?? [])
      .map((note) => this.compactText(note, 120))
      .filter(Boolean)
      .slice(0, 3)
      .join(' | ');

    const metrics = this.conversationMetrics(raw);

    const prompt = `Eres un analista de atencion al cliente. Analiza la CONVERSACION COMPLETA (desde el primer mensaje "hola" hasta el ultimo) y entrega un analisis util para un asesor.

Reglas:
- Usa SOLO la informacion dada; no inventes datos.
- Secciones: usa EXACTAMENTE estas etiquetas, una por linea, en este orden:
**De que trata:** tema central en 1 linea
**Situacion actual:** donde quedo la conversacion, 1-2 lineas
**Necesidad del cliente:** que quiere o necesita el cliente, 1-2 lineas
**Actitud del cliente:** como se siente (urgente, tranquilo, molesto, satisfecho...), 1 linea
**Siguiente paso sugerido:** accion concreta que recomiendas al asesor, 1-2 lineas
**Datos clave:** fechas, precios, promesas, nombres o datos importantes, separados por comas, 1 linea
- Devuelve SOLO las secciones, sin introduccion ni despedida.
- Cada seccion en una sola linea: comienza con "**" y la etiqueta, luego ":** " y el contenido.
- Si una seccion no aplica, escribe "No se indica".

Metadatos de la conversacion:
${metrics}

Perfil:
Nombre: ${this.compactText(input.clientName, 80) || 'Cliente WhatsApp'}
Rol: ${this.compactText(input.role, 60) || 'No registrado'}
Institucion: ${this.compactText(input.institution, 90) || 'No registrada'}
Ciudad: ${this.compactText(input.city, 60) || 'No registrada'}
Telefono: ${this.compactText(input.phone, 40) || 'No registrado'}
Notas internas: ${notes || 'Sin notas'}

Conversacion completa:
${transcript}`;

    const summary = await this.generateCompactText(prompt, 400, 0.1);
    const clean = this.cleanAiPlainText(summary);
    return {
      summary:
        `**Metadatos:** ${metrics}\n` +
        (clean || '**De que trata:** No se pudo generar un analisis claro.'),
    };
  }

  private conversationMetrics(
    messages: WhatsappSummaryMessage[],
  ): string {
    const total = messages.length;
    const firstSender = messages[0]?.fromMe ? 'Asesor' : 'Cliente';
    const times = messages
      .map((m) => this.toDate(m.time))
      .filter((d): d is Date => !!d && !isNaN(d.getTime()));
    let duracion = '';
    if (times.length >= 2) {
      const first = times[0].getTime();
      const last = times[times.length - 1].getTime();
      duracion = this.formatDuration(last - first);
    }
    const parts = [`${total} mensajes`];
    if (duracion) parts.push(`Duracion: ${duracion}`);
    parts.push(`Inicio: ${firstSender}`);
    return parts.join(' | ');
  }

  private toDate(value: unknown): Date | null {
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private formatDuration(ms: number): string {
    const totalMin = Math.max(1, Math.round(ms / 60000));
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const parts: string[] = [];
    if (days) parts.push(`${days} d`);
    if (hours) parts.push(`${hours} h`);
    parts.push(`${mins} min`);
    return parts.join(' ');
  }

  async chatStream(
    message: string,
    history: AiMessage[],
    clientName: string,
    colegio: string,
    tipoSolicitud: string,
    rol: string,
    emit: (event: string, data: object) => void,
    sessionId?: string,
    _welcome?: string,
    signal?: AbortSignal,
    onPartial?: (texto: string) => void,
  ): Promise<string> {
    const rolNormalizado = normalizarRol(rol);
    const configDefault = ROL_CONFIG[rolNormalizado] ?? ROL_CONFIG['estudiante'];
    const msgLower = message.toLowerCase();

    // ── Cargar config IA de DB ───────────────────────────────────────────────
    const globalConfig = await this.configuracionService.getGlobal();
    const aiCfg = (globalConfig as any).aiPromptConfig;

    // ── Merge: DB roles override hardcoded defaults ──────────────────────────
    const rolFromDb = aiCfg?.roles?.[rolNormalizado];
    const config = {
      ...configDefault,
      ...(rolFromDb || {}),
      temasRestringidos: rolFromDb?.temasRestringidos ?? configDefault.temasRestringidos,
      mensajeRestringido: rolFromDb?.mensajeRestringido || configDefault.mensajeRestringido,
    };

    // ── Conducta (palabras prohibidas / avisos / límites) ───────────────────
    const conducta = this.cargarConducta(aiCfg);

    // ── D1: groserías → aviso (1ª/2ª) o cierre de sesión (3ª) ───────────────
    const ofensa = conducta.palabrasProhibidas.some((w) =>
      normalizarTexto(message).includes(normalizarTexto(w)),
    );
    if (ofensa) {
      const key = sessionId ?? '';
      const contador = (this.contadorOfensas.get(key) ?? 0) + 1;
      if (key) this.contadorOfensas.set(key, contador);
      const terminar = contador >= conducta.limiteGroserias;
      if (terminar && key) this.contadorOfensas.delete(key);

      this.aiLogs.guardar({
        sessionId,
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta: terminar
          ? conducta.mensajeSesionTerminada
          : conducta.mensajeGroseria,
        esOfensivo: true,
        chunksUsados: [],
      });
      this.logger.warn(
        `[IA] Ofensa detectada sesión=${key || 'anónima'} (${contador}/${conducta.limiteGroserias})`,
      );

      if (terminar) {
        emit('chunk', { text: conducta.mensajeSesionTerminada });
        return `${conducta.mensajeSesionTerminada}\nSESSION_TERMINATED`;
      }
      emit('chunk', { text: conducta.mensajeGroseria });
      return conducta.mensajeGroseria;
    }

    // ── D2: saludos / cortesías → respuesta breve sin asesor ────────────────
    if (esSaludo(message)) {
      const saludo = `¡Hola ${clientName}! Soy el asistente virtual del colegio "${colegio}". ¿En qué puedo ayudarte hoy?`;
      this.aiLogs.guardar({
        sessionId,
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta: saludo,
        chunksUsados: [],
      });
      emit('chunk', { text: saludo });
      return saludo;
    }

    // ── Tema restringido ────────────────────────────────────────────────────
    const esRestringido = config.temasRestringidos.some((t) =>
      coincideTema(msgLower, t),
    );
    if (esRestringido) {
      const msgRestringido = config.mensajeRestringido;
      this.aiLogs.guardar({
        sessionId,
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
      return msgRestringido;
    }

    // ── RAG ─────────────────────────────────────────────────────────────────
    const ragResult = await this.documentosService
      .buscarRelevantes(message, colegio || undefined, rolNormalizado, 5)
      .catch(() => ({ contexto: '', documentos: [], chunks: [] }));

    const { contexto, documentos } = ragResult;
    const chunks = (ragResult as any).chunks ?? [];
    const tieneContexto = contexto.trim().length > 0;

    this.logger.debug(
      `[RAG] tuvoContexto=${tieneContexto} | chunks=${chunks.length} | colegio=${colegio} | rol=${rolNormalizado}`,
    );

    // ── D2: sin documentos del rol → no inventar, sugerir asesor ────────────
    if (!tieneContexto) {
      this.aiLogs.guardar({
        sessionId,
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta: conducta.mensajeSinInformacion,
        chunksUsados: [],
        tuvoContexto: false,
      });
      if (conducta.sugerirAsesorAutomatico) {
        emit('metadata', { documentos: [], sugerirAsesor: true });
      }
      emit('chunk', { text: conducta.mensajeSinInformacion });
      return conducta.mensajeSinInformacion;
    }

    const systemPrompt = this.buildSystemPrompt(
      clientName,
      colegio,
      tipoSolicitud,
      config,
      contexto,
      tieneContexto,
      aiCfg,
    );

    const historyFiltered = filtrarHistorial(history);

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
    const streamUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent' +
      '?alt=sse';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort);
    }

    let response: Response;
    try {
      response = await fetch(streamUrl, {
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
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      if (err?.name === 'AbortError') {
        throw new Error('La generación fue interrumpida.');
      }
      throw err;
    }

    if (!response.ok) {
      const err = await response.text();
      this.aiLogs.guardar({
        sessionId,
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

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let textoAcumulado = '';
    let finishReason: string | undefined;

    try {
      while (true) {
        let chunk: { done: boolean; value?: Uint8Array };
        try {
          chunk = await reader.read();
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            onPartial?.(textoAcumulado);
            throw new Error('La generación fue interrumpida.');
          }
          throw err;
        }
        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json || json === '[DONE]') continue;

          try {
            const parsed = JSON.parse(json);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const fr: string | undefined = parsed.candidates?.[0]?.finishReason;
            if (fr) finishReason = fr;
            if (text) {
              textoAcumulado += text;
              emit('chunk', { text });
            }
          } catch {
            /* ignorar */
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }

    if (finishReason === 'MAX_TOKENS') {
      const aviso =
        '\n\n(La respuesta se cortó por extensión; intenta reformular tu pregunta.)';
      textoAcumulado += aviso;
      emit('chunk', { text: aviso });
      this.logger.warn('Gemini truncado por MAX_TOKENS en chatStream()');
    }

    // ── Emitir documento solo si la IA respondió algo concreto ─────────────
    // [FEEDBACK:YES] indica que la IA resolvió una pregunta real.
    // Solo se envía el documento con mejor distancia (documentos[0] ya viene
    // ordenado por relevancia desde documentos.service.ts).
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
        sugerirAsesor: false,
      });
    } else if (!respondioAlgo && conducta.sugerirAsesorAutomatico) {
      // La IA no resolvió con los documentos → ofrecer asesor humano
      emit('metadata', { documentos: [], sugerirAsesor: true });
    }

    // ── Guardar log al finalizar ────────────────────────────────────────────
    this.aiLogs.guardar({
      sessionId,
      colegio,
      rol: rolNormalizado,
      tipoSolicitud,
      clientName,
      pregunta: message,
      respuesta: textoAcumulado,
      chunksUsados: chunks.map((c: any) => ({
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

    return textoAcumulado;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buildSystemPrompt()
  // ─────────────────────────────────────────────────────────────────────────
  private async generateCompactText(
    prompt: string,
    maxOutputTokens: number,
    temperature: number,
  ): Promise<string> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY no esta configurada');

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
      const text = (
        data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      ).trim();
      const finishReason: string | undefined =
        data.candidates?.[0]?.finishReason;
      const usage = data.usageMetadata;
      if (usage) {
        this.logger.log(
          `Gemini: finishReason=${finishReason} outputTokens=${usage.candidatesTokenCount ?? '?'} totalTokens=${usage.totalTokenCount ?? '?'}`,
        );
      }
      if (finishReason === 'MAX_TOKENS') {
        this.logger.warn(
          `Gemini truncado (MAX_TOKENS, ${text.length} chars). Devolviendo borrador original.`,
        );
        return '';
      }
      return text;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Gemini no respondio a tiempo. Intenta de nuevo.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private compactText(value: unknown, maxLength: number): string {
    const clean =
      typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    return clean.length > maxLength
      ? `${clean.slice(0, maxLength).trim()}...`
      : clean;
  }

  private cleanAiPlainText(value: string): string {
    return value
      .replace(/\[FEEDBACK:(YES|NO)\]/gi, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();
  }

  private buildSystemPrompt(
    clientName: string,
    colegio: string,
    tipoSolicitud: string,
    config: any,
    contexto: string,
    tieneContexto: boolean,
    aiPromptConfig?: Record<string, any> | null,
  ): string {
    // Si hay prompt personalizado, usarlo directamente con variables reemplazadas
    if (aiPromptConfig?.promptPersonalizado) {
      let prompt = aiPromptConfig.promptPersonalizado;
      prompt = prompt.replace(/\{\{CLIENT_NAME\}\}/g, clientName);
      prompt = prompt.replace(/\{\{COLEGIO\}\}/g, colegio);
      prompt = prompt.replace(/\{\{ROL\}\}/g, config.label);
      prompt = prompt.replace(/\{\{DESCRIPCION_ROL\}\}/g, config.descripcion);
      prompt = prompt.replace(/\{\{MOTIVO\}\}/g, tipoSolicitud);
      prompt = prompt.replace(
        /\{\{TEMAS_RESTRINGIDOS\}\}/g,
        config.temasRestringidos.join(', '),
      );
      prompt = prompt.replace(/\{\{MENSAJE_RESTRINGIDO\}\}/g, config.mensajeRestringido || '');
      if (tieneContexto) {
        prompt = prompt.replace(
          /\{\{CONTEXTO_RAG\}\}/g,
          `INFORMACIÓN DE LA BASE DE CONOCIMIENTO:\n${contexto}\nFIN DE LA BASE DE CONOCIMIENTO.`,
        );
      } else {
        prompt = prompt.replace(/\{\{CONTEXTO_RAG\}\}/g, '');
      }
      prompt +=
        '\n\nREGLA DE ROL: La información de la base de conocimiento es EXCLUSIVA para el rol ' +
        config.label +
        '. Responde SOLO con ella y nunca con datos de documentos de otros roles.';
      if (tieneContexto) {
        prompt +=
          '\nCITAS: Cuando uses información de un documento, menciona su nombre entre corchetes (ej: [Documento 1: <nombre>]) para que el cliente sepa de dónde proviene.';
      }
      return prompt;
    }

    // Ensamblar desde secciones del formulario
    const nombre = aiPromptConfig?.nombreAsistente || 'asistente virtual de atención al cliente';
    const especialidad = aiPromptConfig?.especialidad || 'colegios';
    const instrucciones = aiPromptConfig?.instruccionesGenerales ||
      'Responde de forma clara, amable y concisa en español. NO uses emojis. Adapta el lenguaje al rol: técnico para administradores/docentes, sencillo para estudiantes y padres.';
    const frasesTransferencia = aiPromptConfig?.frasesTransferencia?.length
      ? aiPromptConfig.frasesTransferencia.join('", "')
      : 'asesor", "humano", "persona", "agente';
    const feedbackReglas = aiPromptConfig?.feedbackPositivo ||
      'SOLO si resolviste completamente una pregunta real y concreta';

    const partes: string[] = [];

    partes.push(
      `Eres un/a ${nombre} especializado en ${especialidad}.`,
      `Estás atendiendo a ${clientName}, quien tiene el rol de ${config.label} en el colegio "${colegio}".`,
      `El motivo de su consulta es: ${tipoSolicitud}.`,
      '',
      'PERFIL DEL USUARIO:',
      `- Rol: ${config.label}`,
      `- ${config.descripcion}`,
    );

    if (config.temasRestringidos.length > 0) {
      partes.push(
        `- Temas que NO debes responder para este rol: ${config.temasRestringidos.join(', ')}.`,
        `  Si preguntan sobre estos temas, responde: "${config.mensajeRestringido}"`,
      );
    } else {
      partes.push('- Tiene acceso completo a toda la información disponible.');
    }

    if (tieneContexto) {
      partes.push(
        '',
        'INFORMACIÓN DE LA BASE DE CONOCIMIENTO:',
        'La siguiente información proviene de documentos oficiales del sistema.',
        'Úsala para responder con precisión. NO inventes información que no esté aquí.',
        'Cuando uses datos de un documento, cita su nombre tal como aparece,',
        'ej. [Documento 1: Manual de convivencia], para que el cliente sepa la fuente.',
        '',
        contexto,
        '',
        'FIN DE LA BASE DE CONOCIMIENTO.',
        '',
        `Esta información es EXCLUSIVA para el rol ${config.label}.`,
        'NUNCA respondas con información de documentos destinados a otros roles,',
        'ni mezcles datos que no correspondan a este rol.',
      );
    }

    partes.push(
      '',
      'Reglas importantes:',
      `- ${instrucciones}`,
      `- NO uses emojis en ninguna respuesta.`,
      tieneContexto
        ? '- Basa tu respuesta PRINCIPALMENTE en la información de la base de conocimiento.'
        : '- NO tienes documentos oficiales para este rol sobre esta consulta.',
      tieneContexto
        ? '- NO inventes nada que no esté en los documentos provistos.'
        : '- NO inventes información ni uses conocimiento general ni datos de otros roles.',
      tieneContexto
        ? ''
        : '- Si la consulta requiere información institucional, responde que no tienes esa información registrada por el momento.',
      `- Si el cliente menciona "${frasesTransferencia}" o pide hablar con alguien, responde ÚNICAMENTE: TRANSFER_TO_ADVISOR`,
      `- Si la pregunta toca temas restringidos para el rol ${config.label}, redirige amablemente.`,
      '',
      '────────────────────────────────────────',
      'CONTROL DE FEEDBACK',
      '────────────────────────────────────────',
      `Usa [FEEDBACK:YES] ${feedbackReglas}.`,
      'Usa [FEEDBACK:NO] en cualquier otro caso (saludos, ambigüedades, redirects, etc).',
      'Agrega SIEMPRE al final exactamente uno: [FEEDBACK:YES] o [FEEDBACK:NO]',
    );

    return partes.join('\n');
  }

  getApiKey(): string {
    return this.apiKey;
  }
}
