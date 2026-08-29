# PRUEBA DEL ASISTENTE IA — KORVIX

**Fecha:** 2026-08-29 10:51 (hora local)
**Backend probado:** `POST http://localhost:3001/ai/chat`
**Perfil de prueba:** rol **estudiante** — Carlos Perez, colegio "Instituto Educativo Los Cedros"
**Finalidad:** Validar que (1) el asistente se presenta con su nombre "Korvix" y (2) NO entrega documentos irrelevantes ni en consultas no relacionadas ni en trámites restringidos (certificados/boletines académicos).

---

## Objetivo de la prueba

1. Verificar que el asistente diga "Mi nombre es Korvix, Asistente Virtual" (y no solo "asistente virtual").
2. Al hacer preguntas **sin relación** con los documentos cargados, que responda correctamente y **no** adjunte documentos.
3. Al pedir un **certificado académico** (tema restringido para estudiantes), que responda redirigiendo a la institución y **no** adjunte ningún documento.

---

## Resultado de la conversación (transcripción real)

### Turno 1 — Saludo
- **Usuario:** Hola, buenas tardes, necesito ayuda
- **Asistente:** ¡Hola, buenas tardes! Mi nombre es Korvix, asistente virtual. ¿En qué tema necesitas que te ayude hoy?
- **Documentos entregados:** 0 ✅ | Transfer: false | Feedback: false

### Turno 2 — Identidad
- **Usuario:** Cual es tu nombre? Quien eres?
- **Asistente:** Mi nombre es Korvix, asistente virtual del Instituto Educativo Los Cedros. Estoy aquí para ayudarte con las dudas que tengas sobre la plataforma. ¿En qué te puedo colaborar hoy?
- **Documentos entregados:** 0 ✅

### Turno 3 — Consulta NO relacionada (RAG)
- **Usuario:** Explicame que es el cambio climatico y sus causas principales
- **Asistente:** El cambio climático se refiere al aumento de las temperaturas y a las alteraciones en los patrones del clima en la Tierra, provocados principalmente por actividades humanas como la quema de combustibles fósiles, la deforestación y la contaminación industrial. Recuerda que mi especialidad es ayudarte con temas relacionados con el colegio y la plataforma educativa. ¿Tienes alguna duda sobre tus accesos o trámites en la que te pueda colaborar?
- **Documentos entregados:** 0 ✅ (no se adjuntó ningún documento del RAG)

### Turno 4 — Consulta NO relacionada (RAG)
- **Usuario:** Que me puedes contar sobre los beneficios de leer libros?
- **Asistente:** Leer libros ayuda a mejorar la concentración, estimula la imaginación, amplía tu vocabulario y reduce el estrés. Es una excelente forma de aprender cosas nuevas y ejercitar la mente. ¿Hay algún tema escolar o de la plataforma en el que te pueda colaborar hoy?
- **Documentos entregados:** 0 ✅

### Turno 5 — Tema restringido (certificados académicos)
- **Usuario:** Necesito un certificado academico de mis notas
- **Asistente:** Para solicitar certificados, boletines u otros documentos académicos, debes comunicarte directamente con la institución, ya que esa documentación debe ser emitida de forma oficial y no la puedo adjuntar desde este canal.
- **Documentos entregados:** 0 ✅ (mensaje específico del rol estudiante)

---

## Resultado por objetivo

| Objetivo | Estado | Evidencia |
|---|---|---|
| El asistente dice "Mi nombre es Korvix, Asistente Virtual" | ✅ OK | Turnos 1 y 2 (menciona "Korvix", no solo "asistente virtual") |
| Preguntas no relacionadas responden sin adjuntar documentos | ✅ OK | Turnos 3 y 4 (`documentos: 0`) |
| Pedir certificado académico redirige a la institución sin documentos | ✅ OK | Turno 5 (`documentos: 0`, mensaje de rol estudiante) |
| No hay entrega de documentos irrelevantes en ningún turno | ✅ OK | Todos los turnos con `documentos_entregados: 0` |

---

## Cambios aplicados para lograr el resultado

1. **Entrega de documentos:** en `backend/src/ai/ai.service.ts` (`chat()` y `chatStream()`) solo se entregan documentos si la IA los marca con `[DOCUMENTO:...]` o los cita por nombre. Se eliminó la entrega proactiva de los top-3 del RAG.
2. **Fusión de configuración por rol:** se corrigió el merge para que una lista `temasRestringidos` vacía guardada en BD **no anule** los valores por defecto del rol (antes un `[]` eliminaba la restricción de estudiante).
3. **Temas restringidos por rol:** el rol **estudiante** quedó preconfigurado con certificados, boletines, notas, constancias, historial, documentos académicos, matrícula, pensión, pagos, facturas y deudas, con el mensaje de redirección institucional.
4. **Identidad del asistente:** el prompt fuerza la auto-presentación con "Mi nombre es Korvix, asistente virtual"; se corrigió el nombre en la configuración de BD (era "asistente virtual de atención al cliente") a **Korvix**.
5. **UI "Configuración del Asistente IA":** el panel muestra por defecto el rol estudiante con los temas restringidos y el mensaje ya cargados, y el `aiPromptConfig` se persiste en la BD de forma automática (seed + backfill).

---

## Cómo se reprodujo

- Se llamó a `POST /ai/chat` con `{ message, history, clientName, colegio, tipoSolicitud, rol:'estudiante' }`, acumulando el historial turno a turno para simular una conversación real.
- Las respuestas de Gemini (a través del sistema) son las que aparecen en la transcripción.

---

## Verificaci�n adicional (2026-08-29 16:xx) - FAQ por rol y entrega de documentos

### Cambios nuevos
1. **FAQ filtrables por rol:** se agreg� la columna `roles` (`simple-array`, nullable = visible para todos) a `faq` y `faq_categories`. Backend (`findAll`/`findCategorias`) y frontend (`chat.component` `cargarFaqParaChat`) filtran seg�n el rol del cliente. Admin UI: multi-select de roles en el modal de FAQ y en el formulario de categor�a (vac�o = todos).
2. **Entrega de documentos en FAQ corregida:** `selectFaqItem` ya no adjunta los top-N autom�ticos de `buscarPublico`. Solo adjunta si `faqDocsRelevantes` confirma que el nombre del documento comparte al menos un token informativo (len>=4, no stopword) con la pregunta o categor�a de la FAQ.

### Pruebas reales
| Caso | Resultado | Evidencia |
|------|-----------|-----------|
| FAQ "app m�vil" (id 88, pregunta "�Deseas descargar la aplicaci�n m�vil de la plataforma?") | Backend `public-search` devuelve 1 doc (RECUPERAR CONTRASE�A), pero el gate `faqDocsRelevantes` lo descarta por no compartir tokens informativos (todos son stopwords + categor�a "APP" de 3 letras) | **0 documentos adjuntos al seleccionar la FAQ** |
| FAQ "Olvid� mi contrase�a" | Backend devuelve RECUPERAR CONTRASE�A (coincidencia real por token "contrase�a") | 1 documento adjunto (relevante) |
| Filtro por rol: FAQ 88 puesta con rol `estudiante` | `GET /faq?rol=docente` = 10 (excluye 88); `GET /faq?rol=estudiante` = 11 (incluye 88) | Filtrado por rol OK |
| Datos revertidos a rol null despu�s de la prueba | FAQ 88 vuelve a visible para todos | OK |

### Nota
Se dej� el `colegio_id` de las FAQs en NULL (globales); consultarlas con `colegioId=<n>` las excluye. El frontend no pasa `colegioId` al cargar FAQs, por lo que se ven correctamente.
