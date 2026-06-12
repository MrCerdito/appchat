/**
 * widget.js — Widget de chat embebible — Sian365
 * Versión con soporte completo de todos los campos de configuración.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 1 — CONSTANTES
  ═══════════════════════════════════════════════════════════ */
  var POLL_MS  = 5000;
  var ROOT_ID  = 'sian-widget-root';
  var API_PATH = '/widget-config';

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
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 3 — LOGGER
  ═══════════════════════════════════════════════════════════ */
  var Log = {
    ok: function (data) {
      console.groupCollapsed('%c[Sian365] ✅ Config cargada desde BD', 'color:#22c55e;font-weight:700');
      console.log('Fuente          :', 'BASE DE DATOS (/widget-config)');
      console.log('Timestamp       :', new Date().toISOString());
      console.log('chatUrl         :', data.chatUrl);
      console.log('color           :', data.color);
      console.log('chatHeaderColor :', data.chatHeaderColor);
      console.log('chatBgColor     :', data.chatBgColor);
      console.log('chatMarca       :', data.chatMarca);
      console.log('tituloPanelChat :', data.tituloPanelChat);
      console.log('Payload completo:', data);
      console.groupEnd();
    },
    fallback: function (reason) {
      console.groupCollapsed('%c[Sian365] ⚠️  Usando DEFAULTS (sin BD)', 'color:#f59e0b;font-weight:700');
      console.warn('Motivo:', reason || 'Error desconocido');
      console.warn('Defaults:', DEF);
      console.groupEnd();
    },
    httpError: function (status, url) {
      console.error('%c[Sian365] ❌ Error HTTP', 'color:#ef4444;font-weight:700',
        '\nURL:', url, '\nStatus:', status);
    },
    parseError: function (err) {
      console.error('%c[Sian365] ❌ Error JSON', 'color:#ef4444;font-weight:700', err.message);
    },
    poll: function (changed) {
      if (changed) console.log('%c[Sian365] 🔄 Config actualizada por polling', 'color:#60a5fa;font-weight:700');
    },
    autoOpen: function (delay) {
      console.log('%c[Sian365] ⏱️  Auto-open en ' + delay + 's', 'color:#a78bfa');
    },
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 4 — ESTADO INTERNO
  ═══════════════════════════════════════════════════════════ */
  var cfg          = Object.assign({}, DEF);
  var isOpen       = false;
  var inited       = false;
  var autoT        = null;
  var _prevCfgJson = '';

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

  function hexToRgb(hex) {
    hex = (hex || '#2563eb').replace('#', '');
    return parseInt(hex.slice(0,2),16) + ','
         + parseInt(hex.slice(2,4),16) + ','
         + parseInt(hex.slice(4,6),16);
  }

  /** Devuelve '#ffffff' o '#111111' según luminosidad del fondo */
  function contrastColor(hex) {
    hex = (hex || '#000000').replace('#','');
    var r = parseInt(hex.slice(0,2),16);
    var g = parseInt(hex.slice(2,4),16);
    var b = parseInt(hex.slice(4,6),16);
    var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.5 ? '#111111' : '#ffffff';
  }

  function panelDims() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w  = Math.min(440, Math.max(360, Math.round(vw * 0.32)));
    var h  = Math.min(680, Math.max(520, Math.round(vh * 0.80)));
    return { w: w, h: h };
  }

  var BTN_POS = {
    'bottom-right': { bottom: '24px', right: '24px' },
    'bottom-left' : { bottom: '24px', left:  '24px' },
    'top-right'   : { top:    '24px', right: '24px' },
    'top-left'    : { top:    '24px', left:  '24px' },
  };

  function getPanelStyle(posicion, dims, size) {
    var gap = size + 12;
    var br  = '20px';
    var w   = dims.w + 'px';
    var h   = dims.h + 'px';
    var styles = {
      'bottom-right': { bottom: gap+'px', right: '24px', width: w, height: h, borderRadius: br, transformOrigin: 'bottom right' },
      'bottom-left' : { bottom: gap+'px', left:  '24px', width: w, height: h, borderRadius: br, transformOrigin: 'bottom left'  },
      'top-right'   : { top:    gap+'px', right: '24px', width: w, height: h, borderRadius: br, transformOrigin: 'top right'    },
      'top-left'    : { top:    gap+'px', left:  '24px', width: w, height: h, borderRadius: br, transformOrigin: 'top left'     },
    };
    return styles[posicion] || styles['bottom-right'];
  }

  function getBubblePos(posicion, size) {
    var off = size + 14;
    return ({
      'bottom-right': { bottom: off+'px', right: '24px' },
      'bottom-left' : { bottom: off+'px', left:  '24px' },
      'top-right'   : { top:    off+'px', right: '24px' },
      'top-left'    : { top:    off+'px', left:  '24px' },
    })[posicion] || { bottom: off+'px', right: '24px' };
  }

  function applyPos(el, map) {
    ['top','bottom','left','right'].forEach(function(k){ el.style[k] = ''; });
    Object.keys(map).forEach(function(k){
      el.style[k] = typeof map[k] === 'number' ? map[k]+'px' : map[k];
    });
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 7 — DETECCIÓN DE BASE URL
  ═══════════════════════════════════════════════════════════ */
  function getApiBase() {
    var tags = document.querySelectorAll('script[src]');
    for (var i = 0; i < tags.length; i++) {
      var s = tags[i].getAttribute('src') || '';
      if (s.indexOf('widget.js') !== -1) {
        try {
          var u = new URL(s, location.href);
          return (u.hostname === 'localhost' && u.port === '4200')
            ? 'http://localhost:3000'
            : u.origin;
        } catch (_) {}
      }
    }
    return location.origin;
  }

  var API_BASE = getApiBase();
  var API_URL  = API_BASE + API_PATH;

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 8 — NORMALIZACIÓN (TODOS LOS CAMPOS)
  ═══════════════════════════════════════════════════════════ */
  function normalizar(res) {
    return {
      // Botón flotante
      color              : res.color               || DEF.color,
      posicion           : res.posicion            || DEF.posicion,
      forma              : res.forma               || DEF.forma,
      tamano             : res.tamano              || DEF.tamano,
      icono              : res.icono               || DEF.icono,
      textoBoton         : res.textoBoton          != null ? res.textoBoton         : DEF.textoBoton,
      mostrarTexto       : res.mostrarTexto        != null ? res.mostrarTexto       : DEF.mostrarTexto,
      // Comportamiento
      abrirAutomatico    : res.abrirAutomatico     != null ? res.abrirAutomatico    : DEF.abrirAutomatico,
      delayAutoAbrir     : res.delayAutoAbrir      != null ? res.delayAutoAbrir     : DEF.delayAutoAbrir,
      mensajeBurbuja     : res.mensajeBurbuja      || DEF.mensajeBurbuja,
      mostrarBurbuja     : res.mostrarBurbuja      != null ? res.mostrarBurbuja     : DEF.mostrarBurbuja,
      chatUrl            : res.chatUrl             || DEF.chatUrl,
      // Textos del panel
      tituloPanelChat    : res.tituloPanelChat     || DEF.tituloPanelChat,
      subtituloPanelChat : res.subtituloPanelChat  || DEF.subtituloPanelChat,
      // Diseño del chat
      chatHeaderColor    : res.chatHeaderColor     || DEF.chatHeaderColor,
      chatBgColor        : res.chatBgColor         || DEF.chatBgColor,
      chatBubbleColor    : res.chatBubbleColor     || DEF.chatBubbleColor,
      chatBubbleUserColor: res.chatBubbleUserColor || DEF.chatBubbleUserColor,
      chatMarca          : res.chatMarca           || DEF.chatMarca,
    };
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
    var old = document.getElementById(ROOT_ID);
    if (old) old.remove();

    var root = document.createElement('div');
    root.id  = ROOT_ID;

    // ── Burbuja ──
    var bubble = document.createElement('div');
    bubble.id  = 'sian-bubble';
    bubble.style.display = 'none';
    bubble.addEventListener('click', openPanel);
    root.appendChild(bubble);

    // ── Panel ──
    var panel = document.createElement('div');
    panel.id  = 'sian-panel';

    // Header del panel
    var header = document.createElement('div');
    header.id  = 'sian-panel-header';

    var avatarWrap = document.createElement('div');
    avatarWrap.id  = 'sian-panel-avatar';
    avatarWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" width="20" height="20">'
      + '<path d="M12 2C6.5 2 2 6 2 11c0 2.4 1 4.6 2.6 6.2L3 22l5-1.5A10 10 0 0 0 12 22c5.5 0 10-4 10-9s-4.5-9-10-9z"/>'
      + '</svg>';

    var headerInfo = document.createElement('div');
    headerInfo.id  = 'sian-panel-header-info';

    var headerTitle = document.createElement('h3');
    headerTitle.id  = 'sian-panel-title';

    var headerSub = document.createElement('p');
    headerSub.id  = 'sian-panel-sub';

    var onlineDot = document.createElement('span');
    onlineDot.id  = 'sian-online-dot';

    var subText = document.createElement('span');
    subText.id   = 'sian-panel-sub-text';

    headerSub.appendChild(onlineDot);
    headerSub.appendChild(subText);
    headerInfo.appendChild(headerTitle);
    headerInfo.appendChild(headerSub);
    header.appendChild(avatarWrap);
    header.appendChild(headerInfo);
    panel.appendChild(header);

    // Iframe
    var iframe = document.createElement('iframe');
    iframe.id  = 'sian-iframe';
    iframe.setAttribute('allow', 'microphone; camera');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('title', 'Sian365 Chat');
    panel.appendChild(iframe);

    // Powered by
    var powered = document.createElement('div');
    powered.id  = 'sian-powered';
    powered.innerHTML = 'Powered by <a href="#" style="color:inherit;text-decoration:underline">Sian365</a>';
    panel.appendChild(powered);

    root.appendChild(panel);

    // ── Botón flotante ──
    var btn = document.createElement('button');
    btn.id  = 'sian-btn';
    btn.setAttribute('aria-label', 'Abrir chat');
    btn.addEventListener('click', togglePanel);
    root.appendChild(btn);

    document.body.appendChild(root);
  }


  // ─── Dimensiones del panel en desktop ─────────────────────────────────────
  function panelDims() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // Ancho: entre 360 y 440px, máximo 95vw
    var w  = Math.min(440, Math.max(360, Math.round(vw * 0.32)));
    // Alto: entre 520 y 680px, máximo 85vh
    // El chat necesita altura suficiente para mostrar el formulario completo
    var h  = Math.min(680, Math.max(520, Math.round(vh * 0.80)));
    return { w: w, h: h };
  }

  // ─── Posiciones CSS ───────────────────────────────────────────────────────
  var BTN_POS = {
    'bottom-right': { bottom: '5px', right: '24px' },
    'bottom-left' : { bottom: '24px', left:  '24px' },
    'top-right'   : { top:    '24px', right: '24px' },
    'top-left'    : { top:    '24px', left:  '24px' },
  };

  function getPanelStyle(posicion, dims, size) {
    // Offset vertical: tamaño del botón + 12px de gap
    var gap = size + 12;
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

  function getBubblePos(posicion, size) {
  var gap = 10; // espacio entre botón y burbuja

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
    ['top', 'bottom', 'left', 'right'].forEach(function (k) { el.style[k] = ''; });
    Object.keys(map).forEach(function (k) { el.style[k] = typeof map[k] === 'number' ? map[k] + 'px' : map[k]; });
  }

  // ─── Pintar config en el DOM ──────────────────────────────────────────────

  function paint(c) {
    cfg = c;
    var size    = btnSize();
    var hasText = cfg.mostrarTexto && cfg.textoBoton;
    var dims    = panelDims();
    var iconKey = isOpen ? 'close' : (cfg.icono || 'chat');
    var iconSz  = Math.round(size * 0.44);

    // ── Botón flotante ──
    var btn = document.getElementById('sian-btn');
    if (btn) {
      var rgb = hexToRgb(cfg.color);
      btn.style.background = cfg.color;
      btn.style.boxShadow  = '0 4px 18px rgba('+rgb+',0.40), 0 1px 4px rgba('+rgb+',0.25)';

      if (hasText && !isOpen) {
        btn.style.height       = size + 'px';
        btn.style.width        = 'auto';
        btn.style.borderRadius = size + 'px';
        btn.style.padding      = '0 20px';
        btn.innerHTML = makeSvg(iconKey, iconSz, 2.2)
          + '<span style="color:white;font-weight:600">' + cfg.textoBoton + '</span>';
      } else {
        btn.style.width        = size + 'px';
        btn.style.height       = size + 'px';
        btn.style.borderRadius = btnRadius();
        btn.style.padding      = '0';
        btn.innerHTML = makeSvg(iconKey, iconSz, isOpen ? 2.5 : 2.2);
      }

      applyPos(btn, BTN_POS[cfg.posicion] || BTN_POS['bottom-right']);
      btn.setAttribute('aria-label', isOpen ? 'Cerrar chat' : 'Abrir chat');
    }

    // ── Burbuja ──
    var bubble = document.getElementById('sian-bubble');
    if (bubble) {
      if (cfg.mostrarBurbuja && cfg.mensajeBurbuja && !isOpen) {
        bubble.textContent = cfg.mensajeBurbuja;
        applyPos(bubble, getBubblePos(cfg.posicion, size));
        bubble.style.display = 'block';
      } else {
        bubble.style.display = 'none';
      }
    }

    // ── Header del panel — color, marca, título, subtítulo ──
    var panelHeader = document.getElementById('sian-panel-header');
    if (panelHeader) {
      panelHeader.style.background = cfg.chatHeaderColor;
    }

    var panelTitle = document.getElementById('sian-panel-title');
    if (panelTitle) {
      panelTitle.textContent = cfg.chatMarca || cfg.tituloPanelChat || DEF.tituloPanelChat;
      panelTitle.style.color = '#ffffff';
    }

    var panelSubText = document.getElementById('sian-panel-sub-text');
    if (panelSubText) {
      panelSubText.textContent = cfg.subtituloPanelChat || DEF.subtituloPanelChat;
      panelSubText.style.color = 'rgba(255,255,255,0.78)';
    }

    // ── Panel (posición y tamaño) ──
    var panel = document.getElementById('sian-panel');
    if (panel && !isMobile()) {
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
      iframe.style.background = cfg.chatBgColor;
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

    inited = true;
  }

  /**
   * Envía el tema de colores al iframe del chat vía postMessage.
   * El chat (Angular/React/etc.) debe escuchar 'sian-theme' y aplicar los CSS vars.
   */
  function sendThemeToIframe(iframe, c) {
    try {
      var targetOrigin = (c.chatUrl || '').replace(/\/chat\/?$/, '').replace(/\/+$/, '') || '*';
      iframe.addEventListener('load', function onLoad() {
        iframe.removeEventListener('load', onLoad);
        try {
          iframe.contentWindow.postMessage({
            type              : 'sian-theme',
            chatHeaderColor   : c.chatHeaderColor,
            chatBgColor       : c.chatBgColor,
            chatBubbleColor   : c.chatBubbleColor,
            chatBubbleUserColor: c.chatBubbleUserColor,
            chatMarca         : c.chatMarca,
          }, targetOrigin);
        } catch (_) {}
      });
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 11 — OPEN / CLOSE / TOGGLE
  ═══════════════════════════════════════════════════════════ */
  function openPanel() {
    isOpen = true;
    var panel  = document.getElementById('sian-panel');
    var bubble = document.getElementById('sian-bubble');
    if (panel)  panel.classList.add('sian-open');
    if (bubble) bubble.style.display = 'none';
    paint(cfg);
  }

  function closePanel() {
    isOpen = false;
    var panel  = document.getElementById('sian-panel');
    var bubble = document.getElementById('sian-bubble');
    if (panel)  panel.classList.remove('sian-open');
    if (bubble && cfg.mostrarBurbuja && cfg.mensajeBurbuja) bubble.style.display = 'block';
    paint(cfg);
  }

  function togglePanel() { if (isOpen) closePanel(); else openPanel(); }

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
        } else {
          console.warn('%c[Sian365] ⚠️  Polling falló', 'color:#f59e0b',
            '| Error:', err ? err.message : 'desconocido');
        }
        if (!inited) paint(Object.assign({}, DEF));
      });
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 13 — BOOTSTRAP
  ═══════════════════════════════════════════════════════════ */
  window.addEventListener('resize', function () { if (inited) paint(cfg); });

  function init() {
    buildDOM();
    fetchCfg();
    setInterval(fetchCfg, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();