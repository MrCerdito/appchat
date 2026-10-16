# Reset de estado al cambiar de pestaña en Métricas

## Problema
Al abrir el detalle de un asesor (nivel 2) en una pestaña y luego cambiar a otra
pestaña, el detalle **queda abierto** al regresar. Ejemplo del usuario: abre un
asesor en Tickets/Correos, va a otra pestaña, vuelve → sigue mostrando la ficha
del asesor en vez de la tabla (nivel 1).

## Causa raíz
`setTab()` en `frontend/src/app/features/admin/modules/metrics/metrics.ts:297`
solo hace `this.tab = tab`. No invoca ningún reset. Cada pestaña tiene su propio
botón "Volver" que limpia su estado, pero nada se ejecuta al cambiar de pestaña.

## Estado "detalle" por pestaña (todo en metrics.ts)
- **Atención**: `atencionAsesor`, `atencionBusca`, `atencionPagina` → lo limpia `cerrarAtencionAsesor()` (:610)
- **Tickets/Correos**: `tcAsesor`, `tcTicketsFiltro`, `tcCorreosFiltro` + tablas `tcTickets`/`tcCorreos` → lo limpia `cerrarTcAsesor()` (:760)
- **Conexiones**: `connAsesor`, `connHist`, `connHistCargando`, `connHistFiltro` + tabla `connHist` → lo limpia `cerrarConnAsesor()` (:958)

General, Reuniones y Solicitudes **no** tienen nivel 2.

## Diseño
Reutilizar los tres cerradores existentes (garantiza consistencia con los botones
"No hay cambios que planear"**Volver**). Al cambiar de pestaña se cierra el detalle de TODAS las pestañas,
de modo que regresar a cualquiera muestra la tabla (nivel 1).

No se recarga `dash` (los datos son compartidos; el cambio es solo de vista).

## Cambios (solo `metrics.ts`; sin backend)

### 1. `setTab` — cerrar detalles al cambiar de pestaña
```ts
setTab(tab: MxTab): void {
  if (this.tab === tab) return;   // re-clic en la pestaña activa: no-op
  this.tab = tab;
  this.resetVistas();
  this.cdr.markForCheck();
}
```

### 2. Nuevo método privado `resetVistas()`
```ts
/** Al cambiar de pestaña se vuelve a la vista de lista: se cierra el detalle
 *  (nivel 2) de TODAS las pestañas para que regresar muestre la tabla y no
 *  el asesor que quedó abierto. Los desplegables también se cierran. */
private resetVistas(): void {
  this.cerrarAtencionAsesor();
  this.cerrarTcAsesor();
  this.cerrarConnAsesor();
  this.cerrarAsesorLista();
  this.cerrarProyectoLista();
}
```

### 3. (Consistencia) Incluir `connDias` en abrir/cerrar de Conexiones
`abrirConnAsesor()` (:950) y `cerrarConnAsesor()` (:958) solo hacen
`reiniciarTablas('connHist')`. La tabla "Resumen por día" usa la clave `connDias`
y también vive dentro de la ficha: al abrir/cerrar debería volver a la página 1.
Se añade `'connDias'` a ambos `reiniciarTablas`.

## Se respeta por diseño
`atencionDetalleId` (:595) y `tcDetalleId` (:744) son `aplicados.asesorId || …Asesor`.
Si el filtro global de asesor fija uno, el detalle se **fuerza** (el backend solo
trae ese asesor); `resetVistas` no lo cierra y eso es correcto.
`connEnDetalle` (:923) es solo `!!connAsesor`, así que sí se cierra siempre.

## Fuera de alcance (a propósito)
- No se resetea la paginación de las tablas de **nivel 1** (`chats`,
  `tcAsesores`, `conexiones`, `solColegios`) ni `capPagina` de Reuniones:
  conservar "dónde estaba" en la lista no rompe nada y es menos molesto.
- No se recarga el dashboard ni se toca el backend.

## Verificación
- `npx ng build --configuration development` en `frontend/` → debe quedar en verde.
- Manual: abrir asesor en Conexiones / Tickets-Correos / Atención → cambiar de
  pestaña → regresar → debe mostrarse la tabla (nivel 1), no la ficha.
- Manual: con filtro global de asesor fijo, Atención y Tickets-Correos siguen
  mostrando el detalle (por diseño).
