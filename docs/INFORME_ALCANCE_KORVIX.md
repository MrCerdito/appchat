# Informe de Alcance del Software — Korvix

> Plataforma de atención en línea para instituciones educativas.
> Fecha del informe: septiembre 2026.

## 1. Introducción

**Korvix** (nombre del proyecto en el repositorio: `appchat`) es una plataforma web de atención y soporte en línea para instituciones educativas. Permite a estudiantes, docentes, padres y administrativos formular consultas a través de un **widget de chat público**, ser atendidos por un **asistente virtual con IA (identidad Korvix)** o un **asesor humano**, y hacer seguimiento de su caso. Incluye además módulos de gestión para asesores y administradores: historial de conversaciones, métricas e indicadores, repositorio documental con búsqueda semántica, comunicados, PQRS, tickets, fichas de instituciones educativas y una **bandeja WhatsApp** para atención desde la cuenta oficial de la institución.

- **Frontend:** Angular 21 (componentes standalone, lazy loading, modo `data-theme` claro/oscuro).
- **Backend:** NestJS 11 + TypeORM sobre PostgreSQL 16 con `pgvector`; Redis; `socket.io` (con adaptador Redis) para chat en tiempo real.
- **Despliegue:** `docker-compose` (4 servicios), PM2 en cluster, túneles `ngrok`, monorepo `pnpm`.
- **Integraciones:** IA Gemini (streaming SSE + embeddings para RAG), WhatsApp (Baileys), correo (Resend + SMTP vía Nodemailer), Microsoft Teams/Graph, Excel (ExcelJS), PDF (pdf-parse).
- **Estado:** 252 commits en el repositorio (junio–septiembre 2026); servicios desplegados y en estado _healthy_.

## 2. Objetivo del informe

Documentar el **alcance funcional y técnico** de la plataforma, los **módulos** desarrollados, las **mejoras y correcciones** realizadas, las **incidencias** resueltas, la atención/casos soportados y las **mejoras pendientes**, a modo de referencia para el equipo. Alcance de revisión: repositorio completo a fecha de hoy (backend, frontend, infraestructura y documentación existente).

## 3. Descripción de la plataforma

### 3.1 Propósito
Brindar atención en línea a la comunidad educativa con un modelo híbrido **IA + humanos**: el cliente inicia un chat, la IA (identidad **Korvix**) responde con base en un repositorio documental institucional (RAG), y cuando corresponde se transfiere a un **asesor humano** o a la cola de atención.

### 3.2 Roles y acceso
| Rol | Área | Alcance |
|---|---|---|
| Cliente (público) | `/chat` | Widget: FAQ, formulario de datos, chat, encuesta, PQRS. |
| Asesor (y coordinador) | `/dashboard` | Bandeja de chats en vivo, historial, métricas, documentos, comunicados, perfil institucional, configuración, WhatsApp, tickets, chat interno. |
| Admin | `/admin` | CRUD de asesores, métricas globales, operaciones (monitoreo WhatsApp y asignación), configuración global, widget, FAQ (admin), historial, tickets, perfil institucional. |

### 3.3 Arquitectura
- **Frontend:** 3 áreas de rutas (pública `/chat` y `/login`; asesor `/dashboard`; admin `/admin`), ~30 componentes de feature standalone, 25 servicios `core`, guards `authGuard`/`roleGuard`, interceptor JWT con refresh single-flight, servicio `socket.io` genérico y conexiones propias para WhatsApp (`/advisors-whatsapp`) y chat interno (`ic_*`).
- **Backend:** 18 módulos NestJS; gateways WebSocket para chat cliente/asesor/admin, WhatsApp e interno cada uno con su namespace de eventos; servicios REST por dominio.
- **Datastores:** PostgreSQL (`pgvector`) para datos; Redis para estado operativo (presencia, colas, almuerzos, caché de métricas); almacenamiento de archivos con cifrado en reposo (`enc:v2`).
- **Seguridad:** JWT con rotación de refresh, guards por rol, Helmet, throttling (rate-limit), sanitización de entradas (HTML, comandos IA), aislación de documentos por rol.

## 4. Módulos y funcionalidades

### 4.1 Cliente (widget público `/chat`)
- **Flujo** `FAQ → formulario → chat → encuesta/bloqueo` con pasos `faq / name / pqrs / chat / rating / blocked`.
- **Formulario:** identificación, nombre, apellido, rol (administrador/docente/estudiante/padre), **detección automática de colegio**, tipo de solicitud, e-mail, celular, aceptación de tratamiento.
- **FAQ:** pantalla inicial de preguntas frecuentes por categoría, búsqueda, respuesta formateada; **FAQ interactiva dentro del chat** cuando la IA está activa (selección de categoría → pregunta → respuesta), con entrega de documentos solo si son relevantes.
- **Chat IA:** streaming de respuestas Gemini, RAG estricto por rol, sugerencia automática de asesor, encuesta de utilidad, control de lenguaje ofensivo (1ª/2ª aviso, 3ª **sesión terminada** con pantalla de bloqueo).
- **Chat humano:** transferencia a cola, adjuntos (imagen/video/audio/documento, límite 64 MB), **grabadora de voz**, responder/citar mensajes (reply-to-message), indicadores de escritura, rejilla responsiva según contenedor del widget.
- **PQRS:** formulario de peticiones/quejas con código de seguimiento.
- **Registro de actividad en historial:** las FAQs leídas en pantalla inicial y en el chat quedan registradas como eventos (`faq_clic`) con la pregunta y la respuesta del sistema.

### 4.2 Asesor (`/dashboard`)
- **Chat en vivo:** bandeja de sesiones (mías/en espera), unirse a salas, cita y respuesta a mensajes, ticks de leído/entregado, badges de no leídos en tiempo real, notas de voz, adjuntos, `takeover`, toma de control de sesión IA.
- **Historial global:** sesiones con timeline unificada (mensajes + eventos), filtros por fecha (día bogotano), búsqueda, exportación de transcripción.
- **Métricas del asesor:** sesiones atendidas, tiempos, tasa de resolución, calificaciones, comentarios (paginados), **KPIs de IA** (contexto, transferencias, errores, tokens, ofensas) y **exportación a Excel**.
- **Documentos:** repositorio por rol, carga (PDF/Word/Excel/imágenes), **Test RAG** (simula lo que ve cada rol), generación de certificados.
- **Comunicados:** envío masivo de correos a colegios, borradores, plantillas, estadísticas, confirmación previa.
- **Perfil institucional:** fichas de instituciones con campos dinámicos (texto, email múltiple, fecha, sí/no, íconos), importación/exportación Excel (con log de cambios), logos, estado activo/inactivo, rediseño premium SaaS.
- **Configuración:** horarios de atención, franjas de almuerzo (con banners minimizables y transición automática), respuestas rápidas (quick replies) con import/export CSV.
- **WhatsApp (bandeja asesor):** interfaz estilo WhatsApp Web, sincronización en vivo (ediciones, reacciones, revokes, pin, estados), selector de colegio con reasignación de asesor, filtros, plantillas, notas y etiquetas de contacto, integración **Teams** (auth + reuniones), **informes diarios/mensuales/anuales**, dashboard de operación.
- **Chat interno de asesores:** conversaciones directas 1-a-1, grupo de soporte, texto/media/audio, editar/borrar/reenviar/reaccionar, badge de no leídos, sidebar con nombre y foto de agentes.
- **Tickets:** gestor reutilizado (tabla/kanban con arrastre), estados/prioridades/fuentes/categorías, plantilla de correo para tickets.

### 4.3 Admin (`/admin`)
- **Asesores:** CRUD completo, foto de perfil, activación, importación/exportación masiva (XLSX).
- **Métricas globales:** indicadores por asesor, ranking, **KPIs de IA histórico** (con `ofensas`), promedio/mediana/P95 de tiempos, **exportación Excel**, filtro por rango de fechas.
- **Operaciones (WhatsApp):** monitoreo en vivo con panorama/categorías/actividad, alertas y SLA; vistas de chats, **asignación manual** (cola/espera), estado de asesores (online/busy/away, alertas de reconexión), reportes por día/mes/año (auto-refresh 30 s), **fijar asesor** a chat/colegio.
- **Configuración global:** conducta de la IA (palabras prohibidas, mensajes, límites de groserías, sugerir asesor), SMTP (host/puerto/usuario/clave), editor visual de correo (bloques + variables), colegios (CRUD + asignación de asesor + import/export CSV).
- **Widget:** configuración pública (colores, textos, horario de atención, _feature flags_).
- **FAQ (admin):** CRUD de preguntas y **categorías editables** (`faq_categories`), import/export XLSX, documento base para la IA (contador de caracteres), chat de prueba con streaming.
- **Historial, tickets y perfil institucional:** reutiliza los módulos del asesor.

### 4.4 IA y RAG
- Proveedor **Gemini** (chat streaming SSE por `ai.service`/`ai.controller`).
- **RAG sobre `pgvector`** con embeddings `gemini-embedding-001`, umbrales de relevancia, filtro de roles por token exacto y etiquetado de documentos en el contexto.
- **Persistencia de la conversación IA** en `messages` (`senderName: 'Asistente Virtual'`), mensaje de bienvenida único por sesión, registros en `ai_logs` (contexto, transferencias, errores, feedback, `esOfensivo`, tokens).
- **Conducta configurable:** groserías, saludos, mensaje sin información, `sugerirAsesorAutomatico`, cierre `SESSION_TERMINATED` (independiente del socket).
- Capacidades IA en WhatsApp: borrador mejorado, resumen de conversación, respuesta mejorada (`improveDraft`, `summarize`, `improveForClient`/`improveAdvisor`).

## 5. Cambios y mejoras realizadas

Principales mejoras recientes (ordenado por tema):

1. **Historial:** permiso de historial para asesores (fix 403), timeline unificada mensajes+eventos en tiempo real, filtro por día bogotano, supervisión de salas `ai`/`waiting`.
2. **FAQ:** categorías editables desde admin + seed automático, filtrado por rol, FAQ interactiva y compacta en el chat (2 columnas), registro en historial de FAQs leídas en la pantalla inicial (`soloEvento` + fecha real de lectura, chips "Consultó la pregunta frecuente" / "El sistema respondió").
3. **IA:** RAG estricto por rol, identidad **Korvix**, conducta (groserías + ofertar asesor), persistencia cifrada de la conversación, cierre de sesión por ofensas sin depender del socket.
4. **Métricas:** paneles admin/asesor con rango de fechas, KPIs de IA, botón "Descargar Excel" (reporte general y por asesor), paginador de comentarios numerado.
5. **WhatsApp:** rediseño estilo WhatsApp Web, sincronización en vivo de ediciones/reacciones/revokes/pin, chat interno de asesores, selector de colegio con reasignación, Teams.
6. **Chat asesor:** ticks de leído/entregado y badges en tiempo real, aplicar texto mejorado sin race, foto del asesor fija del colegio, **links blancos en la burbuja azul** (`::ng-deep` para HTML inyectado), header responsivo.
7. **Perfil institucional:** rediseño premium, campo ciudad, e-mails múltiples editables, import/export Excel con log de cambios y normalización Sí/No, acceso desde admin, búsqueda de asesores.
8. **Almuerzos:** banner pendiente/próximo → ventana minimizable → transición automática de `proximamente (00:00)` a pendiente/inicio.
9. **Robustez:** centralización de notificaciones del asesor, overlay de mantenimiento con sondeo `/health` (5 s / 8 fallos), banner de conexión, sanitización y validaciones de carga (50 MB), normalización de zona horaria Bogotá.

## 6. Incidencias o problemas identificados

| # | Incidencia | Causa raíz | Resolución |
|---|---|---|---|
| 1 | `403 Forbidden` en historial para asesores | Faltaba `@Roles('admin','advisor')` en `GET /sessions/admin/all` y paginado | Permiso ampliado |
| 2 | `500` en métricas IA y export (admin/asesor) | `ai_logs."sessionId"` es `varchar` vs `sessions.id` `uuid` → `operator does not exist: character varying = uuid` en joins/filtros | Cast `s.id::text` en `aplicarFiltros` y `getStatsPorAsesor`; queries verificadas contra BD |
| 3 | Chips "Información general · N" en métricas | Sufijo de conteo sobre sección "Por tipo de solicitud" | Se quitó el sufijo y luego se eliminó esa sección en ambos paneles |
| 4 | Links invisibles en la burbuja azul del asesor | HTML inyectado por `[innerHTML]` sin atributo `_ngcontent`, las reglas SCSS escopadas no aplicaban | Selectores con `::ng-deep` → links blancos en burbuja asesor y primario en burbuja cliente |
| 5 | Texto mejorado no se aplicaba en el editor del chat | Condición de carrera con `closeImprovePanel` | Fix de sincronización del editor |
| 6 | Filtro de fechas del historial cruzaba días | Comparación sobre datetime UTC sin frontera bogotana | Filtro por día civil Bogotá (UTC-5) |
| 7 | `Type null` en dashboard | Tipado del estado/carga | Corrección + tests `AdvisorNotificationService` |
| 8 | Falsos positivos de detección de rol de documentos | Comparación por substring en CSV | Filtro de token exacto + roles canónicos (`roles.util.ts`) |
| 9 | Validación excesiva en campos de colegio / `[object Object]` en import Excel | Restricciones by-level y parsing de hipervínculos | Relajación de validación, selectores "Otro", parsing de celdas enlazadas |

Otras observaciones: **ausencia de migraciones versionadas** (esquema dependiente de TypeORM), **backups manuales** (`deploy/backup.sh`, carpeta `backups/`), pocos tests automatizados, y archivos borrados sin commit en el working tree (`docs/informe-chat-en-linea.docx` y `.pdf`).

## 7. Casos atendidos / soporte

La plataforma opera en modo híbrido y registra toda la actividad en la sesión:

- **Atención con FAQ:** casos de consulta académica (p. ej., solicitud de **certificados, boletines y documentos académicos**) respondidos por el asistente virtual, dejando constancia en el historial del "consultó la pregunta frecuente" y la respuesta del sistema.
- **Transferencia a asesor:** sesiones donde la IA sugiere un humano (sin información para el rol) o el cliente lo solicita explícitamente; quedan como eventos `solicitud_asesor` en el timeline.
- **Sesiones IA registradas:** el módulo de métricas reporta KPIs por sesión (contexto usado, transferencias, errores, feedback de utilidad, ofensas), sirviendo como trazabilidad de la atención.
- **Soporte técnico (incidencias):** los puntos de la sección 6 fueron atendidos y corregidos incrementalmente a lo largo de 252 commits.

> Nota: la plataforma no lleva un módulo formal de "casos de soporte"; la trazabilidad vive en sesiones, tickets, PQRS y `ai_logs`.

## 8. Mejoras pendientes

1. **Migraciones de base de datos controladas** (reemplazar sync/entidades por migraciones versionadas).
2. **Backups automáticos con retención y restore documentado** (hoy son manuales).
3. **Tests automatizados** (rutas críticas: auth, chat, FAQ/IA, métricas) y CI/CD integrado a GitHub.
4. **Documentación de API** (Swagger/OpenAPI) y versión del informe alineada a cada release.
5. **Gestión segura de secretos** (evitar claves en configuración versionada; usar vault/secret-manager).
6. **Observabilidad:** logging centralizado, alertas (más allá del sondeo `/health`), métricas de rendimiento.
7. **Accesibilidad y PWA** del widget público (instalación, notificaciones push, `lang`).
8. **Confirmar/committear estado pendiente** del working tree (borrado de informes anteriores) y definir estrategia de versionado `docs/`.

## 9. Conclusiones

**Korvix** es una plataforma madura y extensa que cubre el ciclo completo de atención al usuario educativo: **FAQ → IA (RAG estricto) → asesor humano → encuesta/PQRS**, con paneles de gestión, métricas exportables, un repositorio documental con búsqueda semántica por rol, un canal **WhatsApp operativo** (con monitoreo y asignación) y **chat interno entre asesores**. La arquitectura (Angular + NestJS + PostgreSQL/pgvector + Redis + Socket.IO) está desplegada en contenedores con estado _healthy_.

Las mejoras recientes se han orientado a **trazabilidad** (registro de FAQs en historial, KPIs de IA, timeline unificada), **operaciones** (WhatsApp, asignación, reportes) y **usabilidad** (diseño WhatsApp/Web, paginadores, links legibles). Las deudas técnicas principales son el **esquema sin migraciones, los backups manuales y la baja cobertura de tests**; cubrirlas dará mayor robustez a producción. En general, el alcance del software es amplio y funcional, alineado con el objetivo de soporte institucional.