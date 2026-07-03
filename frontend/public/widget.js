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
    ok: function () {},
    fallback: function () {},
    httpError: function () {},
    parseError: function () {},
    poll: function () {},
    autoOpen: function () {},
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
     SECCIÓN 4b — ESTADO ADICIONAL
  ═══════════════════════════════════════════════════════════ */
  var unreadCount = 0;
  var badgeEl = null;

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

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 7 — DETECCIÓN DE BASE URL Y DATA ATTRIBUTES
  ═══════════════════════════════════════════════════════════ */
  var _scriptTag = null;

  function getScriptTag() {
    if (_scriptTag) return _scriptTag;
    var tags = document.querySelectorAll('script[src]');
    for (var i = 0; i < tags.length; i++) {
      var s = tags[i].getAttribute('src') || '';
      if (s.indexOf('widget.js') !== -1) {
        _scriptTag = tags[i];
        return _scriptTag;
      }
    }
    return null;
  }

  function getApiBase() {
    var tag = getScriptTag();
    if (!tag) return location.origin;
    try {
      var src = tag.getAttribute('src') || '';
      var u = new URL(src, location.href);
      return (u.hostname === 'localhost' && u.port === '4200')
        ? 'http://localhost:3000'
        : u.origin;
    } catch (_) {
      return location.origin;
    }
  }

  var API_BASE = getApiBase();
  var API_URL  = API_BASE + API_PATH;

  // ── Data attributes sobreescritura ─────────────────────────────────────────
  function getDataAttr(name) {
    var tag = getScriptTag();
    return tag ? (tag.getAttribute('data-' + name) || '') : '';
  }

  var IS_PREVIEW     = getDataAttr('preview') === 'true';
  var DATA_CHAT_URL  = getDataAttr('chat-url') || '';

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
        'mensajeBurbuja', 'mostrarBurbuja', 'chatUrl',
        'tituloPanelChat', 'subtituloPanelChat',
        'chatHeaderColor', 'chatBgColor',
        'chatBubbleColor', 'chatBubbleUserColor', 'chatMarca',
      ];
      fields.forEach(function (f) {
        var v = p.get(f);
        if (v !== null) {
          if (f === 'mostrarTexto' || f === 'abrirAutomatico' || f === 'mostrarBurbuja') {
            cfg[f] = v === 'true';
          } else if (f === 'delayAutoAbrir') {
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

    // ── Botón flotante ──
    var btn = document.createElement('button');
    btn.id  = 'sian-btn';
    btn.setAttribute('aria-label', 'Abrir chat');
    btn.addEventListener('click', togglePanel);
    root.appendChild(btn);

    // ── Badge de no-leídos ──
    var badge = document.createElement('span');
    badge.id  = 'sian-badge';
    badge.style.display = 'none';
    btn.appendChild(badge);
    badgeEl = badge;

    document.body.appendChild(root);
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
      var gap = 4;
      var styles = {
        'bottom-right': { bottom: gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'bottom center' },
        'bottom-left' : { bottom: gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'bottom center' },
        'top-right'   : { top:    gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'top center'    },
        'top-left'    : { top:    gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'top center'    },
      };
      return styles[posicion] || styles['bottom-right'];
    }
    // Desktop
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

    // data-chat-url sobreescribe cualquier config de la API
    if (DATA_CHAT_URL) {
      cfg.chatUrl = DATA_CHAT_URL;
    }
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

  // ── Restaurar título al hacer foco ────────────────────────────────────────
  window.addEventListener('focus', function () {
    document.title = (cfg.chatMarca || cfg.tituloPanelChat || 'Chat');
  });

  // ── Escuchar mensajes del iframe ──────────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'unread_count') {
      updateBadge(event.data.count);
    }
    if (event.data && event.data.type === 'sian-close-panel') {
      closePanel();
    }
  });

  // ── Estilos base del widget ────────────────────────────────────────────
  var widgetStyle = document.createElement('style');
  widgetStyle.textContent = `
#sian-widget-root {
  display: block;
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
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  z-index: 2147483647;
  background: #fff;
  flex-direction: column;
}
#sian-panel.sian-open {
  display: flex;
  animation: sianFadeIn 0.25s ease forwards;
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
  gap: 8px;
  cursor: pointer;
  border: none;
  outline: none;
  z-index: 2147483647;
  transition: opacity 0.2s, transform 0.15s;
  font-family: inherit;
}
#sian-btn:hover {
  opacity: 0.9;
  transform: scale(1.05);
}
#sian-btn:active {
  transform: scale(0.95);
}
#sian-bubble {
  position: fixed;
  background: #fff;
  border-radius: 16px;
  padding: 12px 18px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  font-size: 14px;
  line-height: 1.4;
  color: #333;
  cursor: pointer;
  z-index: 2147483646;
  max-width: 260px;
  font-family: inherit;
  animation: sianFloat 3s ease-in-out infinite;
}
#sian-bubble::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  transform: rotate(45deg);
}
#sian-bubble::after {
  bottom: -5px;
  right: 20px;
}
@keyframes sianFloat {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
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
  padding: 0 4px; box-shadow: 0 2px 6px rgba(239,68,68,0.4);
  z-index: 2147483647; pointer-events: none;
}
@keyframes sian-bounce {
  0%,100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
`;
  document.head.appendChild(widgetStyle);

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 11 — OPEN / CLOSE / TOGGLE
  ═══════════════════════════════════════════════════════════ */
  function openPanel() {
    isOpen = true;
    var panel  = document.getElementById('sian-panel');
    var bubble = document.getElementById('sian-bubble');
    if (panel)  panel.classList.add('sian-open');
    if (bubble) bubble.style.display = 'none';
    updateBadge(0);
    document.title = (cfg.chatMarca || cfg.tituloPanelChat || 'Chat');
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

    if (IS_PREVIEW) {
      var previewCfg = getPreviewConfig();
      if (previewCfg) {
        paint(Object.assign({}, DEF, previewCfg));
      } else {
        fetchCfg();
      }
    } else {
      // Normal mode: fetch from API + polling
      fetchCfg();
      setInterval(fetchCfg, POLL_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();