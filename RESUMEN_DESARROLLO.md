# Resumen de Desarrollos y Cambios Realizados

Este documento detalla todas las mejoras, correcciones y funcionalidades implementadas en el proyecto para que cualquier desarrollador o equipo pueda entender los cambios realizados.

---

## 1. Restauración de Estilos SCSS del Chat Cliente
- **Archivo:** `frontend/src/app/features/client/chat/chat.component.scss`
- **Detalle:** Se restauró la versión completa del SCSS del chat cliente (1572 líneas) que había sido sobreescrita en commits previos. Incluye todos los estilos de la interfaz de usuario, overlays de inactividad, grabador de voz, encuestas y adaptatividad móvil.

---

## 2. Persistencia de la Conversación IA
- **Archivos:**
  - `backend/src/ai/ai.dto.ts`
  - `backend/src/ai/ai.service.ts`
  - `backend/src/ai/ai.controller.ts`
  - `frontend/src/app/core/services/ai.service.ts`
  - `frontend/src/app/features/client/chat/chat.component.ts`
- **Detalle:**
  - Los mensajes del cliente y las respuestas de Gemini se persisten en la tabla `messages` asignadas a la sesión actual con `senderName: 'Asistente Virtual'` y `senderType: 'advisor'`.
  - Se garantiza que el mensaje de bienvenida se guarde exactamente una sola vez por sesión.
  - Las respuestas guardadas quedan cifradas en reposo (`enc:v2`) y limpias (sin etiquetas de control interno como `[FEEDBACK:...]` o `TRANSFER_TO_ADVISOR`).
  - Los asesores pueden ver el historial completo de lo que el usuario interactuó con la IA al abrir la sesión en su panel.

---

## 3. Interfaz del Chat Cliente en Modo IA
- **Archivo:** `frontend/src/app/features/client/chat/chat.component.html`
- **Detalle:**
  - Se ocultaron los botones de adjuntar archivos y la grabadora de nota de voz cuando la sesión está en modo IA (`@if (!aiMode)`).
  - Previene que el usuario envíe adjuntos o audios a la IA que forzaban la transferencia no deseada a asesor.

---

## 4. RAG Estricto y Filtrado de Documentos por Rol
- **Archivos:**
  - `backend/src/documentos/roles.util.ts` *(Nuevo)*
  - `backend/src/documentos/documentos.service.ts`
  - `backend/src/documentos/documentos.controller.ts`
  - `backend/src/ai/ai.service.ts`
  - `frontend/src/app/core/services/documentos.service.ts`
  - `frontend/src/app/features/advisor/modules/documentos/documentos.component.ts` / `.html`
- **Detalle:**
  - **Filtro SQL Token Exacto:** En `buscarRelevantes` y `buscarPorTexto`, el filtro por `roles_permitidos` compara tokens exactos en el CSV (`= $n` OR `LIKE $n||',%'` OR `LIKE '%,'||$n||',%'` OR `LIKE '%,'||$n`), evitando coincidencias parciales por subcadenas.
  - **Valores Canónicos:** Normalización de roles a `administrador`, `docente`, `estudiante`, `padre` mediante la utilidad `roles.util.ts`.
  - **Etiquetado en Contexto:** Cada fragmento de documento enviado a la IA especifica explícitamente sus roles permitidos.
  - **System Prompt Estricto:** La IA tiene instrucciones estrictas de NO inventar información ni utilizar datos de documentos destinados a otros roles. Si no hay documentos para el rol del usuario, indica que no tiene información registrada.
  - **UI de Gestión de Conocimiento:**
    - Corregido el mapeo de opciones de roles al editar.
    - Se visualizan los badges de roles permitidos en cada documento de la lista.
    - El panel de pruebas de búsqueda semántica (Test RAG) permite seleccionar el rol para simular qué vería cada tipo de usuario.

---

## 5. Módulo de Historial del Asesor (100% Funcional y Tiempo Real)
- **Archivos:**
  - `backend/src/sessions/sessions.controller.ts`
  - `backend/src/chat/chat.gateway.ts`
  - `backend/src/ai/ai.controller.ts`
  - `frontend/src/app/features/advisor/modules/history/history.ts`
- **Detalle:**
  - **Acceso:** Se otorgó permiso al rol `advisor` en `@Roles('admin', 'advisor')` para `GET /sessions/admin/all` y `GET /sessions/admin/all/paginated`, eliminando el error `403 Forbidden` que dejaba el historial vacío para los asesores.
  - **Autorización Socket:** Se actualizó `isAdvisorAuthorized` en el gateway para permitir que los asesores se unan a las salas de sesiones en estado `'ai'` o `'waiting'` (sin asesor asignado) para supervisión.
  - **Actualización en Tiempo Real:** Al persistirse mensajes de la IA, el controlador emite eventos `new_message` y `session_updated` al room de la sesión, permitiendo que los asesores vean la conversación fluir en vivo sin necesidad de recargar.

---

## 6. Conducta de la IA (Filtro de Groserías y Oferta Automática de Asesor)
- **Archivos:**
  - `backend/src/ai/ai.service.ts`
  - `backend/src/ai/ai.controller.ts`
  - `backend/src/ai/ai-logs.service.ts`
  - `backend/src/configuracion/configuracion.service.ts`
  - `frontend/src/app/features/client/chat/chat.component.ts` / `.html`
  - `frontend/src/app/features/admin/modules/configuracion/admin-configuracion.component.ts` / `.html`
- **Detalle:**
  - **Control de Lenguaje Ofensivo:**
    - Filtro de palabras prohibidas antes de invocar a Gemini.
    - 1ª y 2ª grosería: responde con un mensaje de advertencia amable sin procesar la pregunta.
    - 3ª grosería: emite `SESSION_TERMINATED`, cierra la sesión automáticamente y en el cliente muestra la pantalla de bloqueo impidiendo continuar.
    - Se registra en `ai_logs` como `esOfensivo: true`.
  - **Detección de Saludos:** Los saludos cortos son respondidos de forma amigable sin invocar la búsqueda RAG ni ofrecer innecesariamente un asesor.
  - **Oferta de Asesor cuando no hay Respuesta:**
    - Si la consulta no devuelve documentos para el rol del cliente, la IA responde el mensaje sin información configurado y emite `sugerirAsesor: true`.
    - En la interfaz del cliente aparece de forma interactiva la pregunta: **"¿Necesitas un asesor para una mejor ayuda?"** con botones **Sí, transferir** / **No, gracias**.
    - Si el usuario selecciona **Sí**, es transferido de inmediato a la cola de atención humana.
    - Si el usuario marca **"No"** en la encuesta de utilidad ("¿Te sirvió la respuesta?"), la interfaz también le ofrece la opción de hablar con un asesor.
  - **Configuración Admin (Conducta y Límites):**
    - Se agregaron las propiedades `palabrasProhibidas`, `mensajeGroseria`, `limiteGroserias`, `mensajeSesionTerminada`, `mensajeSinInformacion` y `sugerirAsesorAutomatico` a `aiPromptConfig`.
    - Sanitización agregada en `ConfiguracionService`.
    - Nueva sección interactiva en el panel de administración (`admin-configuracion`) para gestionar estas palabras, mensajes y límites visualmente.

---

## Estado del Proyecto e Infraestructura
- **Docker Compose:** Todos los servicios (`chat-backend`, `chat-frontend`, `chat-postgres`, `chat-redis`) se encuentran compilados, desplegados y en estado `healthy`.
- **Base de Datos:** Migración de PostgreSQL con `pgvector` inicializada.
