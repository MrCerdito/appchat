/**
 * widget.js — Widget de chat embebible — Sian365
 * v2.5.0
 * v2.5.0: la imagen interna del botón cambia según la marca del proyecto
 * (Sian365 → KorvixSian.png, ControlAcademic → KorvixControl.png), igual que
 * el color del anillo. Las imágenes viven en la misma carpeta que widget.js.
 * v2.3.0: auto-actualización (si /widget-config reporta una widgetVersion
 * mayor, recarga la versión nueva en caliente) y polling cada 30 s para
 * reducir la carga del backend. Bump VERSION + widget-version.ts en cada
 * deploy para que el widget se auto-propague sin Ctrl+F5.
 * v2.2.1: fix de posición del manejador fantasma (px con unidad) y
 * animaciones suaves al ocultar (fade + el botón se encoge) y mostrar.
 * v2.2.0: el visitante puede ocultar el widget (clic derecho sobre el
 * botón/burbuja → "Ocultar widget") y volver a mostrarlo desde un manejador
 * fantasma. El estado se persiste en localStorage por navegador.
 * v2.1.0: Versión con soporte completo de todos los campos de configuración.
 * Cambios: fix base URL con src absoluto, chatUrl derivado del script,
 * validación de event.origin, sin secuestro de document.title, match exacto
 * de nombre de archivo, sanitización de colores y loggeo bajo data-debug.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 1 — CONSTANTES
  ═══════════════════════════════════════════════════════════ */
  var VERSION = '2.5.0';
  var POLL_MS  = 60000;
  var ROOT_ID  = 'sian-widget-root';
  var API_PATH = '/widget-config';
  var HIDE_KEY = 'sian_widget_hidden';
  // Marca (por sesión de pestaña) de que la burbuja ya se mostró sola.
  var BUBBLE_SESSION_KEY = 'sian_bubble_autoshown';

  // Revisión global: cada instancia del script toma un número mayor. Cuando el
  // widget auto-actualiza (inyecta la versión nueva), la instancia vieja queda
  // "stale" (MY_REV !== window.__sianWidgetRev) y deja de responder.
  var MY_REV = (window.__sianWidgetRev = (window.__sianWidgetRev || 0) + 1);
  var SWAPPED = false;

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 2 — DEFAULTS
  ═══════════════════════════════════════════════════════════ */
  var DEF = {
    // Botón flotante
    color              : '#2563eb',
    posicion           : 'bottom-right',
    forma              : 'circle',
    tamano             : 'md',
    icono              : 'chat',
    textoBoton         : '',
    mostrarTexto       : false,
    // Comportamiento
    abrirAutomatico    : false,
    delayAutoAbrir     : 5,
    mensajeBurbuja     : '¿Necesitas ayuda? ¡Chatea con nosotros!',
    mostrarBurbuja     : true,
    burbujaModo        : 'timeout',
    burbujaDelaySeg    : 4,
    burbujaDuracionSeg : 7,
    ocultarEnMovil     : false,
    chatUrl            : 'http://localhost:4200/chat',
    // Textos del panel
    tituloPanelChat    : 'Soporte en línea',
    subtituloPanelChat : 'Estamos aquí para ayudarte',
    // Diseño del chat
    chatHeaderColor    : '#1a1a1a',
    chatBgColor        : '#f0ede9',
    chatBubbleColor    : '#ffffff',
    chatBubbleUserColor: '#1a1a1a',
    chatMarca          : 'Soporte en línea',
    burbujaImagen      : '',
  };

  // Marca por proyecto: color del botón/acentos + fondo claro del chat.
  var PROYECTOS = {
    Sian365:         { color: '#ce9b30', bg: '#fcf3d9' },
    ControlAcademic: { color: '#1a3fa8', bg: '#d8e4f8' },
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 3 — LOGGER
  ═══════════════════════════════════════════════════════════ */
  var DEBUG = false;
  var Log = {
    ok: function (o) { if (DEBUG) console.debug('[widget] config', o); },
    fallback: function (msg) { if (DEBUG) console.warn('[widget] usando defaults:', msg); },
    httpError: function (status, url) { if (DEBUG) console.warn('[widget] HTTP', status, url); },
    parseError: function (e) { if (DEBUG) console.warn('[widget] JSON inválido', e); },
    poll: function (changed) { if (DEBUG) console.debug('[widget] poll', changed ? 'cambio' : 'sin cambios'); },
    autoOpen: function (s) { if (DEBUG) console.debug('[widget] auto-open en', s, 's'); },
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 4 — ESTADO INTERNO
  ═══════════════════════════════════════════════════════════ */
  var cfg          = Object.assign({}, DEF);
  var isOpen       = false;
  var isHidden     = false; // el visitante puede ocultar el widget (localStorage)
  var finishHideT  = null;  // timer que aplica el estado oculto tras la animación
  var inited       = false;
  var autoT        = null;
  var _prevCfgJson = '';
  var _pollTimer   = null;

  // ── Estado de la burbuja de bienvenida ──
  var bubbleAutoT  = null;   // timer de aparición automática (modo timeout)
  var bubbleHideT  = null;   // timer de ocultación automática (modo timeout)
  var bubbleHover  = false;  // el puntero está sobre el botón o la burbuja
  var bubbleVisible = false; // estado lógico actual de la burbuja

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 4b — ESTADO ADICIONAL
  ═══════════════════════════════════════════════════════════ */
  var unreadCount = 0;
  var badgeEl = null;
  var brandColor = null; // color de marca del proyecto (Sian365 / ControlAcademic)
  var brandBg    = null; // fondo claro del chat según la marca

  // Estado "oculto por el visitante": persiste en localStorage de la página
  // host. readHidden()/saveHidden() nunca lanzan (modo privado → solo dura la
  // sesión actual).
  function readHidden() {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch (_) { return false; }
  }
  function saveHidden(h) {
    try {
      if (h) localStorage.setItem(HIDE_KEY, '1');
      else   localStorage.removeItem(HIDE_KEY);
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 5 — SVG PATHS
  ═══════════════════════════════════════════════════════════ */
  var PATHS = {
    chat   : '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    help   : '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    support: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    close  : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  };

  function makeSvg(key, size, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="white"'
      + ' stroke-width="' + (sw || 2.2) + '"'
      + ' stroke-linecap="round" stroke-linejoin="round"'
      + ' width="' + size + '" height="' + size + '">'
      + (PATHS[key] || PATHS.chat)
      + '</svg>';
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 6 — HELPERS DE TAMAÑO, POSICIÓN Y COLOR
  ═══════════════════════════════════════════════════════════ */
  var SIZES = { sm: 44, md: 56, lg: 68 };
  var RADII = { sm: '14px', md: '18px', lg: '22px' };

  function btnSize()   { return SIZES[cfg.tamano] || 56; }
  function btnRadius() { return cfg.forma === 'circle' ? '50%' : (RADII[cfg.tamano] || '18px'); }
  function isMobile()  { return window.innerWidth <= 520; }

  /** Normaliza un color a hex de 6 dígitos; devuelve '' si es inválido. */
  function sanitizeHex(val) {
    if (typeof val !== 'string') return '';
    var h = val.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return '#' + h.split('').map(function (c) { return c + c; }).join('');
    }
    return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h : '';
  }

  function hexToRgb(hex) {
    hex = sanitizeHex(hex) || '#2563eb';
    return parseInt(hex.slice(1,3),16) + ','
         + parseInt(hex.slice(3,5),16) + ','
         + parseInt(hex.slice(5,7),16);
  }

  /** Devuelve '#ffffff' o '#111111' según luminosidad del fondo */
  function contrastColor(hex) {
    hex = sanitizeHex(hex) || '#000000';
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.5 ? '#111111' : '#ffffff';
  }

  /** Aclara (pct > 0) u oscurece (pct < 0) un color hex. */
  function shade(hex, pct) {
    hex = sanitizeHex(hex) || '#0b5ed7';
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    var t = pct > 0 ? 255 : 0;
    var a  = Math.abs(pct) / 100;
    var mix = function (c) {
      var v = Math.round(c + (t - c) * a);
      v = Math.max(0, Math.min(255, v));
      return v.toString(16).padStart(2, '0');
    };
    return '#' + mix(r) + mix(g) + mix(b);
  }

  // Helper para probar marcas en la página de preview sin una institución real:
  // widget-preview.html?sian-proyecto=ControlAcademic  (o =Sian365)
  function detectDebugBrand() {
    try {
      var q = (window.location.search + window.location.hash);
      var m = q.match(/sian[_-]?proyecto[=:]([a-z0-9]+)/i);
      if (!m) return null;
      var p = m[1].toLowerCase();
      var key = (p === 'sian365' || p === 'sian') ? 'Sian365'
        : (p === 'controlacademic' || p === 'ctl' || p === 'ctrl' || p === 'control' ? 'ControlAcademic' : '');
      return key ? PROYECTOS[key] : null;
    } catch (_) { return null; }
  }

  /** Detecta el proyecto al instante llamando al backend con la URL actual,
   *  para que el color y el fondo se fijen ANTES de que cargue el chat. */
  function detectarProyecto() {
    try {
      fetch(API_BASE + '/sessions/colegios/detectar', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ url: location.href }),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          if (MY_REV !== window.__sianWidgetRev) return;
          if (!res || !res.tipoColegio || brandColor) return;
          var p = PROYECTOS[res.tipoColegio];
          if (p) applyBrand(p.color, p.bg, res.tipoColegio);
        })
        .catch(function () {});
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 7 — DETECCIÓN DE BASE URL Y DATA ATTRIBUTES
  ═══════════════════════════════════════════════════════════ */
  var _scriptTag = null;

  function getScriptTag() {
    if (_scriptTag) return _scriptTag;
    // Acepta src absoluto (https://dominio.com/korvix/widget.js) y relativo
    // (widget.js o /korvix/widget.js). No captura widgets.js (el sufijo
    // .js final no coincide porque el nombre termina en 's.js').
    var re = /widget(\.min)?\.js$/;
    var tags = document.querySelectorAll('script[src]');
    for (var i = 0; i < tags.length; i++) {
      var s = tags[i].getAttribute('src') || '';
      // Solo el archivo exacto widget[.min].js (no widgets.js ni otros)
      if (re.test(s.split(/[?#]/)[0])) {
        _scriptTag = tags[i];
        return _scriptTag;
      }
    }
    return null;
  }

  function getDataAttr(name) {
    var tag = getScriptTag();
    return tag ? (tag.getAttribute('data-' + name) || '') : '';
  }

  /**
   * Resuelve la base del API (widget-config) y la base del SPA (chat).
   * Usa el pathname real del script para que funcione también con URL
   * absoluta (p.ej. https://dominio.com/korvix/widget.js).
   */
  function resolveBases() {
    var tag = getScriptTag();
    var origin = location.origin;
    var dir = '';

    // data-api-base explícito sobreescribe todo
    if (tag) {
      var explicit = tag.getAttribute('data-api-base');
      if (explicit) {
        var e = explicit.replace(/\/+$/, '');
        return { apiBase: e, spaBase: e };
      }
    }

    var src = tag ? (tag.getAttribute('src') || '') : '';
    if (src) {
      try {
        var u = new URL(src, location.href);
        var p = u.pathname || '';
        origin = u.origin;
        dir = p.substring(0, p.lastIndexOf('/'));
      } catch (_) {}
    }

    var spaBase = origin + dir;
    // Misma base que el SPA: en local el dev-server (4200) proxyfica
    // /widget-config al backend (ver frontend/proxy.conf.json); en producción
    // el API vive en el mismo dominio. Evita hardcodear puertos del backend.
    var apiBase = spaBase;

    return { apiBase: apiBase, spaBase: spaBase };
  }

  var BASES    = resolveBases();
  var API_BASE = BASES.apiBase;
  var SPA_BASE = BASES.spaBase;
  var API_URL  = API_BASE + API_PATH;
  var LOGO_URL = (SPA_BASE ? SPA_BASE.replace(/\/+$/, '') : location.origin) + '/LOGO.png';

  // Imagen interna del botón según la marca del proyecto (mismo criterio que el
  // color del anillo). Fallback a LOGO.png cuando aún no hay marca detectada.
  var BRAND_LOGOS = {
    Sian365:         'KorvixSian.png',
    ControlAcademic: 'KorvixControl.png',
  };
  var brandKey = null; // 'Sian365' | 'ControlAcademic' | null

  /** Resuelve la URL del logo interno del botón según la marca actual. */
  function brandLogoUrl(key) {
    var file = (key && BRAND_LOGOS[key]) || '';
    return file
      ? (SPA_BASE ? SPA_BASE.replace(/\/+$/, '') : location.origin) + '/' + file
      : LOGO_URL;
  }

  /** Deduce la marca desde el color del anillo (por si el chat solo manda el color). */
  function brandKeyFromColor(hex) {
    hex = sanitizeHex(hex);
    for (var k in PROYECTOS) {
      if (PROYECTOS.hasOwnProperty(k) && sanitizeHex(PROYECTOS[k].color) === hex) return k;
    }
    return null;
  }

  // ── Data attributes sobreescritura ─────────────────────────────────────────
  var IS_PREVIEW    = getDataAttr('preview') === 'true';
  var DATA_CHAT_URL = getDataAttr('chat-url') || '';
  DEBUG             = getDataAttr('debug') === 'true';

  // Default del chat: mismo origen+dir que el script (el SPA vive al lado)
  if (SPA_BASE) DEF.chatUrl = SPA_BASE;

  // Si data-chat-url está presente, sobreescribe el chatUrl de la config
  if (DATA_CHAT_URL) {
    DEF.chatUrl = DATA_CHAT_URL;
  }

  // ── Leer config desde URL params (preview mode) ───────────────────────────
  function getPreviewConfig() {
    if (!IS_PREVIEW) return null;
    try {
      var p = new URLSearchParams(location.search);
      var cfg = {};
      var fields = [
        'color', 'posicion', 'forma', 'tamano', 'icono',
        'textoBoton', 'mostrarTexto',
        'abrirAutomatico', 'delayAutoAbrir',
        'mensajeBurbuja', 'mostrarBurbuja', 'chatUrl', 'ocultarEnMovil',
        'burbujaModo', 'burbujaDelaySeg', 'burbujaDuracionSeg',
        'tituloPanelChat', 'subtituloPanelChat',
        'chatHeaderColor', 'chatBgColor',
        'chatBubbleColor', 'chatBubbleUserColor', 'chatMarca',
        'burbujaImagen',
      ];
      fields.forEach(function (f) {
        var v = p.get(f);
        if (v !== null) {
          if (f === 'mostrarTexto' || f === 'abrirAutomatico' || f === 'mostrarBurbuja' || f === 'ocultarEnMovil') {
            cfg[f] = v === 'true';
          } else if (f === 'delayAutoAbrir' || f === 'burbujaDelaySeg' || f === 'burbujaDuracionSeg') {
            cfg[f] = parseInt(v, 10) || DEF[f];
          } else {
            cfg[f] = v;
          }
        }
      });
      return Object.keys(cfg).length > 0 ? cfg : null;
    } catch (_) {
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 8 — NORMALIZACIÓN (TODOS LOS CAMPOS)
  ═══════════════════════════════════════════════════════════ */
  function normalizar(res) {
    return {
      // Botón flotante
      color              : sanitizeHex(res.color)              || DEF.color,
      posicion           : res.posicion            || DEF.posicion,
      forma              : res.forma               || DEF.forma,
      tamano             : res.tamano              || DEF.tamano,
      icono              : res.icono               || DEF.icono,
      textoBoton         : res.textoBoton          != null ? res.textoBoton         : DEF.textoBoton,
      mostrarTexto       : res.mostrarTexto        != null ? res.mostrarTexto       : DEF.mostrarTexto,
      // Comportamiento
      abrirAutomatico    : res.abrirAutomatico      != null ? res.abrirAutomatico    : DEF.abrirAutomatico,
      delayAutoAbrir     : res.delayAutoAbrir       != null ? res.delayAutoAbrir     : DEF.delayAutoAbrir,
      mensajeBurbuja     : res.mensajeBurbuja       != null ? res.mensajeBurbuja     : DEF.mensajeBurbuja,
      mostrarBurbuja     : res.mostrarBurbuja       != null ? res.mostrarBurbuja     : DEF.mostrarBurbuja,
      burbujaModo        : res.burbujaModo          != null ? res.burbujaModo        : DEF.burbujaModo,
      burbujaDelaySeg    : res.burbujaDelaySeg      != null ? res.burbujaDelaySeg    : DEF.burbujaDelaySeg,
      burbujaDuracionSeg : res.burbujaDuracionSeg   != null ? res.burbujaDuracionSeg : DEF.burbujaDuracionSeg,
      ocultarEnMovil     : res.ocultarEnMovil       != null ? !!res.ocultarEnMovil   : DEF.ocultarEnMovil,
      chatUrl            : res.chatUrl             || DEF.chatUrl,
      // Textos del panel
      tituloPanelChat    : res.tituloPanelChat     || DEF.tituloPanelChat,
      subtituloPanelChat : res.subtituloPanelChat  || DEF.subtituloPanelChat,
      // Diseño del chat
      chatHeaderColor    : sanitizeHex(res.chatHeaderColor)     || DEF.chatHeaderColor,
      chatBgColor        : sanitizeHex(res.chatBgColor)         || DEF.chatBgColor,
      chatBubbleColor    : sanitizeHex(res.chatBubbleColor)     || DEF.chatBubbleColor,
      chatBubbleUserColor: sanitizeHex(res.chatBubbleUserColor) || DEF.chatBubbleUserColor,
      chatMarca          : res.chatMarca           || DEF.chatMarca,
      burbujaImagen      : res.burbujaImagen       || DEF.burbujaImagen,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 8b — BURBUJA DE BIENVENIDA (modo no invasivo)
     - siempre: visible mientras el chat esté cerrado
     - timeout: aparece a los delay_seg, se oculta a los duracion_seg
                y después solo con hover (una vez por sesión)
     - hover:   solo al pasar el puntero por el botón
  ═══════════════════════════════════════════════════════════ */
  function bubbleShownOnce() {
    // En preview siempre se puede volver a probar (no se marca la sesión).
    if (IS_PREVIEW) return false;
    try { return sessionStorage.getItem(BUBBLE_SESSION_KEY) === '1'; } catch (_) { return false; }
  }
  function markBubbleShown() {
    if (IS_PREVIEW) return;
    try { sessionStorage.setItem(BUBBLE_SESSION_KEY, '1'); } catch (_) {}
  }
  function canHover() {
    return !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);
  }
  function clearBubbleTimers() {
    if (bubbleAutoT) { clearTimeout(bubbleAutoT); bubbleAutoT = null; }
    if (bubbleHideT) { clearTimeout(bubbleHideT); bubbleHideT = null; }
  }
  function bubbleSideClass() {
    return cfg.posicion.indexOf('-right') !== -1 ? 'sian-bubble-left' : 'sian-bubble-right';
  }
  function showBubble() {
    var bubble = document.getElementById('sian-bubble');
    if (!bubble || isOpen || isHidden) return;
    if (!cfg.mostrarBurbuja || !cfg.mensajeBurbuja) return;
    bubble.classList.remove('sian-bubble-hiding');
    // Re-disparar la animación de entrada: quitar la clase de lado, forzar
    // reflow y volver a ponerla.
    bubble.classList.remove('sian-bubble-left', 'sian-bubble-right');
    void bubble.offsetWidth;
    bubble.classList.add(bubbleSideClass());
    bubble.style.display = 'flex';
    bubbleVisible = true;
  }
  function hideBubble(animate) {
    var bubble = document.getElementById('sian-bubble');
    bubbleVisible = false;
    if (!bubble) return;
    if (!animate || bubble.style.display === 'none') {
      bubble.classList.remove('sian-bubble-hiding');
      bubble.style.display = 'none';
      return;
    }
    bubble.classList.remove('sian-bubble-left', 'sian-bubble-right');
    bubble.classList.add(bubbleSideClass(), 'sian-bubble-hiding');
    var done = function () {
      bubble.removeEventListener('animationend', done);
      bubble.classList.remove('sian-bubble-hiding');
      bubble.style.display = 'none';
    };
    bubble.addEventListener('animationend', done);
    // Respaldo por si 'animationend' no llega (pestaña en segundo plano, etc.)
    setTimeout(done, 600);
  }
  function setBubbleHover(v) {
    bubbleHover = !!v;
    syncBubble(cfg);
  }
  // Decide visibilidad según modo, hover, estado del chat y sesión.
  function syncBubble(c) {
    cfg = c;
    var bubble = document.getElementById('sian-bubble');
    if (!bubble) return;

    if (!c.mostrarBurbuja || !c.mensajeBurbuja || isOpen || isHidden) {
      clearBubbleTimers();
      hideBubble(false);
      return;
    }

    var mode = c.burbujaModo || 'timeout';
    if (mode === 'hover' && !canHover()) mode = 'timeout';

    if (mode === 'siempre') {
      clearBubbleTimers();
      showBubble();
      return;
    }

    // El hover siempre revela la burbuja (no invasivo).
    if (canHover() && bubbleHover) {
      clearBubbleTimers();
      showBubble();
      return;
    }

    if (mode === 'hover') {
      clearBubbleTimers();
      hideBubble(true);
      return;
    }

    // mode === 'timeout'
    if (bubbleVisible) {
      if (bubbleHideT) return;        // ventana automática en curso
      clearBubbleTimers();
      hideBubble(true);               // estaba visible solo por hover
      return;
    }
    if (bubbleShownOnce()) return;    // ya se mostró sola en esta sesión
    if (bubbleAutoT || bubbleHideT) return;

    var delay = Math.max(1, parseInt(c.burbujaDelaySeg, 10) || 4);
    var dur   = Math.max(2, parseInt(c.burbujaDuracionSeg, 10) || 7);
    bubbleAutoT = setTimeout(function () {
      bubbleAutoT = null;
      if (isOpen || isHidden || !cfg.mostrarBurbuja || !cfg.mensajeBurbuja) return;
      if (bubbleShownOnce()) return;
      markBubbleShown();
      showBubble();
      bubbleHideT = setTimeout(function () {
        bubbleHideT = null;
        if (!bubbleHover) hideBubble(true);
      }, dur * 1000);
    }, delay * 1000);
  }

  function buildChatSrc(baseUrl) {
    if (!baseUrl) return '';
    var base = baseUrl.replace(/\/+$/, '');
    return base.endsWith('/chat') ? base : base + '/chat';
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 9 — CONSTRUCCIÓN DEL DOM
     Incluye header completo con marca, título y subtítulo.
  ═══════════════════════════════════════════════════════════ */
  function buildDOM() {
    // Solo se elimina una instancia creada por el propio widget (data-sian-widget).
    // Si la página del host ya tiene un elemento con este id, no se toca.
    var old = document.getElementById(ROOT_ID);
    if (old && old.getAttribute('data-sian-widget')) old.remove();

    var root = document.createElement('div');
    root.id  = ROOT_ID;
    root.setAttribute('data-sian-widget', '1');

    // ── Burbuja ──
    var bubble = document.createElement('div');
    bubble.id  = 'sian-bubble';
    bubble.style.display = 'none';
    bubble.addEventListener('click', openPanel);
    bubble.addEventListener('mouseenter', function () { setBubbleHover(true); });
    bubble.addEventListener('mouseleave', function () { setBubbleHover(false); });
    var bubbleImg = document.createElement('img');
    bubbleImg.className = 'sian-bubble-img';
    bubbleImg.alt = '';
    bubble.appendChild(bubbleImg);
    var bubbleText = document.createElement('span');
    bubbleText.className = 'sian-bubble-text';
    bubble.appendChild(bubbleText);
    root.appendChild(bubble);

    // ── Panel (solo iframe, sin header ni powered-by) ──
    var panel = document.createElement('div');
    panel.id  = 'sian-panel';

    var iframe = document.createElement('iframe');
    iframe.id  = 'sian-iframe';
    iframe.setAttribute('allow', 'microphone; camera');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('title', 'Sian365 Chat');
    panel.appendChild(iframe);

    root.appendChild(panel);

    // ── Botón flotante premium (círculo Korvix) ──
    var btn = document.createElement('button');
    btn.id  = 'sian-btn';
    btn.setAttribute('aria-label', 'Abrir chat');
    btn.addEventListener('click', togglePanel);
    btn.addEventListener('mouseenter', function () { setBubbleHover(true); });
    btn.addEventListener('mouseleave', function () { setBubbleHover(false); });

    var logo = document.createElement('span');
    logo.className = 'sian-kx-logo';
    var logoImg = document.createElement('img');
    logoImg.src = brandLogoUrl(brandKey);
    logoImg.alt = 'Korvix';
    logoImg.addEventListener('error', function () {
      logoImg.style.display = 'none';
      var letter = logo.querySelector('.sian-kx-letter');
      if (letter) letter.style.display = 'block';
    });
    var letter = document.createElement('span');
    letter.className = 'sian-kx-letter';
    letter.textContent = 'K';
    logo.appendChild(logoImg);
    logo.appendChild(letter);

    var xIc = document.createElement('span');
    xIc.className = 'sian-kx-x';
    xIc.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--sian-brand, #0b5ed7)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    logo.appendChild(xIc);

    btn.appendChild(logo);
    root.appendChild(btn);

    // ── Badge de no-leídos ──
    var badge = document.createElement('span');
    badge.id  = 'sian-badge';
    badge.style.display = 'none';
    btn.appendChild(badge);
    badgeEl = badge;

    // Clic derecho sobre el widget (botón o burbuja) → menú "Ocultar widget".
    root.addEventListener('contextmenu', onRootContextMenu);

    document.body.appendChild(root);

    // ── Manejador fantasma: queda visible cuando el visitante oculta el
    //    widget para poder volver a mostrarlo. Se agrega al body (NO al root,
    //    que queda display:none). ──
    var toggle = document.createElement('button');
    toggle.id  = 'sian-hidden-toggle';
    toggle.setAttribute('type', 'button');
    toggle.setAttribute('title', 'Mostrar el chat');
    toggle.setAttribute('aria-label', 'Mostrar el chat');
    toggle.innerHTML = makeSvg('chat', 22, 2.2);
    toggle.addEventListener('click', restoreWidget);
    toggle.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Mostrar widget', action: restoreWidget },
      ]);
    });
    document.body.appendChild(toggle);

    // ── Menú contextual propio ──
    var ctxMenu = document.createElement('div');
    ctxMenu.id  = 'sian-ctxmenu';
    ctxMenu.setAttribute('role', 'menu');
    document.body.appendChild(ctxMenu);
  }


  // ─── Dimensiones del panel ─────────────────────────────────────────────
  function panelDims() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (vw <= 520) {
      // Móvil: ocupa toda la pantalla menos un pequeño margen
      return {
        w: Math.round(vw - 8),
        h: Math.round(vh - 8),
        mobile: true,
      };
    }
    // Desktop: panel flotante con espacio suficiente para mostrar contenido
    return {
      w: Math.min(440, Math.max(360, Math.round(vw * 0.32))),
      h: Math.min(680, Math.max(520, Math.round(vh * 0.80))),
      mobile: false,
    };
  }

  // ─── Posiciones CSS ───────────────────────────────────────────────────────
  var BTN_POS = {
    'bottom-right': { bottom: '5px', right: '24px' },
    'bottom-left' : { bottom: '24px', left:  '24px' },
    'top-right'   : { top:    '24px', right: '24px' },
    'top-left'    : { top:    '24px', left:  '24px' },
  };

  function getPanelStyle(posicion, dims, size) {
    if (dims.mobile) {
      // En móvil el botón flotante queda acoplado bajo/sobre el panel (mismo
      // criterio que desktop) para que NUNCA se superponga con el contenido.
      var gap = (size || 56) + 20;
      var h   = Math.max(240, dims.h + 4 - gap) + 'px';
      var styles = {
        'bottom-right': { bottom: gap + 'px', left: '4px', width: dims.w + 'px', height: h, borderRadius: '20px', transformOrigin: 'bottom center' },
        'bottom-left' : { bottom: gap + 'px', left: '4px', width: dims.w + 'px', height: h, borderRadius: '20px', transformOrigin: 'bottom center' },
        'top-right'   : { top:    gap + 'px', left: '4px', width: dims.w + 'px', height: h, borderRadius: '20px', transformOrigin: 'top center'    },
        'top-left'    : { top:    gap + 'px', left: '4px', width: dims.w + 'px', height: h, borderRadius: '20px', transformOrigin: 'top center'    },
      };
      return styles[posicion] || styles['bottom-right'];
    }
    // Desktop
    var gap = size + 20;
    var br  = '20px';
    var w   = dims.w + 'px';
    var h   = dims.h + 'px';

    var styles = {
      'bottom-right': { bottom: gap + 'px', right: '24px', width: w, height: h, borderRadius: br, transformOrigin: 'bottom right' },
      'bottom-left' : { bottom: gap + 'px', left:  '24px', width: w, height: h, borderRadius: br, transformOrigin: 'bottom left'  },
      'top-right'   : { top:    gap + 'px', right: '24px', width: w, height: h, borderRadius: br, transformOrigin: 'top right'    },
      'top-left'    : { top:    gap + 'px', left:  '24px', width: w, height: h, borderRadius: br, transformOrigin: 'top left'     },
    };
    return styles[posicion] || styles['bottom-right'];
  }

  function getBubblePos(posicion, size, btn) {
  var gap = 10; // espacio entre botón y burbuja

  // Ancla la burbuja al centro vertical del botón y al lado interior de la
  // pantalla: con posicion -right nace a la izquierda del icono, con -left a
  // la derecha. Queda pegada al icono y parece "salir" desde él.
  var r = (btn && typeof btn.getBoundingClientRect === 'function') ? btn.getBoundingClientRect() : null;
  if (r && r.width > 0) {
    var cy = r.top + r.height / 2;
    var side = posicion.indexOf('-right') !== -1
      ? { right: (window.innerWidth - r.left + gap) + 'px' }
      : { left: (r.right + gap) + 'px' };
    return Object.assign({ top: cy + 'px', transform: 'translateY(-50%)' }, side);
  }

  return {
    'bottom-right': { 
      bottom: '14px', 
      right: (size + gap + 24) + 'px' 
    },

    'bottom-left': { 
      bottom: '24px', 
      left: (size + gap + 24) + 'px' 
    },

    'top-right': { 
      top: '24px', 
      right: (size + gap + 24) + 'px' 
    },

    'top-left': { 
      top: '24px', 
      left: (size + gap + 24) + 'px' 
    },
  }[posicion] || { bottom: '24px', right: (size + gap + 24) + 'px' };
}
  function applyPos(el, map) {
    ['top', 'bottom', 'left', 'right', 'transform'].forEach(function (k) { el.style[k] = ''; });
    Object.keys(map).forEach(function (k) { el.style[k] = typeof map[k] === 'number' ? map[k] + 'px' : map[k]; });
  }

  // ─── Pintar config en el DOM ──────────────────────────────────────────────

  function paint(c) {
    // Instancia vieja tras auto-actualización: ignoro todo.
    if (MY_REV !== window.__sianWidgetRev) return;
    cfg = c;

    var rootEl = document.getElementById(ROOT_ID);
    if (rootEl) rootEl.classList.toggle('sian-hide-mobile', !!cfg.ocultarEnMovil);

    // data-chat-url sobreescribe cualquier config de la API
    if (DATA_CHAT_URL) {
      cfg.chatUrl = DATA_CHAT_URL;
    }
    var size    = btnSize();
    var hasText = cfg.mostrarTexto && cfg.textoBoton;
    var dims    = panelDims();
    var iconKey = isOpen ? 'close' : (cfg.icono || 'chat');
    var iconSz  = Math.round(size * 0.44);

    // ── Botón flotante (diseño premium Korvix, no depende de la config) ──
    var btn = document.getElementById('sian-btn');
    if (btn) {
      // Color de marca del proyecto, o azul Korvix por defecto.
      var base = (brandColor && sanitizeHex(brandColor)) || '#0b5ed7';

      btn.style.width        = '64px';
      btn.style.height       = '64px';
      btn.style.borderRadius = '50%';
      btn.style.padding      = '0';
      btn.style.background   = 'linear-gradient(135deg, ' + shade(base, -14) + ' 0%, ' + base + ' 50%, ' + shade(base, 26) + ' 100%)';

      btn.classList.toggle('sian-kx-open', isOpen);
      if (isOpen) {
        btn.setAttribute('aria-label', 'Cerrar chat');
      } else {
        btn.setAttribute('aria-label', 'Abrir chat');
      }

      applyPos(btn, BTN_POS[cfg.posicion] || BTN_POS['bottom-right']);
    }

    // ── Burbuja ──
    var bubble = document.getElementById('sian-bubble');
    if (bubble) {
      var bImg  = bubble.querySelector('.sian-bubble-img');
      var bText = bubble.querySelector('.sian-bubble-text');
      if (bImg) {
        bImg.style.display = cfg.burbujaImagen ? 'block' : 'none';
        bImg.src = cfg.burbujaImagen || '';
      }
      if (bText) bText.textContent = cfg.mensajeBurbuja || '';
      applyPos(bubble, getBubblePos(cfg.posicion, size, btn));
    }
    // Visibilidad delegada a la máquina de estado (modo siempre/timeout/hover)
    syncBubble(cfg);

    // ── Panel (posición y tamaño) ──
    var panel = document.getElementById('sian-panel');
    if (panel) {
      var ps = getPanelStyle(cfg.posicion, dims, size);
      ['top','bottom','left','right','width','height','borderRadius','transformOrigin'].forEach(function(k){
        panel.style[k] = '';
      });
      Object.keys(ps).forEach(function(k){ panel.style[k] = ps[k]; });
    }

    // ── Iframe ──
    var iframe = document.getElementById('sian-iframe');
    if (iframe) {
      var chatSrc = buildChatSrc(cfg.chatUrl);
      if (iframe.getAttribute('data-src') !== chatSrc) {
        iframe.setAttribute('data-src', chatSrc);
        iframe.src = chatSrc;
      }
      // Fondo del iframe mientras carga
      iframe.style.background = (brandColor && brandBg) ? brandBg : cfg.chatBgColor;
      iframe.style.width   = '100%';
      iframe.style.height  = '100%';
      iframe.style.border  = 'none';
      iframe.style.display = 'block';

      // Enviar tema al chat vía postMessage (el chat lo recibe y aplica)
      sendThemeToIframe(iframe, c);
    }

    // ── Auto-open (solo la primera vez) ──
    if (!inited && cfg.abrirAutomatico) {
      if (autoT) clearTimeout(autoT);
      Log.autoOpen(cfg.delayAutoAbrir);
      autoT = setTimeout(openPanel, cfg.delayAutoAbrir * 1000);
    }

    // Manejador fantasma: mantener posición si el widget está oculto (la
    // config puede cambiar posición vía polling mientras tanto).
    if (isHidden) {
      var toggleEl = document.getElementById('sian-hidden-toggle');
      if (toggleEl) {
        toggleEl.style.display = 'flex';
        applyPos(toggleEl, getHiddenPos(cfg.posicion));
      }
    }

    inited = true;
  }

  /**
   * Envía el tema de colores al iframe del chat vía postMessage.
   * El chat (Angular/React/etc.) debe escuchar 'sian-theme' y aplicar los CSS vars.
   */
  function chatTargetOrigin(c) {
    return (c.chatUrl || '').replace(/\/chat\/?$/, '').replace(/\/+$/, '') || '*';
  }

  function themePayload(c) {
    var header = c.chatHeaderColor;
    var userBubble = c.chatBubbleUserColor;
    var bg = c.chatBgColor;
    // La marca del proyecto (Sian365 / ControlAcademic) manda sobre la config.
    if (brandColor) {
      header    = brandColor;
      userBubble = brandColor;
      if (brandBg) bg = brandBg;
    }
    return {
      type               : 'sian-theme',
      chatHeaderColor    : header,
      chatBgColor        : bg,
      chatBubbleColor    : c.chatBubbleColor,
      chatBubbleUserColor: userBubble,
      chatMarca          : c.chatMarca,
      chatAvatar         : c.chatAvatar,
      pageUrl            : location.href,
    };
  }

  function postTheme(iframe, c) {
    try {
      iframe.contentWindow.postMessage(themePayload(c), chatTargetOrigin(c));
    } catch (_) {}
  }

  // ── Marca del proyecto ─────────────────────────────────────────────────────
  // El widget detecta la institución (tipoColegio) o el chat la notifica con
  // 'sian-brand'. Aplica el color al botón, el fondo claro del chat y lo
  // reenvía en el tema para que se aplique antes/instantáneamente.
  function applyBrand(color, bg, key) {
    if (MY_REV !== window.__sianWidgetRev) return;
    var hex = sanitizeHex(color);
    if (!hex) return;
    brandColor = hex;
    brandBg = (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) ? bg : null;
    // La marca del proyecto también selecciona la imagen interna del botón.
    // Si el emisor no mandó la clave, la deducimos del color del anillo.
    brandKey = key || brandKeyFromColor(hex);
    document.documentElement.style.setProperty('--sian-brand', hex);
    if (brandBg) document.documentElement.style.setProperty('--sian-bg', brandBg);
    var f = document.getElementById('sian-iframe');
    if (f) {
      if (brandBg) f.style.background = brandBg;
      postTheme(f, cfg);
    }
    var logoImg = document.querySelector('#sian-btn .sian-kx-logo img');
    if (logoImg) logoImg.src = brandLogoUrl(brandKey);
    paint(cfg);
  }

  // ── Theme confirmation tracking ────────────────────────────────────────────
  var _themePollTimer = null;

  function stopThemePoll() {
    if (_themePollTimer) { clearInterval(_themePollTimer); _themePollTimer = null; }
  }

  function sendThemeToIframe(iframe, c) {
    try {
      iframe.addEventListener('load', function onLoad() {
        iframe.removeEventListener('load', onLoad);
        postTheme(iframe, c);
        // Start polling: re-send theme every 2s until the chat confirms
        // receipt via 'sian-ready' (max 10s / 5 attempts).
        stopThemePoll();
        var attempts = 0;
        _themePollTimer = setInterval(function () {
          if (attempts++ >= 5) { stopThemePoll(); return; }
          postTheme(iframe, c);
        }, 2000);
      });
    } catch (_) {}
  }

  // ── Badge update ─────────────────────────────────────────────────────────
  function updateBadge(count) {
    unreadCount = count;
    if (!badgeEl) return;
    if (count > 0 && !isOpen) {
      badgeEl.textContent = count > 99 ? '99+' : count;
      badgeEl.style.display = 'flex';
      var btn = document.getElementById('sian-btn');
      if (btn) btn.style.animation = 'sian-bounce 0.4s ease';
    } else {
      badgeEl.style.display = 'none';
      var btn2 = document.getElementById('sian-btn');
      if (btn2) btn2.style.animation = '';
    }
  }

  // ── Escuchar mensajes del iframe ──────────────────────────────────────────
  // Solo se procesan mensajes que vienen del origin del chat (no de otras
  // ventanas/páginas que intenten manipular el widget).
  function chatOrigin() {
    try {
      return new URL(cfg.chatUrl, location.href).origin;
    } catch (_) {
      return '';
    }
  }

  window.addEventListener('message', function (event) {
    if (MY_REV !== window.__sianWidgetRev) return;
    if (!event.data || !event.origin || event.origin !== chatOrigin()) return;
    if (event.data.type === 'unread_count') {
      updateBadge(event.data.count);
    }
    if (event.data.type === 'sian-close-panel') {
      closePanel();
    }
    if (event.data.type === 'sian-brand') {
      applyBrand(event.data.color, event.data.bg);
    }
    if (event.data.type === 'sian-ready') {
      // El chat (lazy) avisa que ya escucha 'sian-theme'. Como el iframe
      // pudo haberse cargado antes de que Angular registrara el listener,
      // reenviamos el tema aquí para que no haya flash de colores.
      stopThemePoll();
      var f = document.getElementById('sian-iframe');
      if (f) postTheme(f, cfg);
    }
  });

  // ── Estilos base del widget ────────────────────────────────────────────
  var widgetStyle = document.createElement('style');
  widgetStyle.textContent = `
#sian-widget-root {
  display: block;
  --sian-brand: #0b5ed7;
}
@media (max-width: 520px) {
  #sian-widget-root.sian-hide-mobile {
    display: none !important;
  }
}
#sian-widget-root *,
#sian-widget-root *::before,
#sian-widget-root *::after {
  box-sizing: border-box;
}
#sian-panel {
  position: fixed;
  display: none;
  overflow: hidden;
  z-index: 2147483647;
  background: #fff;
  flex-direction: column;
}
#sian-panel.sian-open {
  display: flex;
  animation: sianFadeIn 0.25s ease forwards;
  box-shadow:
    0 24px 70px rgba(15, 23, 42, 0.28),
    0 6px 20px rgba(15, 23, 42, 0.16);
}
@keyframes sianFadeIn {
  from { opacity: 0; transform: scale(0.92) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
#sian-btn {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.35);
  outline: none;
  z-index: 2147483647;
  font-family: inherit;
  transition: transform 0.25s cubic-bezier(0.2,0.8,0.2,1), filter 0.25s ease;
}
#sian-btn:hover {
  transform: translateY(-3px);
  filter: brightness(1.07);
}
#sian-btn:active {
  transform: translateY(-1px) scale(0.97);
}
#sian-btn .sian-kx-logo {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255,255,255,0.98);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
#sian-btn.sian-kx-open { animation: sianKxPop 0.28s cubic-bezier(0.2,0.8,0.2,1); }
@keyframes sianKxPop {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.07); }
  100% { transform: scale(1); }
}
#sian-btn .sian-kx-logo img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  display: block;
}
#sian-btn .sian-kx-logo .sian-kx-letter {
  display: none;
  font-size: 26px;
  font-weight: 700;
  color: var(--sian-brand, #0b5ed7);
}
#sian-btn .sian-kx-x {
  display: none;
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
  color: var(--sian-brand, #0b5ed7);
}
#sian-btn .sian-kx-x svg {
  width: 26px;
  height: 26px;
  stroke: var(--sian-brand, #0b5ed7);
}
#sian-btn.sian-kx-open .sian-kx-logo img,
#sian-btn.sian-kx-open .sian-kx-letter { display: none !important; }
#sian-btn.sian-kx-open .sian-kx-x {
  display: flex;
  animation: sianKxXIn 0.25s cubic-bezier(0.2,0.8,0.2,1);
}
@keyframes sianKxXIn {
  from { opacity: 0; transform: scale(0.4) rotate(-60deg); }
  to   { opacity: 1; transform: scale(1)    rotate(0deg); }
}
@media (max-width: 520px) {
  #sian-btn { width: 56px; height: 56px; }
  #sian-btn .sian-kx-logo { width: 49px; height: 49px; }
  #sian-btn .sian-kx-logo img { width: 36px; height: 36px; }
  #sian-btn .sian-kx-x svg { width: 24px; height: 24px; }
}
#sian-bubble {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 16px;
  padding: 8px 16px;
  font-size: 14px;
  line-height: 1.4;
  color: #333;
  cursor: pointer;
  z-index: 2147483646;
  max-width: 280px;
  font-family: inherit;
  box-shadow:
    0 8px 24px rgba(15, 23, 42, 0.16),
    0 2px 6px rgba(15, 23, 42, 0.08);
}
#sian-bubble .sian-bubble-img {
  display: none;
  width: auto;
  max-width: 60px;
  max-height: 26px;
  object-fit: contain;
  flex-shrink: 0;
}
#sian-bubble .sian-bubble-text {
  min-width: 0;
}
#sian-bubble::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
}
#sian-bubble.sian-bubble-left::after {
  right: -6px;
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
}
#sian-bubble.sian-bubble-right::after {
  left: -6px;
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
}
@keyframes sianBubbleInLeft {
  from { opacity: 0; transform: translateX(30px) translateY(-50%); }
  to   { opacity: 1; transform: translateX(0) translateY(-50%); }
}
@keyframes sianBubbleInRight {
  from { opacity: 0; transform: translateX(-30px) translateY(-50%); }
  to   { opacity: 1; transform: translateX(0) translateY(-50%); }
}
#sian-bubble.sian-bubble-left {
  animation: sianBubbleInLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}
#sian-bubble.sian-bubble-right {
  animation: sianBubbleInRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes sianBubbleOutLeft {
  from { opacity: 1; transform: translateX(0) translateY(-50%); }
  to   { opacity: 0; transform: translateX(30px) translateY(-50%); }
}
@keyframes sianBubbleOutRight {
  from { opacity: 1; transform: translateX(0) translateY(-50%); }
  to   { opacity: 0; transform: translateX(-30px) translateY(-50%); }
}
#sian-bubble.sian-bubble-hiding.sian-bubble-left {
  animation: sianBubbleOutLeft 0.3s cubic-bezier(0.4, 0, 1, 1) both;
}
#sian-bubble.sian-bubble-hiding.sian-bubble-right {
  animation: sianBubbleOutRight 0.3s cubic-bezier(0.4, 0, 1, 1) both;
}
#sian-iframe {
  flex: 1;
  width: 100%;
  border: none;
  display: block;
}
#sian-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 18px; height: 18px;
  border-radius: 10px; background: #ef4444;
  color: #fff; font-size: 10px; font-weight: 700;
  align-items: center; justify-content: center;
  padding: 0 4px;
  z-index: 2147483647; pointer-events: none;
}
@keyframes sian-bounce {
  0%,100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
#sian-ctxmenu {
  position: fixed;
  display: none;
  min-width: 190px;
  background: #ffffff;
  border-radius: 12px;
  padding: 6px;
  box-shadow:
    0 16px 44px rgba(15, 23, 42, 0.22),
    0 2px 8px rgba(15, 23, 42, 0.10);
  z-index: 2147483647;
  font-family: inherit;
}
#sian-ctxmenu.sian-open {
  display: block;
  animation: sianCtxIn 0.13s ease;
}
@keyframes sianCtxIn {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
#sian-ctxmenu button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: none;
  background: none;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #1f2937;
  text-align: left;
  font-family: inherit;
}
#sian-ctxmenu button:hover {
  background: #f3f4f6;
}
#sian-ctxmenu .sian-ctx-ico {
  display: flex;
  color: #6b7280;
}
#sian-hidden-toggle {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.22);
  background: rgba(15,23,42,0.72);
  color: #fff;
  cursor: pointer;
  padding: 0;
  z-index: 2147483646;
  opacity: 0.55;
  box-shadow: 0 6px 18px rgba(15,23,42,0.22);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
#sian-hidden-toggle:hover {
  opacity: 1;
  transform: translateY(-2px);
}
#sian-widget-root.sian-hide-anim {
  animation: sianRootFadeOut 0.32s ease;
}
@keyframes sianRootFadeOut {
  to { opacity: 0; }
}
#sian-widget-root.sian-hide-anim #sian-btn {
  animation: sianBtnOut 0.36s cubic-bezier(0.5, 0, 0.8, 0.4);
}
@keyframes sianBtnOut {
  0%   { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.25) translateY(46px); opacity: 0; }
}
#sian-widget-root.sian-show-anim {
  animation: sianRootFadeIn 0.4s ease;
}
@keyframes sianRootFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
#sian-widget-root.sian-show-anim #sian-btn {
  animation: sianBtnIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes sianBtnIn {
  0%   { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
#sian-hidden-toggle.sian-pop {
  animation: sianToggleIn 0.34s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes sianToggleIn {
  0%   { transform: scale(0); opacity: 0; }
  100% { transform: scale(1); }
}
`;
  document.head.appendChild(widgetStyle);

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 11 — OPEN / CLOSE / TOGGLE
  ═══════════════════════════════════════════════════════════ */
  function openPanel() {
    isOpen = true;
    clearBubbleTimers();
    bubbleHover = false;
    var panel  = document.getElementById('sian-panel');
    var bubble = document.getElementById('sian-bubble');
    if (panel)  panel.classList.add('sian-open');
    if (bubble) hideBubble(false);
    updateBadge(0);
    paint(cfg);
  }

  function closePanel() {
    isOpen = false;
    var panel  = document.getElementById('sian-panel');
    if (panel)  panel.classList.remove('sian-open');
    // La visibilidad de la burbuja la decide syncBubble() según el modo.
    paint(cfg);
  }

  function togglePanel() { if (isOpen) closePanel(); else openPanel(); }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 11b — OCULTAR / MOSTRAR WIDGET + MENÚ CONTEXTUAL
  ═══════════════════════════════════════════════════════════ */
  function onRootContextMenu(e) {
    if (isHidden) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { label: 'Ocultar widget', action: hideWidget },
    ]);
  }

  function hideWidget() {
    if (isHidden) return;
    isHidden = true;
    clearBubbleTimers();
    bubbleHover = false;
    saveHidden(true);
    animateWidgetOut();
  }

  // Oculta el widget con animación (fade del root + el botón se encoge/cae) y
  // al terminar aplica el estado oculto y hace aparecer el manejador fantasma.
  function animateWidgetOut() {
    var root   = document.getElementById(ROOT_ID);
    var toggle = document.getElementById('sian-hidden-toggle');

    if (finishHideT) { clearTimeout(finishHideT); finishHideT = null; }
    if (root) {
      root.classList.remove('sian-hide-anim');
      void root.offsetWidth;               // reinicia la animación si se repite
      root.classList.add('sian-hide-anim');
      root.style.pointerEvents = 'none';
    }

    finishHideT = setTimeout(function () {
      finishHideT = null;
      applyHiddenState();
      if (toggle) {
        toggle.style.display = 'flex';
        toggle.classList.remove('sian-pop');
        void toggle.offsetWidth;           // reinicia la aparición del fantasma
        toggle.classList.add('sian-pop');
      }
    }, 340);
  }

  function restoreWidget() {
    if (!isHidden) return;
    if (finishHideT) { clearTimeout(finishHideT); finishHideT = null; }
    isHidden = false;
    saveHidden(false);

    var root = document.getElementById(ROOT_ID);
    if (root) {
      root.classList.remove('sian-hide-anim');
      root.style.removeProperty('pointer-events');
    }
    applyHiddenState();
    syncBubble(cfg);

    if (root) {
      root.classList.remove('sian-show-anim');
      void root.offsetWidth;               // reinicia la animación de entrada
      root.classList.add('sian-show-anim');
    }
  }

  // El manejador fantasma se posiciona donde estaba el botón (mismo criterio
  // de posición, con +20px de margen para calzar el área del botón de 64px).
  function getHiddenPos(pos) {
    var base = BTN_POS[pos] || BTN_POS['bottom-right'];
    var out  = {};
    Object.keys(base).forEach(function (k) {
      var num = parseInt(base[k], 10);
      out[k] = isNaN(num) ? base[k] : (num + 20) + 'px';
    });
    return out;
  }

  function applyHiddenState() {
    var root   = document.getElementById(ROOT_ID);
    var toggle = document.getElementById('sian-hidden-toggle');
    if (isHidden) {
      closePanel();
      if (root)   root.style.display = 'none';
      if (toggle) {
        toggle.style.display = 'flex';
        applyPos(toggle, getHiddenPos(cfg.posicion));
      }
    } else {
      if (root)   root.style.display = 'block';
      if (toggle) toggle.style.display = 'none';
    }
  }

  // ── Menú contextual propio ─────────────────────────────────────
  function showContextMenu(x, y, items) {
    var el = document.getElementById('sian-ctxmenu');
    if (!el || !items || !items.length) return;
    el.innerHTML = '';
    items.forEach(function (it) {
      var btn = document.createElement('button');
      btn.setAttribute('type', 'button');
      if (it.icon) {
        var ico = document.createElement('span');
        ico.className = 'sian-ctx-ico';
        ico.innerHTML = it.icon;
        btn.appendChild(ico);
      }
      var label = document.createElement('span');
      label.textContent = it.label;
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        hideContextMenu();
        if (it.action) it.action();
      });
      el.appendChild(btn);
    });
    el.style.left = '0px';
    el.style.top  = '0px';
    el.classList.add('sian-open');
    var r = el.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(x, window.innerWidth  - r.width  - 8)) + 'px';
    el.style.top  = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  }

  function hideContextMenu() {
    var el = document.getElementById('sian-ctxmenu');
    if (el) el.classList.remove('sian-open');
  }

  // Clic derecho fuera del widget: cierra nuestro menú y deja que el
  // navegador muestre su menú normal en ese elemento.
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.closest
        && (e.target.closest('#sian-widget-root') || e.target.closest('#sian-hidden-toggle'))) {
      return;
    }
    hideContextMenu();
  });

  document.addEventListener('click', function () { hideContextMenu(); }, true);
  document.addEventListener('scroll', function () { hideContextMenu(); }, true);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') hideContextMenu();
  });

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 12 — FETCH + POLLING
  ═══════════════════════════════════════════════════════════ */
  function fetchCfg() {
    fetch(API_URL)
      .then(function (r) {
        if (!r.ok) { Log.httpError(r.status, API_URL); throw new Error('HTTP '+r.status); }
        return r.json();
      })
      .then(function (raw) {
        // Auto-actualización: si el backend reporta una widgetVersion mayor,
        // inyectamos la versión nueva (URL versionada → cache-key nuevo) y
        // dejamos que esta instancia vieja quede "stale".
        if (raw && raw.widgetVersion && raw.widgetVersion !== VERSION) {
          swapToVersion(raw.widgetVersion);
          return;
        }

        var normalized = normalizar(raw);
        var newJson    = JSON.stringify(normalized);
        var changed    = (newJson !== _prevCfgJson);
        _prevCfgJson   = newJson;

        if (!inited || changed) Log.ok(normalized);
        else Log.poll(false);
        if (changed) Log.poll(true);

        paint(normalized);
      })
      .catch(function (err) {
        if (err && err.name === 'SyntaxError') {
          Log.parseError(err);
        } else if (!inited) {
          Log.fallback(err ? err.message : 'Network error');
        }
        if (!inited) paint(Object.assign({}, DEF));
      });
  }

  /**
   * Auto-actualización: el servidor reporta una widgetVersion mayor que la de
   * esta instancia. Inyectamos un <script> con la URL versionada (cache-key
   * nuevo → el navegador NO reusa la copia inmutable vieja) y marcamos el
   * swap para que esta instancia deje de responder.
   */
  function swapToVersion(nextVersion) {
    if (SWAPPED || MY_REV !== window.__sianWidgetRev) return;
    SWAPPED = true;
    window.__sianWidgetRev += 1; // esta instancia queda stale; la nueva toma el número
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (autoT) { clearTimeout(autoT); autoT = null; }

    var script = document.createElement('script');
    script.src = API_BASE + '/widget.js?v=' + encodeURIComponent(nextVersion);
    script.async = true;
    (document.head || document.documentElement).appendChild(script);
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 13 — BOOTSTRAP
  ═══════════════════════════════════════════════════════════ */
  window.addEventListener('resize', function () {
    if (MY_REV !== window.__sianWidgetRev) return;
    if (isHidden) {
      var toggle = document.getElementById('sian-hidden-toggle');
      if (toggle) applyPos(toggle, getHiddenPos(cfg.posicion));
      return;
    }
    if (inited) paint(cfg);
  });

  var BOOTED = false;

  function init() {
    // El script puede cargarse más de una vez en la misma página: solo la
    // primera ejecución construye el widget para no duplicar el botón.
    if (BOOTED) return;
    BOOTED = true;

    buildDOM();

    // Estado "oculto por el visitante" (persistido en localStorage).
    isHidden = readHidden();
    applyHiddenState();

    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';

    if (IS_PREVIEW) {
      var previewCfg = getPreviewConfig();
      if (previewCfg) {
        // Preview desde el panel admin: pinta lo que se está editando.
        paint(Object.assign({}, DEF, previewCfg));
      } else {
        // URL directa de prueba: pinta de inmediato con defaults para no quedar
        // bloqueado si el API no responde; el fetch solo enriquece la config.
        paint(Object.assign({}, DEF));
        fetchCfg();
      }
    } else {
      // Normal mode: fetch from API + polling
      fetchCfg();
      _pollTimer = setInterval(fetchCfg, POLL_MS);
    }

    // Marca por query (?sian-proyecto=...) para probar el preview sin institución.
    if (!brandColor) {
      var debugBrand = detectDebugBrand();
      if (debugBrand) applyBrand(debugBrand.color, debugBrand.bg);
    }
    // Detección instantánea del proyecto real (color + fondo antes del chat).
    detectarProyecto();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();