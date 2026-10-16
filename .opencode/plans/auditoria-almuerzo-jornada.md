# Plan: Auditoría y arreglo del módulo de Almuerzo/Jornada en Historial de Conectividad

## Contexto (auditoría con datos reales)

BD real verificada:
- Global `configuracion`: `horarios_activos=false`, horarios definidos Lun–Vie 08:00–17:00, `almuerzos=[]`.
- Override del asesor Jean: almuerzos `{dia:4, 12:00–13:00}` (hoy jueves) y otros días.
- Eventos Jean hoy: `08:42 conexion` → `09:32 timeout` → `09:34 conexion`.
- El modal de `/admin/agentes` muestra: barra 00:00→24:00, primer segmento "Fin de almuerzo 9h33" fantasma, chip Almuerzo "—", mensaje "Jornada no configurada para este día".

Decisiones del usuario:
- El historial usará los horarios definidos aunque `horarios_activos=false` (sin tocar el flag global; cero efectos en WhatsApp/asignación).

## Bugs a corregir (por archivo)

### 1. `backend/src/advisor-activity/advisor-activity.service.ts`

**1a. Opener fantasma (línea ~521)** — `lista.find(e => e.desde < dayStartUtc)` toma el evento MÁS VIEJO de la ventana de 2 días.
- Fix: tomar el ÚLTIMO evento anterior al día: `const previos = lista.filter(e => e.desde < dayStartUtc); const previo = previos.length ? previos[previos.length - 1] : null;`
- Efecto: hoy abriría como "Inactivo" (último evento de ayer = offline 16:01), desaparece el "Fin de almuerzo" a las 00:00 y los 9h33 de Disponible nocturno.

**1b. Jornada en `historialDia` (~línea 450)** — hoy solo aplica slots si `config.horariosActivos`.
- Fix: aplicar los slots definidos siempre que `Array.isArray(config.horarios) && config.horarios.length > 0` para la fecha consultada (sin condicionar a `horariosActivos`). Documentar en el comentario que el historial es independiente del flag (que sigue gobernando WhatsApp/asignación).
- Efecto: la barra arranca en 08:00 (jornada), desaparece "Jornada no configurada para este día" cuando hay horarios definidos, y `clipAPeriodo` recorta los periodos nocturnos heredados.

**1c. Almuerzo durante desconexión (en `registrar()`, ~línea 374)** — solo `connect`/`manual` consultan `isOnLunch`.
- Fix: extender la consulta de `isOnLunch` a todas las causas excepto `almuerzo_fin`: si el asesor está en almuerzo y llega `disconnect`/`timeout`/`sistema`, registrar con `almuerzo=true` (conservando el estado real `offline`).
- Efecto: "si se desconecta en almuerzo, se marca como almuerzo" (chip/barra muestran Almuerzo, no Inactivo).

**1d. Overlay de almuerzo en día de hoy** — verificar (y corregir si hace falta) que `overlayAlmuerzo` corte el periodo abierto en el fin de la franja y marque el tramo como almuerzo aunque el evento diga `online`. Ya existe la lógica; se valida con el E2E (paso 5).

### 2. `backend/src/chat/chat.gateway.ts`

**2a. Timeout de heartbeat respeta almuerzo (`sweepStalePresence`, ~línea 230)** — hoy pone `offline` aunque el asesor esté en almuerzo.
- Fix: antes de setAdvisorStatus offline por timeout, consultar `estaEnAlmuerzo(advisorId)`; si está en almuerzo, setAdvisorStatus `'almuerzo'` con `causa:'timeout'` (el dedupe del historial no duplica; el periodo abierto de almuerzo sigue vigente y la tarjeta muestra almuerzo).

**2b. Desconexión (gracia) respeta almuerzo (`programarDesconexion`, ~línea 441)** — mismo criterio que 2a con `causa:'disconnect'`: si `estaEnAlmuerzo`, mantener `'almuerzo'` en BD.

**2c. Barrido on-lunch de desconectados (`checkLunchBreaks`, ~línea 3197)** — hoy solo hace `removeOnLunch` sin fin lógico.
- Fix: al limpiar un almuerzo de asesor desconectado (sin `fin` o con `fin` vencido):
  1. `removeOnLunch(id)`,
  2. resolver estado: si no tiene socket → `setAdvisorStatus(id, 'offline', { causa: 'almuerzo_fin' })` (registra el cierre en el historial),
  3. `removeAdvisorStatus(id)` (limpiar preferencia 'almuerzo' en Redis para que al reconectar no vuelva a almuerzo),
  4. `this.server.emit('advisor_status_changed', { advisorId: id, status: 'offline' })`.
- Efecto: elimina el "almuerzo pegado" cuando el asesor cierra la pestaña en pausa.

### 3. Verificaciones de flujo (sin cambio si ya funciona)

- `getEfectivaBatch` debe aportar `almuerzos` del override al historial y al barrido (leer y confirmar; corregir solo si no).
- `lunch_action end` manual: confirmar que emite todo (ya emite `lunch_ended`, `lunch_status_changed`, `advisor_status_changed`).
- Frontend `advisors.ts`: ya escucha `advisor_status_changed` y refresca tarjeta + historial (líneas 255–266); se confirma con la prueba manual.

## Pasos de ejecución

1. Correcciones 1a–1c en `advisor-activity.service.ts`.
2. Correcciones 2a–2c en `chat.gateway.ts`.
3. `npm run build` (backend) → BUILD_EXIT=0.
4. E2E read-only (`C:\Users\Jean\AppData\Local\Temp\opencode\validate-historial-almuerzo.mjs`, patrón validate-*.mjs):
   - `historialDia` de hoy con la config real: sin "Fin de almuerzo" fantasma a 00:00; primer periodo = inactivo hasta la primera conexión.
   - Con jornada aplicada (08:00–17:00): barra/periodos recortados al slot; primer periodo desde 08:00.
   - Franja de almuerzo del asesor (12:00–13:00) overlay marcada como almuerzo aunque no haya eventos.
   - Simular evento de desconexión registrada con almuerzo=true (unit-level sobre `registrar` con stub de `isOnLunch`).
   - `franjaAlmuerzoDelDia` con `lunchSkipped` → sin franja (comportamiento documentado).
5. Frontend `ng build --configuration development` → verde.
6. Reporte final en español: bugs corregidos, archivos, cómo quedó la barra (jornada 08:00→17:00, almuerzo pintado, etiquetas), y líneas de verificación manual del usuario (abrir modal de agentes hoy, cerrar pestaña en almuerzo, etc.). Sin commits.

## Riesgos/impacto

- `horarios_activos` NO se modifica (decisión del usuario): WhatsApp/asignación intactos.
- El historial de días pasados abrirá con el último evento real (más correcto); puede cambiar visualmente barras antiguas (era un bug).
- Los datos históricos ya registrados con `almuerzo=false` durante desconexión no se corrigen retroactivamente (solo aplica a partir del fix).
