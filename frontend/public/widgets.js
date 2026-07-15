/**
 * widgets.js — Sian Widget Web Component v2
 *
 * Uso como Web Component:
 *   <sian-widget api-base="/agora" color="#2563eb"></sian-widget>
 *
 * Uso como script clásico (auto-init):
 *   <script src="widgets.js" data-api-base="https://ejemplo.com/agora" defer></script>
 *
 * Uso programático:
 *   <script src="widgets.js"></script>
 *   <script>
 *     const w = new SianWidget({ apiBase: '/agora' });
 *     w.on('unread', count => console.log(count));
 *   </script>
 *
 * Características:
 *   - Custom Element <sian-widget> con Shadow DOM
 *   - Múltiples instancias independientes en la misma página
 *   - data-api-base para especificar URL del backend
 *   - API programática con eventos
 *   - Sin dependencias externas
 */
(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 1 — CONSTANTES
  ═══════════════════════════════════════════════════════════ */
  var POLL_MS  = 5000;
  var API_PATH = '/widget-config';
  var DEF = {
    color              : '#2563eb',
    posicion           : 'bottom-right',
    forma              : 'circle',
    tamano             : 'md',
    icono              : 'chat',
    textoBoton         : '',
    mostrarTexto       : false,
    abrirAutomatico    : false,
    delayAutoAbrir     : 5,
    mensajeBurbuja     : '¿Necesitas ayuda? ¡Chatea con nosotros!',
    mostrarBurbuja     : true,
    chatUrl            : 'http://localhost:4200/chat',
    tituloPanelChat    : 'Soporte en línea',
    subtituloPanelChat : 'Estamos aquí para ayudarte',
    chatHeaderColor    : '#1a1a1a',
    chatBgColor        : '#f0ede9',
    chatBubbleColor    : '#ffffff',
    chatBubbleUserColor: '#1a1a1a',
    chatMarca          : 'Soporte en línea',
  };
  var SIZES = { sm: 44, md: 56, lg: 68 };
  var RADII = { sm: '14px', md: '18px', lg: '22px' };

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
     SECCIÓN 2 — HELPERS
  ═══════════════════════════════════════════════════════════ */
  function hexToRgb(hex) {
    hex = (hex || '#2563eb').replace('#', '');
    return parseInt(hex.slice(0,2),16) + ','
         + parseInt(hex.slice(2,4),16) + ','
         + parseInt(hex.slice(4,6),16);
  }

  function contrastColor(hex) {
    hex = (hex || '#000000').replace('#','');
    var r = parseInt(hex.slice(0,2),16);
    var g = parseInt(hex.slice(2,4),16);
    var b = parseInt(hex.slice(4,6),16);
    var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.5 ? '#111111' : '#ffffff';
  }

  function deepAssign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) {
        for (var k in src) {
          if (Object.prototype.hasOwnProperty.call(src, k)) {
            target[k] = src[k];
          }
        }
      }
    }
    return target;
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 3 — CLASE SIAN WIDGET
  ═══════════════════════════════════════════════════════════ */
  var _instId = 0;
  var _allWidgets = [];

  function SianWidget(options) {
    options = options || {};

    var self = this;

    self._uid    = 'sian-w-' + (++_instId);
    self._events = {};

    // ── Resolver apiBase ──
    if (options.apiBase) {
      self._apiBase = String(options.apiBase).replace(/\/+$/, '');
    } else {
      self._apiBase = self._detectApiBase();
    }
    self._apiUrl = self._apiBase + API_PATH;

    // ── Resolver contenedor ──
    if (typeof options.container === 'string') {
      self._container = document.querySelector(options.container);
    } else if (options.container && options.container.nodeType) {
      self._container = options.container;
    } else {
      self._container = document.body;
    }

    // ── Config inicial ──
    self._config    = deepAssign({}, DEF, options.config || {});
    self._isOpen    = false;
    self._inited    = false;
    self._unread    = 0;
    self._prevJson  = '';
    self._autoT     = null;
    self._pollT     = null;
    self._msgHandler = null;
    self._resizeHandler = null;

    // Atributos HTML del custom element sobreescriben config
    if (options._attrs) {
      self._applyAttrs(options._attrs);
    }

    self._buildDOM();
    self._poll();

    if (self._config.abrirAutomatico) {
      self._autoT = setTimeout(function () { self.open(); }, self._config.delayAutoAbrir * 1000);
    }

    self._emit('init', { uid: self._uid });
    _allWidgets.push(self);
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 4 — API PÚBLICA
  ═══════════════════════════════════════════════════════════ */
  SianWidget.prototype.open = function () {
    var self = this;
    self._isOpen = true;
    var panel  = self._root.querySelector('.sian-panel');
    var bubble = self._root.querySelector('.sian-bubble');
    if (panel)  panel.classList.add('sian-open');
    if (bubble) bubble.style.display = 'none';
    self._updateBadge(0);
    document.title = (self._config.chatMarca || self._config.tituloPanelChat || 'Chat');
    self._paint(self._config);
    self._emit('open');
  };

  SianWidget.prototype.close = function () {
    var self = this;
    self._isOpen = false;
    var panel  = self._root.querySelector('.sian-panel');
    var bubble = self._root.querySelector('.sian-bubble');
    if (panel)  panel.classList.remove('sian-open');
    if (bubble && self._config.mostrarBurbuja && self._config.mensajeBurbuja) bubble.style.display = 'block';
    self._paint(self._config);
    self._emit('close');
  };

  SianWidget.prototype.toggle = function () {
    if (this._isOpen) this.close(); else this.open();
  };

  SianWidget.prototype.setConfig = function (updates) {
    deepAssign(this._config, updates || {});
    if (this._inited) this._paint(this._config);
  };

  SianWidget.prototype.destroy = function () {
    var self = this;
    if (self._autoT)  clearTimeout(self._autoT);
    if (self._pollT)  clearInterval(self._pollT);
    if (self._msgHandler) window.removeEventListener('message', self._msgHandler);
    if (self._resizeHandler) window.removeEventListener('resize', self._resizeHandler);
    if (self._root && self._root.parentNode) self._root.parentNode.removeChild(self._root);
    var idx = _allWidgets.indexOf(self);
    if (idx >= 0) _allWidgets.splice(idx, 1);
    self._emit('destroy');
  };

  SianWidget.prototype.on = function (event, cb) {
    var self = this;
    if (!self._events[event]) self._events[event] = [];
    self._events[event].push(cb);
    return function () { self.off(event, cb); };
  };

  SianWidget.prototype.off = function (event, cb) {
    var list = this._events[event];
    if (!list) return;
    if (cb) {
      this._events[event] = list.filter(function (f) { return f !== cb; });
    } else {
      this._events[event] = [];
    }
  };

  SianWidget.prototype._emit = function (event, data) {
    var list = this._events[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (_) {}
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 5 — DETECCIÓN DE API BASE
  ═══════════════════════════════════════════════════════════ */
  SianWidget.prototype._detectApiBase = function () {
    var tags = document.querySelectorAll('script[src]');
    for (var i = 0; i < tags.length; i++) {
      var src = tags[i].getAttribute('src') || '';
      if (src.indexOf('widgets.js') !== -1 || src.indexOf('widget.js') !== -1) {
        try {
          var u = new URL(src, location.href);
          if (u.hostname === 'localhost' && u.port === '4200') {
            return 'http://localhost:3000';
          }
          var dir = src.substring(0, src.lastIndexOf('/'));
          if (dir) {
            var baseUrl = u.origin + (dir.startsWith('/') ? dir : '/' + dir);
            return baseUrl.replace(/\/+$/, '');
          }
          return u.origin;
        } catch (_) {
          return location.origin;
        }
      }
    }
    return location.origin;
  };

  SianWidget.prototype._applyAttrs = function (attrs) {
    var self = this;
    var map = {
      'color': 'color',
      'position': 'posicion',
      'shape': 'forma',
      'size': 'tamano',
      'icon': 'icono',
      'auto-open': 'abrirAutomatico',
      'chat-url': 'chatUrl',
      'bubble-text': 'mensajeBurbuja',
      'show-bubble': 'mostrarBurbuja',
      'button-text': 'textoBoton',
      'show-text': 'mostrarTexto',
    };
    for (var attr in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, attr)) {
        var val = attrs[attr];
        var key = map[attr] || attr;
        if (key === 'abrirAutomatico' || key === 'mostrarTexto' || key === 'mostrarBurbuja') {
          self._config[key] = val === 'true' || val === true;
        } else if (key === 'delayAutoAbrir') {
          self._config[key] = parseInt(val, 10) || DEF[key];
        } else if (key === 'tamano') {
          self._config[key] = SIZES[val] ? val : 'md';
        } else if (val !== null && val !== undefined && val !== '') {
          self._config[key] = val;
        }
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 6 — DOM Y SHADOW
  ═══════════════════════════════════════════════════════════ */
  SianWidget.prototype._buildDOM = function () {
    var self = this;
    var cfg = self._config;

    // ── Crear host element si no existe ──
    if (!self._hostEl) {
      self._hostEl = document.createElement('div');
      self._hostEl.id = self._uid + '-host';
      self._hostEl.style.display = 'none';
      self._container.appendChild(self._hostEl);
    }

    // ── Shadow DOM ──
    self._root = self._hostEl.attachShadow ? self._hostEl.attachShadow({ mode: 'open' }) : self._hostEl;
    self._root.innerHTML = '';

    // ── Estilos encapsulados ──
    var style = document.createElement('style');
    style.textContent = [
      ':host{display:block}',
      ':host *,:host *::before,:host *::after{box-sizing:border-box}',
      '.sian-panel{position:fixed;display:none;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.18);z-index:2147483647;background:#fff;flex-direction:column}',
      '.sian-panel.sian-open{display:flex;animation:sianFadeIn .25s ease forwards}',
      '@keyframes sianFadeIn{from{opacity:0;transform:scale(0.92) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '.sian-btn{position:fixed;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;border:none;outline:none;z-index:2147483647;transition:opacity .2s,transform .15s;font-family:inherit}',
      '.sian-btn:hover{opacity:.9;transform:scale(1.05)}',
      '.sian-btn:active{transform:scale(.95)}',
      '.sian-bubble{position:fixed;background:#fff;border-radius:16px;padding:12px 18px;box-shadow:0 4px 16px rgba(0,0,0,0.12);font-size:14px;line-height:1.4;color:#333;cursor:pointer;z-index:2147483646;max-width:260px;font-family:inherit;animation:sianFloat 3s ease-in-out infinite}',
      '.sian-bubble::after{content:"";position:absolute;width:12px;height:12px;background:#fff;transform:rotate(45deg);bottom:-5px;right:20px}',
      '@keyframes sianFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '.sian-iframe{flex:1;width:100%;border:none;display:block}',
      '.sian-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:10px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center;padding:0 4px;box-shadow:0 2px 6px rgba(239,68,68,0.4);z-index:2147483647;pointer-events:none;display:none}',
      '@keyframes sianBounce{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}',
    ].join('');

    // ── Elementos ──
    var bubble = document.createElement('div');
    bubble.className = 'sian-bubble';
    bubble.style.display = 'none';
    bubble.addEventListener('click', function () { self.open(); });

    var panel = document.createElement('div');
    panel.className = 'sian-panel';

    var iframe = document.createElement('iframe');
    iframe.className = 'sian-iframe';
    iframe.setAttribute('allow', 'microphone; camera');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('title', 'Sian365 Chat');
    panel.appendChild(iframe);

    var btn = document.createElement('button');
    btn.className = 'sian-btn';
    btn.setAttribute('aria-label', 'Abrir chat');
    btn.addEventListener('click', function () { self.toggle(); });

    var badge = document.createElement('span');
    badge.className = 'sian-badge';
    btn.appendChild(badge);

    self._root.appendChild(style);
    self._root.appendChild(bubble);
    self._root.appendChild(panel);
    self._root.appendChild(btn);

    self._cache = {
      panel: panel,
      btn: btn,
      bubble: bubble,
      iframe: iframe,
      badge: badge,
    };

    // ── postMessage listener ──
    self._msgHandler = function (event) {
      if (event.data && event.data.type === 'unread_count') {
        self._updateBadge(event.data.count);
      }
      if (event.data && event.data.type === 'sian-close-panel') {
        self.close();
      }
    };
    window.addEventListener('message', self._msgHandler);

    // ── Resize ──
    self._resizeHandler = function () {
      if (self._inited) self._paint(self._config);
    };
    window.addEventListener('resize', self._resizeHandler);

    // ── Focus restore ──
    window.addEventListener('focus', function () {
      document.title = (cfg.chatMarca || cfg.tituloPanelChat || 'Chat');
    });

    // Mostrar host
    self._hostEl.style.display = '';
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 7 — PAINT (aplicar config al DOM)
  ═══════════════════════════════════════════════════════════ */
  SianWidget.prototype._btnSize = function () { return SIZES[this._config.tamano] || 56; };
  SianWidget.prototype._btnRadius = function () {
    return this._config.forma === 'circle' ? '50%' : (RADII[this._config.tamano] || '18px');
  };
  SianWidget.prototype._isMobile = function () { return window.innerWidth <= 520; };

  SianWidget.prototype._panelDims = function () {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (vw <= 520) {
      return { w: Math.round(vw - 8), h: Math.round(vh - 8), mobile: true };
    }
    return {
      w: Math.min(440, Math.max(360, Math.round(vw * 0.32))),
      h: Math.min(680, Math.max(520, Math.round(vh * 0.80))),
      mobile: false,
    };
  };

  var BTN_POS = {
    'bottom-right': { bottom: '5px', right: '24px' },
    'bottom-left' : { bottom: '24px', left:  '24px' },
    'top-right'   : { top:    '24px', right: '24px' },
    'top-left'    : { top:    '24px', left:  '24px' },
  };

  SianWidget.prototype._getPanelStyle = function (posicion, dims, size) {
    if (dims.mobile) {
      var gap = 4;
      var mStyles = {
        'bottom-right': { bottom: gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'bottom center' },
        'bottom-left' : { bottom: gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'bottom center' },
        'top-right'   : { top: gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'top center' },
        'top-left'    : { top: gap + 'px', left: '4px', width: dims.w + 'px', height: dims.h + 'px', borderRadius: '20px', transformOrigin: 'top center' },
      };
      return mStyles[posicion] || mStyles['bottom-right'];
    }
    var gap = size + 12;
    var w = dims.w + 'px';
    var h = dims.h + 'px';
    var dStyles = {
      'bottom-right': { bottom: gap + 'px', right: '24px', width: w, height: h, borderRadius: '20px', transformOrigin: 'bottom right' },
      'bottom-left' : { bottom: gap + 'px', left:  '24px', width: w, height: h, borderRadius: '20px', transformOrigin: 'bottom left' },
      'top-right'   : { top: gap + 'px', right: '24px', width: w, height: h, borderRadius: '20px', transformOrigin: 'top right' },
      'top-left'    : { top: gap + 'px', left:  '24px', width: w, height: h, borderRadius: '20px', transformOrigin: 'top left' },
    };
    return dStyles[posicion] || dStyles['bottom-right'];
  };

  SianWidget.prototype._getBubblePos = function (posicion, size) {
    var gap = 10;
    var map = {
      'bottom-right': { bottom: '14px', right: (size + gap + 24) + 'px' },
      'bottom-left' : { bottom: '24px', left: (size + gap + 24) + 'px' },
      'top-right'   : { top: '24px', right: (size + gap + 24) + 'px' },
      'top-left'    : { top: '24px', left: (size + gap + 24) + 'px' },
    };
    return map[posicion] || map['bottom-right'];
  };

  function applyPos(el, map) {
    ['top','bottom','left','right'].forEach(function (k) { el.style[k] = ''; });
    Object.keys(map).forEach(function (k) { el.style[k] = typeof map[k] === 'number' ? map[k] + 'px' : map[k]; });
  }

  function buildChatSrc(baseUrl) {
    if (!baseUrl) return '';
    var base = baseUrl.replace(/\/+$/, '');
    return base.endsWith('/chat') ? base : base + '/chat';
  }

  SianWidget.prototype._paint = function (c) {
    var self = this;
    self._config = c;

    var size    = self._btnSize();
    var hasText = c.mostrarTexto && c.textoBoton;
    var dims    = self._panelDims();
    var iconKey = self._isOpen ? 'close' : (c.icono || 'chat');
    var iconSz  = Math.round(size * 0.44);

    // ── Botón ──
    var btn = self._cache.btn;
    if (btn) {
      var rgb = hexToRgb(c.color);
      btn.style.background = c.color;
      btn.style.boxShadow  = '0 4px 18px rgba('+rgb+',0.40), 0 1px 4px rgba('+rgb+',0.25)';

      if (hasText && !self._isOpen) {
        btn.style.height       = size + 'px';
        btn.style.width        = 'auto';
        btn.style.borderRadius = size + 'px';
        btn.style.padding      = '0 20px';
        btn.innerHTML = makeSvg(iconKey, iconSz, 2.2)
          + '<span style="color:white;font-weight:600;margin-left:6px">' + c.textoBoton + '</span>';
      } else {
        btn.style.width        = size + 'px';
        btn.style.height       = size + 'px';
        btn.style.borderRadius = self._btnRadius();
        btn.style.padding      = '0';
        btn.innerHTML = makeSvg(iconKey, iconSz, self._isOpen ? 2.5 : 2.2);
      }

      applyPos(btn, BTN_POS[c.posicion] || BTN_POS['bottom-right']);
      btn.setAttribute('aria-label', self._isOpen ? 'Cerrar chat' : 'Abrir chat');
    }

    // ── Burbuja ──
    var bubble = self._cache.bubble;
    if (bubble) {
      if (c.mostrarBurbuja && c.mensajeBurbuja && !self._isOpen) {
        bubble.textContent = c.mensajeBurbuja;
        applyPos(bubble, self._getBubblePos(c.posicion, size));
        bubble.style.display = 'block';
      } else {
        bubble.style.display = 'none';
      }
    }

    // ── Panel ──
    var panel = self._cache.panel;
    if (panel) {
      var ps = self._getPanelStyle(c.posicion, dims, size);
      ['top','bottom','left','right','width','height','borderRadius','transformOrigin'].forEach(function (k) { panel.style[k] = ''; });
      Object.keys(ps).forEach(function (k) { panel.style[k] = ps[k]; });
    }

    // ── Iframe ──
    var iframe = self._cache.iframe;
    if (iframe) {
      var chatSrc = buildChatSrc(c.chatUrl);
      if (iframe.getAttribute('data-src') !== chatSrc) {
        iframe.setAttribute('data-src', chatSrc);
        iframe.src = chatSrc;
      }
      iframe.style.background = c.chatBgColor;
      iframe.style.width   = '100%';
      iframe.style.height  = '100%';
      iframe.style.border  = 'none';
      iframe.style.display = 'block';
      self._sendThemeToIframe(iframe, c);
    }

    // ── Auto-open (solo primera vez) ──
    if (!self._inited && c.abrirAutomatico) {
      if (self._autoT) clearTimeout(self._autoT);
      self._autoT = setTimeout(function () { self.open(); }, c.delayAutoAbrir * 1000);
    }

    self._inited = true;
  };

  SianWidget.prototype._sendThemeToIframe = function (iframe, c) {
    var self = this;
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
  };

  SianWidget.prototype._updateBadge = function (count) {
    var self = this;
    self._unread = count;
    var badge = self._cache.badge;
    if (!badge) return;
    if (count > 0 && !self._isOpen) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
      var btn = self._cache.btn;
      if (btn) btn.style.animation = 'sianBounce 0.4s ease';
    } else {
      badge.style.display = 'none';
      if (self._cache.btn) self._cache.btn.style.animation = '';
    }
    self._emit('unread', count);
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 8 — NORMALIZACIÓN DE CONFIG
  ═══════════════════════════════════════════════════════════ */
  function normalizar(res) {
    return {
      color              : res.color               || DEF.color,
      posicion           : res.posicion            || DEF.posicion,
      forma              : res.forma               || DEF.forma,
      tamano             : res.tamano              || DEF.tamano,
      icono              : res.icono               || DEF.icono,
      textoBoton         : res.textoBoton          != null ? res.textoBoton         : DEF.textoBoton,
      mostrarTexto       : res.mostrarTexto        != null ? res.mostrarTexto       : DEF.mostrarTexto,
      abrirAutomatico    : res.abrirAutomatico     != null ? res.abrirAutomatico    : DEF.abrirAutomatico,
      delayAutoAbrir     : res.delayAutoAbrir      != null ? res.delayAutoAbrir     : DEF.delayAutoAbrir,
      mensajeBurbuja     : res.mensajeBurbuja      || DEF.mensajeBurbuja,
      mostrarBurbuja     : res.mostrarBurbuja      != null ? res.mostrarBurbuja     : DEF.mostrarBurbuja,
      chatUrl            : res.chatUrl             || DEF.chatUrl,
      tituloPanelChat    : res.tituloPanelChat     || DEF.tituloPanelChat,
      subtituloPanelChat : res.subtituloPanelChat  || DEF.subtituloPanelChat,
      chatHeaderColor    : res.chatHeaderColor     || DEF.chatHeaderColor,
      chatBgColor        : res.chatBgColor         || DEF.chatBgColor,
      chatBubbleColor    : res.chatBubbleColor     || DEF.chatBubbleColor,
      chatBubbleUserColor: res.chatBubbleUserColor || DEF.chatBubbleUserColor,
      chatMarca          : res.chatMarca           || DEF.chatMarca,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 9 — FETCH + POLLING
  ═══════════════════════════════════════════════════════════ */
  SianWidget.prototype._poll = function () {
    var self = this;

    function fetchCfg() {
      fetch(self._apiUrl)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (raw) {
          var normalized = normalizar(raw);
          var newJson    = JSON.stringify(normalized);
          var changed    = (newJson !== self._prevJson);
          self._prevJson = newJson;
          if (!self._inited || changed) self._emit('config', normalized);
          if (changed) self._paint(normalized);
        })
        .catch(function () {
          if (!self._inited) self._paint(deepAssign({}, DEF));
        });
    }

    fetchCfg();
    self._pollT = setInterval(fetchCfg, POLL_MS);
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 10 — CUSTOM ELEMENT <sian-widget>
  ═══════════════════════════════════════════════════════════ */
  var WIDGET_INSTANCES = new WeakMap();

  function SianWidgetElement() {
    var el = Reflect.construct(HTMLElement, [], SianWidgetElement);
    el._widgetReady = false;
    return el;
  }
  SianWidgetElement.prototype = Object.create(HTMLElement.prototype);
  SianWidgetElement.prototype.constructor = SianWidgetElement;

  SianWidgetElement.observedAttributes = [
    'api-base', 'color', 'position', 'size', 'shape', 'icon',
    'auto-open', 'chat-url', 'bubble-text', 'show-bubble',
    'button-text', 'show-text', 'container'
  ];

  SianWidgetElement.prototype.connectedCallback = function () {
    var el = this;
    if (el._widgetReady) return;
    el._widgetReady = true;

    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      attrs[attr.name] = attr.value;
    }

    var options = {
      _attrs: attrs,
    };
    if (attrs['api-base']) options.apiBase = attrs['api-base'];
    if (attrs['container']) {
      options.container = attrs['container'];
    } else {
      options.container = el.parentNode || document.body;
    }

    var widget = new SianWidget(options);
    WIDGET_INSTANCES.set(el, widget);

    // Exponer API en el elemento
    el.widget = widget;
    el.open   = function () { widget.open(); };
    el.close  = function () { widget.close(); };
    el.toggle = function () { widget.toggle(); };
  };

  SianWidgetElement.prototype.disconnectedCallback = function () {
    var widget = WIDGET_INSTANCES.get(this);
    if (widget) widget.destroy();
    WIDGET_INSTANCES.delete(this);
  };

  SianWidgetElement.prototype.attributeChangedCallback = function (name, oldVal, newVal) {
    if (!this._widgetReady || oldVal === newVal) return;
    var widget = WIDGET_INSTANCES.get(this);
    if (widget) {
      var attrs = {};
      attrs[name] = newVal;
      widget._applyAttrs(attrs);
      widget._paint(widget._config);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECCIÓN 11 — AUTO-INIT Y EXPORT
  ═══════════════════════════════════════════════════════════ */
  SianWidget.instances = function () { return _allWidgets.slice(); };
  SianWidget.defaults   = DEF;

  global.SianWidget = SianWidget;

  if (global.customElements && !global.customElements.get('sian-widget')) {
    try {
      global.customElements.define('sian-widget', SianWidgetElement);
    } catch (_) {}
  }

  function autoInit() {
    // Si hay <sian-widget> en el DOM, ya se inicializan solos via connectedCallback

    // Si NO hay ningún <sian-widget>, crear uno por defecto
    var hasTag = document.querySelectorAll('sian-widget').length > 0;
    if (hasTag) return;

    // Buscar script tag con data-api-base
    var tags = document.querySelectorAll('script[src]');
    var dataApiBase = '';
    for (var i = 0; i < tags.length; i++) {
      var src = tags[i].getAttribute('src') || '';
      if (src.indexOf('widgets.js') !== -1) {
        dataApiBase = tags[i].getAttribute('data-api-base') || '';
        break;
      }
    }

    var opts = {};
    if (dataApiBase) opts.apiBase = dataApiBase;

    // si no hay apiBase explícita, crear widget igual (usará detección automática)
    new SianWidget(opts);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})(typeof window !== 'undefined' ? window : globalThis);
