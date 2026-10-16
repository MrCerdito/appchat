# Rediseño del panel de filtros y pestañas en Métricas

## Objetivo
1. Eliminar el encabezado del panel de filtros (`mx-fpanel-head`).
2. Reubicar «Limpiar filtros» y «Descargar Excel» junto a «Aplicar filtro» en el pie del panel.
3. Rediseñar las pestañas: no píldoras circulares sino **cards pequeñas**, con un **efecto de deslizamiento** al cambiar de una a otra.

## Archivos
- `frontend/src/app/features/admin/modules/metrics/metrics.html`
- `frontend/src/app/features/admin/modules/metrics/metrics.scss`
- `frontend/src/app/features/admin/modules/metrics/metrics.ts`

## 1 · Quitar `mx-fpanel-head` (html:5–25) y reubicar sus botones

**Eliminar** todo el bloque `<div class="mx-fpanel-head">…</div>`: título «Filtros de métricas», badge contador (`mx-fpanel-count`) y los dos botones.

**Mover** al pie (`mx-fpanel-footer`, html:164–185), en un contenedor `mx-fpanel-actions` a la derecha, en este orden:
`Limpiar filtros` → `Descargar Excel` → `Aplicar filtro`.

```html
<div class="mx-fpanel-footer">
  <span class="mx-fpanel-info"> …status actual (se conserva tal cual)… </span>
  <div class="mx-fpanel-actions">
    <button type="button" class="mx-reset" (click)="resetFiltros()">Limpiar filtros</button>
    <button type="button" class="mx-export" (click)="exportarExcel()"
      [disabled]="exporting || !dash"> …contenido actual… </button>
    <button type="button" class="mx-apply" …> …Aplicar filtro (se conserva)… </button>
  </div>
</div>
```

**Sobre el contador `filtrosActivos`:** se conserva la información, pero ya no como badge suelto; se muestra inline en el texto `.mx-fpanel-info` cuando es > 0 (p. ej. `· 2 filtros activos`). Evita perder la señal y deja el pie limpio. *Si prefieres borrarlo del todo, se elimina el getter `filtrosActivos` (metrics.ts:416).*

## 2 · SCSS del pie

Nuevo `.mx-fpanel-actions`: `inline-flex`, `gap: 8px`, `flex-wrap: wrap`, alineado a la derecha.

**Eliminar** del SCSS: `.mx-fpanel-head` (:31), `.mx-fpanel-title` (:37), `.mx-fpanel-count` (:46), `.mx-fpanel-head-right` (:56) y su referencia en el media query (:1167 `.mx-fpanel-head { width: 100%; }`).

**Conservar** `.mx-export` (:294) — *también lo usa el botón «Reintentar» del estado de error (html:207)* — y `.mx-reset` (:430), `.mx-apply` (:319).

Ajustar `.mx-apply` a `height: 36px` (igual que `.mx-export`/`.mx-reset`) para que los tres botones del pie midan igual.

## 3 · Pestañas: cards pequeñas + deslizamiento

### HTML (html:189–195)
Añadir un indicador deslizante y refs a los botones:

```html
<nav class="mx-tabs" role="tablist">
  <span class="mx-tab-ind" aria-hidden="true"
    [style.width.px]="tabIndW"
    [style.transform]="'translateX(' + tabIndX + 'px)'"></span>
  @for (t of tabs; track t.id) {
    <button type="button" #tabBtn class="mx-tab" [class.active]="tab === t.id"
      [attr.aria-selected]="tab === t.id" (click)="setTab(t.id)">{{ t.label }}</button>
  }
</nav>
```

### TS (metrics.ts)
- Importar `QueryList`, `AfterViewInit` (junto a los existentes de `@angular/core`).
- `@ViewChildren('tabBtn') tabBtns?: QueryList<ElementRef<HTMLButtonElement>>;`
- Campos `tabIndX = 0;` y `tabIndW = 0;`
- `private medirTabActiva()`: busca el índice de `this.tab` en `tabs`, toma `offsetLeft`/`offsetWidth` del botón y los copia a `tabIndX`/`tabIndW`.
- `ngAfterViewInit()` → `medirTabActiva()`.
- En `setTab()` (ya existe, :297): tras `this.tab = tab`, `setTimeout(() => this.medirTabActiva())` para medir post-render.
- `@HostListener('window:resize')` → `medirTabActiva()` (los offsets cambian al reflow).

### SCSS (:444–465)
Reemplazar `.mx-tabs`/`.mx-tab`:

- `.mx-tabs`: `position: relative`, contenedor tipo segmented control (`background: var(--bg)`, `border: 1px solid var(--border)`, `border-radius: 12px`, `padding: 4px`), `flex-wrap: nowrap` + `overflow-x: auto` y scrollbar oculto — *evita que el indicador absoluto se rompa al hacer wrap en pantallas angostas*.
- `.mx-tab-ind`: `position: absolute`, alto `calc(100% - 8px)`, `border-radius: 9px`, fondo `var(--primary)`, sombra suave; `transition: transform .32s cubic-bezier(.4,0,.2,1), width .32s …` → **el efecto de deslizamiento**.
- `.mx-tab` (card pequeña): `border: 0`, `border-radius: 9px`, fondo transparente, `color: var(--text-muted)`; `&.active { color: #fff; font-weight: 700; }`; `z-index: 1` para quedar **encima** del indicador.
- Hover inactivo: texto a `var(--text)`.

Resultado: fila de cards pequeñas sobre un riel; la card azul activa se **desliza** suavemente de una pestaña a otra.

## Verificación
- `npx ng build --configuration development` en `frontend/` → verde.
- Manual: el pie muestra `Limpiar filtros · Descargar Excel · Aplicar filtro`; ya no existe el título «Filtros de métricas».
- Manual: al cambiar de pestaña la card azul se desliza; en móvil las pestañas hacen scroll horizontal sin romper el indicador.
- Manual: «Reintentar» (estado de error) sigue con su estilo `.mx-export` intacto.
