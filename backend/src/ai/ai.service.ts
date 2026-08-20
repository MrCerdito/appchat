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
  if (r.includes('admin') || r.includes('administrador')) return 'administrador';
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

// ── Marcadores de entrega de documentos ─────────────────────────────────────
// La IA marca al final de la respuesta: [DOCUMENTO: <nombre exacto>]
// (puede repetirse para entregar varios). Se parsean y validan contra los
// documentos del RAG del rol para adjuntar los PDFs correspondientes.
function parseDocumentoMarkers(text: string): string[] {
  const nombres: string[] = [];
  const re = /\[DOCUMENTO:\s*([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1].trim().replace(/^["'“”`]+|["'“”`]+$/g, '');
    if (n) nombres.push(n);
  }
  return [...new Set(nombres)];
}

function normalizarNombreDoc(nombre: string): string {
  return (nombre ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Resuelve los documentos marcados por la IA contra los disponibles del RAG.
// Si no hay marcadores, usa el fallback (mejores del RAG) siempre que la IA
// haya respondido algo concreto con contexto.
function resolverDocumentosEntregados(
  marcados: string[],
  disponibles: any[],
  fallback: any[],
  max = 3,
): any[] {
  if (marcados.length > 0) {
    const resolved = marcados
      .map((name) => {
        const norm = normalizarNombreDoc(name);
        return (
          disponibles.find(
            (d) => d?.nombre && normalizarNombreDoc(d.nombre) === norm,
          ) ?? null
        );
      })
      .filter(Boolean);
    if (resolved.length) return resolved.slice(0, max);
  }
  return (fallback ?? []).slice(0, max);
}

function limpiarMarcadoresDocumento(text: string): string {
  return (text ?? '').replace(/\[DOCUMENTO:[^\]]*\]/gi, '').trim();
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
  'Por el momento no tengo información específica sobre eso en los documentos de tu rol. ¿Puedo ayudarte con otra cosa? Si lo prefieres, un asesor humano puede apoyarte mejor.';

interface ToneRule {
  regla: string;
  saludo: string;
  despedida: string;
}

const toneRulesImprove: Record<string, ToneRule> = {
  formal: {
    regla: 'FORMAL: serio, institucional y profesional; usa vocabulario formal.',
    saludo:
      'saludo formal como "Estimado/a {cliente}:" o "Respetado/a {cliente}:"',
    despedida: 'despedida formal como "Atentamente," o "Cordialmente,"',
  },
  educado: {
    regla:
      'EDUCADO: amable, cortes y respetuoso; demuestra consideracion y calidez.',
    saludo:
      'saludo amable como "Hola {cliente}, espero te encuentres muy bien:" o "Hola {cliente}:"',
    despedida:
      'despedida amable como "Muchas gracias por tu paciencia," o "Con aprecio,"',
  },
  directo: {
    regla: 'DIRECTO: claro, conciso y sin rodeos; va al punto sin perder la amabilidad.',
    saludo: 'saludo breve como "Hola {cliente}:" o "Buen dia {cliente}:"',
    despedida: 'despedida breve como "Quedo atento," o "Cualquier duda, me avisas."',
  },
};

type CharlaTipo =
  | 'saludo'
  | 'como_estas'
  | 'agradecimiento'
  | 'despedida'
  | 'confirmacion';

// Vocabulario de charla/cortesía que NO debe tratarse como consulta real.
const RELLENO_CHARLA = new Set([
  // saludos
  'hola', 'holi', 'hello', 'hi', 'hey', 'ey', 'buen', 'buena', 'buenas',
  'buenos', 'dia', 'dias', 'tardes', 'noches', 'saludos', 'saludo',
  'bienvenido', 'bienvenida', 'bienvenidos',
  // "cómo estás" / pequeña charla
  'como', 'estas', 'esta', 'andas', 'vas', 'va', 'encuentras', 'sigues',
  'tal', 'mas', 'hubo', 'todo', 'genial', 'bien', 'cuentas',
  // agradecimientos
  'gracias', 'muchas', 'muchisimas', 'mil', 'agradezco', 'agradecido',
  'agradecida', 'se', 'por', 'de', 'verdad', 'realmente', 'siempre',
  'ayuda', 'apoyo', 'con', 'gusto', 'atencion',
  // despedidas
  'adios', 'chao', 'chau', 'bye', 'hasta', 'luego', 'pronto', 'manana',
  'despues', 'nos', 'vemos', 'cuidate', 'cuidese', 'hablamos', 'exito',
  'feliz',
  // confirmaciones
  'ok', 'okey', 'oka', 'listo', 'listaa', 'entendido', 'perfecto',
  'acuerdo', 'dale', 'muy', 'super', 'excelente', 'claro', 'bueno',
  'si', 'estoy', 'asombroso', 'joya', 'bacan',
  // relleno sin significado
  'la', 'el', 'en', 'y', 'o', 'a', 'un', 'una', 'mi', 'lo', 'que',
  'me', 'no', 'pues', 'eh', 'ah', 'este',
]);

function esPalabraCharlaRelleno(w: string): boolean {
  if (RELLENO_CHARLA.has(w)) return true;
  // Variantes tipeadas de saludos: "holaaa", "holaaaasdasd", "hooola", "hey"
  return /^(hol+|hey+|halo|ey+|holi)/.test(w);
}

// Palabras del mensaje que NO son cortesía/relleno (posible contenido real).
function palabrasReales(mensaje: string): string[] {
  return mensaje
    .split(' ')
    .filter(Boolean)
    .filter((w) => !esPalabraCharlaRelleno(w));
}

function normalizarTexto(texto: string): string {
  return (texto ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Detecta si un mensaje es SOLO cortesía (saludo, "cómo estás", gracias, etc.)
// y devuelve el tipo de charla. Devuelve null si contiene una consulta real,
// que debe pasar a RAG/Gemini para entregar la información.
function clasificarCharla(mensaje: string): CharlaTipo | null {
  const m = normalizarTexto(mensaje)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!m || m.length > 40) return null;

  // Solo se considera charla si no quedan palabras con contenido real.
  const esCharla = () => palabrasReales(m).length === 0;

  if (
    /(^|\s)(adios|chao|chau|bye|nos vemos|hasta luego|hasta pronto|hasta manana|hasta despues|cuida(te|se)|nos hablamos)\b/.test(m) &&
    esCharla()
  )
    return 'despedida';

  if (
    /(^|\s)(gracias|muchas gracias|muchisimas gracias|mil gracias|te agradezco|agradecido|agradecida|gracias por todo|gracias por la ayuda|se agradece)\b/.test(m) &&
    esCharla()
  )
    return 'agradecimiento';

  if (
    /(^|\s)(como estas|como esta|como andas|como vas|como va|como te va|como te encuentras|como sigues|como esta todo|como te ha ido|que tal|que mas|que hubo|que cuentas)\b/.test(m) &&
    esCharla()
  )
    return 'como_estas';

  if (
    /(^|\s)(ok|okey|oka|listo|entendido|perfecto|de acuerdo|dale|muy bien|super bien|todo bien|estoy bien|excelente|genial|claro|bueno|bien|asombroso)\b/.test(m) &&
    esCharla()
  )
    return 'confirmacion';

  if (esCharla()) return 'saludo';
  return null;
}

// Patrones de solicitudes de ayuda genéricas que NO deben activar RAG.
// Son peticiones vagas sin contenido real consultable.
const PATRONES_AYUDA_GENERICA = [
  /^necesito\s+(ayuda|informacion|apoyo|orientacion|asistencia|un\s+favor)/i,
  /^ayudame|^ayuda(m(e|nos)?)?$/i,
  /^que\s+puedo\s+hacer$/i,
  /^que\s+hago$/i,
  /^como\s+pregunto$/i,
  /^tengo\s+una\s+(duda|pregunta|consulta)$/i,
  /^me\s+puedes?\s+(ayudar|apoyar|orientar)$/i,
  /^quiero\s+(ayuda|informacion|apoyo|orientacion)$/i,
];

function esAyudaGenerica(mensaje: string): boolean {
  const m = normalizarTexto(mensaje);
  return PATRONES_AYUDA_GENERICA.some((p) => p.test(m));
}

// ¿El mensaje es solo charla (sin consulta real)?
function esSoloCharla(mensaje: string): boolean {
  return clasificarCharla(mensaje) !== null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly apiUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

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

  // Memoria de conversación por sesión (en memoria; se reinicia al reiniciar)
  private readonly resumenSesion = new Map<
    string,
    { resumen: string; procesados: number }
  >();

  // ¿El usuario aún no ha hecho ningún turno real (solo el [CONTEXTO] inicial)?
  private esPrimeraInteraccion(history: AiMessage[]): boolean {
    return !(history ?? []).some(
      (h) =>
        h.role === 'user' &&
        h?.text &&
        !h.text.trim().startsWith('[CONTEXTO]'),
    );
  }

  // Última consulta real del usuario (sin el [CONTEXTO] inicial), para que la
  // charla a mitad de conversación retome el tema en curso sin repetir saludos.
  private temaReciente(history: AiMessage[]): string {
    const previos = (history ?? []).filter(
      (h) =>
        h?.role === 'user' &&
        h?.text &&
        !h.text.trim().startsWith('[CONTEXTO]'),
    );
    const ultimo = previos[previos.length - 1];
    if (!ultimo?.text) return '';
    return this.compactText(ultimo.text, 32);
  }

  // Última cortesía usada por sesión/tipo, para no repetir la misma frase.
  private readonly ultimaCortesia = new Map<
    string,
    { tipo: CharlaTipo; idx: number }
  >();

  private elegirCortesia(
    sessionId: string,
    tipo: CharlaTipo,
    opciones: string[],
  ): string {
    const key = sessionId || 'anonima';
    const previo = this.ultimaCortesia.get(key);
    let idx = Math.floor(Math.random() * opciones.length);
    if (
      previo &&
      previo.tipo === tipo &&
      previo.idx === idx &&
      opciones.length > 1
    ) {
      idx = (idx + 1) % opciones.length;
    }
    this.ultimaCortesia.set(key, { tipo, idx });
    return opciones[idx];
  }

  // Respuesta conversacional breve para charla pura (0 tokens de Gemini):
  // cálida y natural, pero sin alargar la conversación.
  private respuestaCortesia(
    tipo: CharlaTipo,
    sessionId: string,
    clientName: string,
    history: AiMessage[],
  ): string {
    const nombre = clientName?.trim() || '';
    const ref = nombre ? `, ${nombre}` : '';
    const primera = this.esPrimeraInteraccion(history);
    const tema = this.temaReciente(history);

    switch (tipo) {
      case 'agradecimiento':
        return this.elegirCortesia(sessionId, tipo, [
          `¡Con gusto${ref}! Para eso estoy. Cuando necesites algo más, aquí sigo.`,
          `¡De nada${ref}! Siempre a la orden.`,
          `Un placer ayudarte${ref}. ¿Necesitas saber algo más?`,
          `¡Con gusto! Lo que necesites, aquí estoy.`,
        ]);
      case 'despedida':
        return this.elegirCortesia(sessionId, tipo, [
          `¡Hasta luego${ref}! Si vuelves a necesitar algo, aquí estaré.`,
          `¡Nos vemos${ref}! Cuídate mucho.`,
          `¡Hasta pronto${ref}! Fue un gusto atenderte.`,
          `¡Adiós${ref}! Que tengas un excelente día.`,
        ]);
      case 'como_estas':
        return this.elegirCortesia(sessionId, tipo, [
          `¡Muy bien, gracias por preguntar${ref}! Aquí para ayudarte. ¿Qué necesitas hoy?`,
          `¡Excelente, siempre a tu servicio! ¿En qué te ayudo${ref}?`,
          `¡Genial, gracias por preguntar! ¿Qué te cuento hoy${ref}?`,
          `¡De maravilla, listo para ayudarte! ¿En qué puedo apoyarte${ref}?`,
        ]);
      case 'confirmacion':
        return this.elegirCortesia(sessionId, tipo, [
          `¡Perfecto! Aquí sigo por si necesitas algo más.`,
          `¡Listo! Cuando quieras, continuamos.`,
          `¡Genial! Avísame si necesitas otra cosa.`,
        ]);
      case 'saludo':
      default:
        if (primera) {
          return this.elegirCortesia(sessionId, tipo, [
            `¡Hola${ref}! Encantado de ayudarte. Cuéntame, ¿en qué te ayudo hoy?`,
            `¡Hola${ref}! Bienvenido. ¿Qué necesitas hoy?`,
            `¡Hola${ref}! Estoy aquí para lo que necesites. ¿Cuál es tu consulta?`,
          ]);
        }
        if (tema) {
          return this.elegirCortesia(sessionId, tipo, [
            `¡Hola${ref}! ¿Avanzo con lo de "${tema}" o necesitas algo más?`,
            `¡Hola${ref}! Seguimos con "${tema}". ¿En qué más te ayudo?`,
          ]);
        }
        return this.elegirCortesia(sessionId, tipo, [
          `¡Hola${ref}! Aquí sigo. Dime, ¿en qué te ayudo?`,
          `¡Hola${ref}! Con gusto te atiendo. ¿Qué necesitas?`,
          `¡Hola${ref}! Cuéntame en qué te puedo colaborar.`,
        ]);
    }
  }

  // Query de RAG con referencia al hilo: combina la pregunta actual con los
  // últimos mensajes del usuario SOLO si el mensaje actual contiene palabras
  // de referencia (pronombres, "cuándo", "dónde", etc.) que necesitan contexto
  // del historial. Si el mensaje es una consulta standalone, no mezcla historial
  // para evitar contaminación de resultados RAG.
  private construirConsultaRag(
    message: string,
    history: AiMessage[],
  ): string {
    const msgLower = message.toLowerCase();
    let expansion = '';

    if (
      msgLower.includes('contras') ||
      msgLower.includes('clave') ||
      msgLower.includes('pass') ||
      msgLower.includes('olvid')
    ) {
      expansion += ' restablecer recuperar cambiar contraseña clave password plataforma';
    }
    if (
      msgLower.includes('entr') ||
      msgLower.includes('ingres') ||
      msgLower.includes('acced') ||
      msgLower.includes('login') ||
      msgLower.includes('plataform')
    ) {
      expansion += ' plataforma ingresar acceder iniciar sesion usuario error acceso';
    }

    // Solo incluir historial si el mensaje contiene palabras de referencia
    // que necesitan contexto previo para tener sentido
    const REFERENCE_WORDS = [
      'eso', 'esto', 'eso', 'aquel', 'aquella',
      'cuando', 'cuándo', 'donde', 'dónde',
      'como', 'cómo', 'porque', 'por qué',
      'cuál', 'cual', 'cuáles', 'cuales',
      'este', 'esta', 'ese', 'esa',
      'ahí', 'ahi', 'allí', 'alli',
      'mencion', 'mencionaste', 'dijiste', 'hablaste',
    ];
    const tieneRef = REFERENCE_WORDS.some((w) => msgLower.includes(w));

    if (!tieneRef) {
      // Mensaje standalone — no contaminar con historial
      return message.trim() + expansion;
    }

    const previos = (history ?? [])
      .filter(
        (h) =>
          h?.role === 'user' &&
          h?.text &&
          !h.text.trim().startsWith('[CONTEXTO]') &&
          h.text.trim() !== message.trim(),
      )
      .slice(-2)
      .map((h) => h.text.trim());
    
    return [...previos, message.trim() + expansion].join(' ').trim();
  }

  // Comprime turnos que quedaron fuera de la ventana del modelo, guardando el
  // resumen por sesión para no perder contexto en conversaciones largas.
  private async comprimirHistorial(
    sessionId: string,
    sobrantes: AiMessage[],
  ): Promise<string> {
    if (!sessionId || !sobrantes.length) return '';
    const previo = this.resumenSesion.get(sessionId);
    if (previo && previo.procesados >= sobrantes.length) {
      return previo.resumen;
    }

    const nuevos = previo ? sobrantes.slice(previo.procesados) : sobrantes;
    const linea = nuevos
      .map((h) =>
        `${h.role === 'user' ? 'Cliente' : 'Asistente'}: ${this.compactText(h.text, 150)}`,
      )
      .join('\n');

    let resumen = previo?.resumen ?? '';
    if (linea.trim()) {
      try {
        const extra = await this.generateCompactText(
          `Eres la memoria de una conversación de atención al cliente. Resume de forma compacta (máximo 100 palabras) lo esencial para mantener el hilo: el tema, los datos clave (fechas, montos, nombres, promesas) y dónde quedó la conversación. Usa SOLO la información dada.\n\nConversación:\n${linea}`,
          300,
          0.2,
        );
        if (extra.trim()) {
          resumen = resumen ? `${resumen}\n${extra.trim()}` : extra.trim();
        }
      } catch {
        /* si el resumen falla, continuar sin él */
      }
    }

    this.resumenSesion.set(sessionId, {
      resumen,
      procesados: sobrantes.length,
    });
    return resumen;
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
    sessionId?: string,
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

    // ── D2: charla pura (saludos / cortesías) → respuesta breve y cálida,
    //    sin consumir tokens. Las consultas reales pasan a RAG + Gemini. ──
    const charla = clasificarCharla(message);
    if (charla) {
      const saludo = this.respuestaCortesia(
        charla,
        sessionId ?? '',
        clientName,
        history,
      );
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

    // ── D2b: ayuda genérica ("necesito ayuda", "ayudame", "qué puedo hacer")
    //    → respuesta conversacional breve SIN activar RAG ni entregar documentos. ──
    if (esAyudaGenerica(message)) {
      const respuesta = '¡Claro! Estoy aquí para ayudarte. Por favor, cuéntame con más detalle qué necesitas para poder asistirte mejor.';
      this.aiLogs.guardar({
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta,
        chunksUsados: [],
      });
      return { reply: respuesta, transfer: false, showFeedback: false, documentos: [] };
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

    // ── RAG (con referencia al hilo: el usuario pregunta "¿cuándo es?" y
    //    la búsqueda debe incluir el tema previo). Entrega SOLO por roles. ──
    const ragQuery = this.construirConsultaRag(message, history);
    const ragResult = await this.documentosService
      .buscarRelevantes(ragQuery, rolNormalizado, 6)
      .catch(() => ({ contexto: '', documentos: [], chunks: [] }));

    const { contexto, documentos } = ragResult;
    const chunks = (ragResult as any).chunks ?? [];
    const tieneContexto = contexto.trim().length > 0;

    this.logger.debug(
      `[RAG] tuvoContexto=${tieneContexto} | chunks=${chunks.length} | colegio=${colegio} | rol=${rolNormalizado}`,
    );

    // D2: sin documentos del rol → la IA responde de forma conversacional.
    // El systemPrompt (con tieneContexto=false) le prohíbe inventar datos
    // institucionales y la orienta a ofrecer asesor solo si corresponde.
    if (!tieneContexto) {
      this.logger.debug(
        `[IA] Sin contexto RAG (rol=${rolNormalizado}) → respuesta conversacional`,
      );
    }

    const systemPrompt = this.buildSystemPrompt(
      clientName,
      colegio,
      tipoSolicitud,
      config,
      contexto,
      tieneContexto,
      aiCfg,
      this.buildDocumentosEntregables(documentos),
      conducta.mensajeSinInformacion,
      conducta.sugerirAsesorAutomatico,
    );

    const historyFiltered = filtrarHistorial(history);
    const sobrantes = (history ?? []).slice(
      0,
      history.length - historyFiltered.length,
    );
    let systemPromptFinal = systemPrompt;
    if (sobrantes.length > 0) {
      const resumen = await this.comprimirHistorial(
        sessionId ?? '',
        sobrantes,
      );
      if (resumen) {
        this.logger.debug(
          `[IA] Memoria de sesión aplicada (${sobrantes.length} turnos comprimidos)`,
        );
        systemPromptFinal = `${systemPrompt}\n\nRESUMEN DE LA CONVERSACIÓN ANTERIOR:\n${resumen}\nFIN DEL RESUMEN.`;
      }
    }

    const contents = [
      { role: 'user', parts: [{ text: systemPromptFinal }] },
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
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 3072 },
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
      throw new Error(
        'Ups, se me interrumpió la conexión. Por favor intenta de nuevo.',
      );
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
    if (raw.includes('TRANSFER_TO_ADVISOR')) {
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
    const marcados = parseDocumentoMarkers(raw);
    const reply = limpiarMarcadoresDocumento(
      raw.replace(/\[FEEDBACK:(YES|NO)\]\s*$/, ''),
    );
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

    // Documentos a entregar: los marcados por la IA (validados contra el RAG
    // del rol) o, si no marcó ninguno, fallback con los mejores documentos.
    // Se entregan de forma PROACTIVA cada vez que hubo contexto del rol.
    const docsParaDevolver =
      tieneContexto && documentos.length > 0
        ? resolverDocumentosEntregados(marcados, documentos, documentos)
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
    profile: {
      clientName?: string;
      institution?: string;
      role?: string;
      context?: string;
    } = {},
    tone: string = 'formal',
    length: 'short' | 'medium' | 'long' = 'medium',
  ): Promise<{ replies: string[] }> {
    const cleanDraft = this.compactText(draft, 900);
    if (!cleanDraft) return { replies: [] };

    const tonoElegido =
      toneRulesImprove[tone] ??
      {
        regla: `TONO PERSONALIZADO: "${tone}". Interpreta y aplica ese tono de forma consistente en las 3 variantes.`,
        saludo: `saludo acorde al tono "${tone}"`,
        despedida: `despedida acorde al tono "${tone}"`,
      };
    const usoUsted =
      tone === 'formal' ||
      /usted|formal|respet|institucional/i.test(tone);

    const limitePalabras =
      length === 'short' ? 45 : length === 'long' ? 140 : 90;
    const maxOutput = length === 'long' ? 3200 : 2600;

    const basePrompt = (correccion?: string): string => {
      const correccionBloque = correccion
        ? `\nCORRECCION IMPORTANTE: ${correccion}\n`
        : '';

      const contextoConversacion = this.compactText(profile.context, 500);

      return `Eres un experto en redaccion de mensajes para WhatsApp. Toma el borrador de abajo y REESCRIBELO por completo, generando 3 variantes de mensaje distintas entre si.

TONO: ${tonoElegido.regla}
- ${tonoElegido.saludo}
- ${tonoElegido.despedida}
- Trata al cliente de "${usoUsted ? 'usted' : 'tu'}".

Reglas de contenido (iguales en las 3 variantes):
- Corrige ortografia, tildes, puntuacion, capitalizacion y errores de digitacion.
- Conserva exactamente la intencion, datos, promesas, fechas, precios, nombres y preguntas del texto original.
- No agregues informacion nueva ni respondas por el cliente.
- Maximo ${limitePalabras} palabras por variante.
- NO uses emojis ni emoticones.
- Evita frases corporativas vacias ("Estamos encantados de...", "Esperamos que este mensaje te encuentre bien", "Para nosotros es un placer") y rellenos genericos.

Reglas de VARIACION (clave):
- Las 3 variantes deben ser MUY distintas entre si y del borrador: cada una con un SALUDO diferente, un ORDEN de la informacion diferente y una DESPEDIDA diferente.
- Cambia por completo el registro de lenguaje: elige palabras, frases y estructura propias del tono ${tone} en lugar de copiar las del borrador.
- Si una variante te quedaria igual o casi igual al borrador, REESCRIBELA desde cero.
- No repitas la misma oracion en dos variantes distintas.

Estructura por variante (usa una estructura distinta en cada una):
- VARIANTE 1: saludo -> contexto/motivo -> dato clave -> cierre o llamado a la accion (estructura clasica).
- VARIANTE 2: empieza por el dato o motivo mas importante (enganche directo), luego el detalle, y cierra con una despedida breve.
- VARIANTE 3: version breve estilo mensaje de texto, solo lo esencial, sin relleno.
${correccionBloque}
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

Dentro de cada bloque usa SOLO el texto, sin comillas, sin markdown, sin prefijos como "Texto mejorado:" ni ninguna otra etiqueta.

Perfil breve:
Cliente: ${this.compactText(profile.clientName, 80) || 'Cliente WhatsApp'}
Institucion: ${this.compactText(profile.institution, 90) || 'No registrada'}
Rol: ${this.compactText(profile.role, 60) || 'Cliente'}
Contexto de la conversacion (mensaje del cliente al que se responde):
${contextoConversacion || 'No se proporciona'}

Borrador:
${cleanDraft}`;
    };

    // Intento 1
    const raw1 = this.cleanAiPlainText(
      await this.generateCompactText(basePrompt(), maxOutput, 0.9),
    );
    let replies = this.filtrarVariantes(this.parseImproveVariants(raw1), cleanDraft);

    // Reintento si quedaron menos de 3 variantes distintas (NO se rellena con
    // el borrador original: eso producia opciones identicas).
    if (replies.length < 3) {
      const correccion =
        replies.length === 0
          ? 'No seguiste el formato ni generaste variantes. Devuelve EXACTAMENTE 3 bloques separados por lineas de "=" con "VARIANTE N".'
          : 'Las variantes anteriores quedaron iguales o casi iguales entre si o al borrador. Reescribe cada una de forma CLARAMENTE distinta: cambia el saludo, el orden de la informacion, el vocabulario y la despedida. No repitas frases.';
      const raw2 = this.cleanAiPlainText(
        await this.generateCompactText(basePrompt(correccion), maxOutput, 1.0),
      );
      const reintento = this.filtrarVariantes(
        this.parseImproveVariants(raw2),
        cleanDraft,
      );
      // Fusionar sin duplicar
      for (const v of reintento) {
        if (replies.length >= 3) break;
        if (
          replies.some(
            (u) => this.similitudTexto(u, v) >= 0.92,
          )
        ) {
          continue;
        }
        replies.push(v);
      }
    }

    return { replies: replies.slice(0, 3) };
  }

  private parseImproveVariants(text: string): string[] {
    if (!text) return [];
    const clean = this.cleanAiPlainText(text);

    // 1) Intentar JSON: ["a","b","c"] o {"variantes":[...]}
    try {
      const json = clean
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const obj = JSON.parse(json);
      const arr = Array.isArray(obj)
        ? obj
        : obj && Array.isArray((obj as any).variantes)
          ? (obj as any).variantes
          : null;
      if (Array.isArray(arr)) {
        const v = arr
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim());
        if (v.length >= 3) return v.slice(0, 3);
      }
    } catch {
      /* no era JSON válido */
    }

    // 2) Formato canónico: bloques separados por líneas de "="
    let blocks = clean
      .split(/={3,}/)
      .map((block) => this.limpiaVariante(block))
      .filter((block) => block.length > 0);

    // 3) Formato "VARIANTE N" como encabezado de línea
    if (blocks.length < 2) {
      blocks = clean
        .split(/^VARIANTE\s*\d+\s*[:.\-]?\s*$/gim)
        .map((block) => this.limpiaVariante(block))
        .filter((block) => block.length > 0);
    }

    return blocks.slice(0, 3);
  }

  private limpiaVariante(block: string): string {
    return block
      .replace(/^\s*VARIANTE\s*\d+\s*[:.\-]?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Descarta variantes vacias, muy cortas, iguales al borrador original o
  // duplicadas (o casi-iguales) entre si. Máximo 3.
  private filtrarVariantes(variantes: string[], borrador: string): string[] {
    const unicas: string[] = [];
    for (const v of variantes) {
      const texto = (v ?? '').trim();
      if (!texto) continue;
      if (this.normalizarVariante(texto).length < 20) continue;
      if (this.similitudTexto(texto, borrador) >= 0.92) continue;
      if (unicas.some((u) => this.similitudTexto(u, texto) >= 0.92)) continue;
      unicas.push(texto);
      if (unicas.length >= 3) break;
    }
    return unicas;
  }

  // Normaliza para comparar: minúsculas, sin tildes, sin puntuación.
  private normalizarVariante(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Similitud 0..1 por distancia de Levenshtein sobre texto normalizado.
  private similitudTexto(a: string, b: string): number {
    const na = this.normalizarVariante(a);
    const nb = this.normalizarVariante(b);
    const max = Math.max(na.length, nb.length);
    if (!max) return 1;
    return 1 - this.levenshtein(na, nb) / max;
  }

  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const curr = new Array<number>(b.length + 1);
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      prev = curr;
    }
    return prev[b.length];
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

    // ── D2: charla pura (saludos / cortesías) → respuesta breve y cálida,
    //    sin consumir tokens. Las consultas reales pasan a RAG + Gemini. ──
    const charla = clasificarCharla(message);
    if (charla) {
      const saludo = this.respuestaCortesia(
        charla,
        sessionId ?? '',
        clientName,
        history,
      );
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

    // ── D2b: ayuda genérica ("necesito ayuda", "ayudame", "qué puedo hacer")
    //    → respuesta conversacional breve SIN activar RAG ni entregar documentos. ──
    if (esAyudaGenerica(message)) {
      const respuesta = '¡Claro! Estoy aquí para ayudarte. Por favor, cuéntame con más detalle qué necesitas para poder asistirte mejor.';
      this.aiLogs.guardar({
        sessionId,
        colegio,
        rol: rolNormalizado,
        tipoSolicitud,
        clientName,
        pregunta: message,
        respuesta,
        chunksUsados: [],
      });
      emit('chunk', { text: respuesta });
      return respuesta;
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

    // ── RAG (con referencia al hilo: el usuario pregunta "¿cuándo es?" y
    //    la búsqueda debe incluir el tema previo). Entrega SOLO por roles. ──
    const ragQuery = this.construirConsultaRag(message, history);
    const ragResult = await this.documentosService
      .buscarRelevantes(ragQuery, rolNormalizado, 6)
      .catch(() => ({ contexto: '', documentos: [], chunks: [] }));

    const { contexto, documentos } = ragResult;
    const chunks = (ragResult as any).chunks ?? [];
    const tieneContexto = contexto.trim().length > 0;

    this.logger.debug(
      `[RAG] tuvoContexto=${tieneContexto} | chunks=${chunks.length} | colegio=${colegio} | rol=${rolNormalizado}`,
    );

    // D2: sin documentos del rol → la IA responde de forma conversacional.
    // El systemPrompt (con tieneContexto=false) le prohíbe inventar datos
    // institucionales y la orienta a ofrecer asesor solo si corresponde.
    if (!tieneContexto) {
      this.logger.debug(
        `[IA] Sin contexto RAG (rol=${rolNormalizado}) → respuesta conversacional`,
      );
    } else {
      // ── ENTREGA PROACTIVA INMEDIATA ──────────────────────────────────────
      // Emitir las tarjetas de los documentos del rol AHORA, antes de llamar
      // a Gemini: el instructivo aparece aunque la generación tarde o falle.
      // La emisión final (con marcadores) la refina después.
      emit('metadata', {
        documentos: documentos.slice(0, 3).map((d: any) => ({
          nombre: d.nombre,
          pdfUrl: d.pdfUrl,
          categoria: d.categoria,
          descripcion: d.descripcion ?? null,
          instructivo: d.instructivo ?? false,
        })),
        sugerirAsesor: false,
      });
    }

    const systemPrompt = this.buildSystemPrompt(
      clientName,
      colegio,
      tipoSolicitud,
      config,
      contexto,
      tieneContexto,
      aiCfg,
      this.buildDocumentosEntregables(documentos),
      conducta.mensajeSinInformacion,
      conducta.sugerirAsesorAutomatico,
    );

    const historyFiltered = filtrarHistorial(history);
    const sobrantes = (history ?? []).slice(
      0,
      history.length - historyFiltered.length,
    );
    let systemPromptFinal = systemPrompt;
    if (sobrantes.length > 0) {
      const resumen = await this.comprimirHistorial(
        sessionId ?? '',
        sobrantes,
      );
      if (resumen) {
        this.logger.debug(
          `[IA] Memoria de sesión aplicada (${sobrantes.length} turnos comprimidos)`,
        );
        systemPromptFinal = `${systemPrompt}\n\nRESUMEN DE LA CONVERSACIÓN ANTERIOR:\n${resumen}\nFIN DEL RESUMEN.`;
      }
    }

    const contents = [
      { role: 'user', parts: [{ text: systemPromptFinal }] },
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
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent' +
      '?alt=sse';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
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
        generationConfig: { temperature: 0.7, maxOutputTokens: 3072 },
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
      throw new Error(
        'Ups, se me interrumpió la conexión. Por favor intenta de nuevo.',
      );
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

    // ── Emitir documentos: los que la IA marcó con [DOCUMENTO: <nombre>] ──
    // (validados contra el RAG del rol) o, si no marcó ninguno, fallback con
    // los mejores documentos. Se emiten de forma PROACTIVA siempre que haya
    // contexto del rol (no depende de [FEEDBACK:YES]).
    const respondioAlgo = /\[FEEDBACK:YES\]\s*$/.test(textoAcumulado);
    const marcados = parseDocumentoMarkers(textoAcumulado);
    const esTransferencia = textoAcumulado.includes('TRANSFER_TO_ADVISOR');

    if (tieneContexto && documentos.length > 0 && !esTransferencia) {
      const docsEntregar = resolverDocumentosEntregados(
        marcados,
        documentos,
        documentos,
        3,
      );
      emit('metadata', {
        documentos: docsEntregar.map((d: any) => ({
          nombre: d.nombre,
          pdfUrl: d.pdfUrl,
          categoria: d.categoria,
          descripcion: d.descripcion ?? null,
          instructivo: d.instructivo ?? false,
        })),
        sugerirAsesor: false,
      });
    } else if (
      !respondioAlgo &&
      conducta.sugerirAsesorAutomatico &&
      !esSoloCharla(message)
    ) {
      // La IA no resolvió con los documentos → ofrecer asesor humano.
      // Se excluyen saludos/charla trivial, donde basta la conversación.
      emit('metadata', { documentos: [], sugerirAsesor: true });
    }

    // Limpiar marcadores [DOCUMENTO: ...] del texto devuelto
    const textoFinal = limpiarMarcadoresDocumento(textoAcumulado);

    // ── Guardar log al finalizar ────────────────────────────────────────────
    this.aiLogs.guardar({
      sessionId,
      colegio,
      rol: rolNormalizado,
      tipoSolicitud,
      clientName,
      pregunta: message,
      respuesta: textoFinal,
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

    return textoFinal;
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
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((part: any) => !part.thought)
        .map((part: any) => part.text ?? '')
        .join('')
        .trim();
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
          `Gemini truncado (MAX_TOKENS, ${text.length} chars). Usando salida parcial.`,
        );
        return text;
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

  private buildDocumentosEntregables(documentos: any[]): string {
    if (!Array.isArray(documentos) || documentos.length === 0) return '';
    return documentos
      .map((d) => {
        const cat = d?.categoria ? ` (categoría: ${d.categoria})` : '';
        const tipo = d?.instructivo
          ? ' — INSTRUCTIVO: se entrega de forma proactiva y breve'
          : '';
        return `- ${d?.nombre ?? ''}${cat}${tipo}`;
      })
      .filter((s) => s !== '-')
      .join('\n');
  }

  private buildSystemPrompt(
    clientName: string,
    colegio: string,
    tipoSolicitud: string,
    config: any,
    contexto: string,
    tieneContexto: boolean,
    aiPromptConfig?: Record<string, any> | null,
    documentosEntregables = '',
    mensajeSinInformacion = '',
    sugerirAsesorAutomatico = true,
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
      prompt = prompt.replace(/\{\{DOCUMENTOS_ENTREGABLES\}\}/g, documentosEntregables);
      prompt +=
        '\n\nREGLA DE ROL: La información de la base de conocimiento es EXCLUSIVA para el rol ' +
        config.label +
        '. Responde SOLO con ella y nunca con datos de documentos de otros roles.';
      if (tieneContexto) {
        prompt +=
          '\nCITAS Y ENTREGA DE DOCUMENTOS: Cuando uses información de un documento, cita su nombre exacto. Si el documento resuelve la consulta, responde en 1-3 frases y al final escribe SOLO el marcador [DOCUMENTO: <nombre exacto del documento>] (repite el marcador por cada documento que entregues). NUNCA incluyas URLs ni enlaces.';
      } else {
        const aviso =
          mensajeSinInformacion || DEFAULT_MENSAJE_SIN_INFORMACION;
        prompt +=
          '\n\nSIN DOCUMENTOS DISPONIBLES: Si la consulta es de un tema institucional (pagos, notas, calendario, trámites, admisiones, contraseñas, acceso, etc.) y no tienes información para responderla, responde textualmente: "' +
          aviso +
          '"' +
          (sugerirAsesorAutomatico
            ? ' Solo si el usuario insiste o pide ayuda humana, responde TRANSFER_TO_ADVISOR.'
            : '') +
          '. No inventes datos ni procedimientos.';
      }
      return prompt;
    }

    // Ensamblar desde secciones del formulario
    const nombre = aiPromptConfig?.nombreAsistente || 'asistente virtual de atención al cliente';
    const especialidad = aiPromptConfig?.especialidad || 'colegios';
    const instrucciones = aiPromptConfig?.instruccionesGenerales ||
      'Responde de forma natural y conversacional, como un asistente humano cálido y profesional: frases fluidas y breves, en español, y sin repetir la bienvenida ni frases enlatadas. Mantén el hilo de la conversación refiriéndote a lo que ya se ha hablado cuando venga al caso. Trata al usuario por su nombre de forma natural y sin exagerar. Adapta el lenguaje al rol: técnico para administradores/docentes, sencillo para estudiantes y padres.';
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
        'Cuando uses datos de un documento, cita su nombre EXACTO tal como aparece.',
        'Cada fragmento trae su etiqueta [Documento N: <nombre>] como referencia interna;',
        'no la uses como cita literal, usa el <nombre> real del documento.',
        'IMPORTANTE: Si los documentos recuperados NO son directamente pertinentes a la',
        'pregunta del usuario, NO los menciones ni entregues. Responde con la información',
        'que tengas disponible o indica que no tienes información sobre ese tema específico.',
        '',
        contexto,
        '',
        'FIN DE LA BASE DE CONOCIMIENTO.',
        '',
        `Esta información es EXCLUSIVA para el rol ${config.label}.`,
        'NUNCA respondas con información de documentos destinados a otros roles,',
        'ni mezcles datos que no correspondan a este rol.',
      );
      if (documentosEntregables) {
        partes.push(
          '',
          'DOCUMENTOS DISPONIBLES PARA ENTREGAR A ESTE ROL:',
          documentosEntregables,
          'Los marcados como INSTRUCTIVO deben entregarse de forma proactiva y breve.',
        );
      }
    }

    partes.push(
      '',
      'Reglas importantes:',
      `- ${instrucciones}`,
      `- CONTEXTO IMPLÍCITO DE LA PLATAFORMA EDUCATIVA (CRÍTICO): Tu mundo entero y el único sistema del que se habla es la Plataforma Educativa Institucional del colegio "${colegio}".`,
      `  Si el usuario pregunta por "contraseña", "usuario", "clave", "ingreso", "acceso", "olvido", "restablecer" o "entrar", asume de inmediato al 100% que se refiere al acceso de la Plataforma Educativa del Colegio.`,
      `  NUNCA le preguntes al usuario cosas como "¿a qué te refieres?", "¿en dónde quieres restablecerlo?", o "¿de qué sistema hablas?". Trata de inmediato de guiarlo usando las instrucciones que tengas en la base de conocimiento para ese rol.`,
      `- NO uses emojis en ninguna respuesta.`,
      tieneContexto
        ? '- Basa tu respuesta PRINCIPALMENTE en la información de la base de conocimiento.'
        : '- No tienes documentos oficiales de este rol sobre esta consulta, así que responde de forma natural.',
      tieneContexto
        ? '- ENTREGA DE DOCUMENTOS: si un documento (sobre todo un INSTRUCTIVO) resuelve la consulta, responde en 1-3 frases (el paso o dato clave) y entrega el documento con el marcador [DOCUMENTO: <nombre exacto>] al final. NO expliques todo el documento: la tarjeta PDF se muestra debajo.'
        : '',
      tieneContexto
        ? '- NO inventes nada que no esté en los documentos provistos.'
        : '- NO inventes datos institucionales concretos (fechas, montos, requisitos, trámites) que no estén en los documentos.',
      tieneContexto
        ? ''
        : `- Si la consulta es de un tema institucional (pagos, notas, calendario, trámites, admisiones, contraseñas, acceso, etc.) y no tienes la información, responde textualmente: "${mensajeSinInformacion || DEFAULT_MENSAJE_SIN_INFORMACION}"${sugerirAsesorAutomatico ? ' y ofrece pasar la consulta a un asesor humano SOLO si el usuario insiste o lo pide' : ' sin ofrecer un asesor humano a menos que el usuario lo pida'}. No inventes datos ni procedimientos.`,
      '- Si la consulta es charla trivial o conversación cotidiana (saludos, agradecimientos, preguntas personales o de cultura general), responde breve y naturalmente SIN ofrecer transferencia a asesor.',
      `- Si el cliente menciona "${frasesTransferencia}" o pide hablar con alguien, responde ÚNICAMENTE: TRANSFER_TO_ADVISOR`,
      `- Si la pregunta toca temas restringidos para el rol ${config.label}, redirige amablemente.`,
      '',
      '────────────────────────────────────────',
      'CONTROL DE FEEDBACK Y ENTREGA DE DOCUMENTOS',
      '────────────────────────────────────────',
      `Usa [FEEDBACK:YES] ${feedbackReglas}.`,
      'Usa [FEEDBACK:NO] en cualquier otro caso (saludos, ambigüedades, redirects, etc).',
      'Si entregas uno o más documentos, escribe los marcadores [DOCUMENTO: <nombre exacto>]',
      'después de la respuesta y ANTES del marcador de feedback (uno por documento).',
      'Agrega SIEMPRE al final, en la ÚLTIMA línea, exactamente uno: [FEEDBACK:YES] o [FEEDBACK:NO]',
    );

    return partes.join('\n');
  }

  getApiKey(): string {
    return this.apiKey;
  }
}
