import ExcelJS from 'exceljs';
import { ColumnaReporte } from './importar-helpers.util';

/** Estado de una fila del archivo al momento de importar. */
export type EstadoFila = 'crear' | 'actualizar' | 'sin-cambios' | 'duplicada';

export interface CambioImport {
  campo: string;
  anterior: string | null;
  nuevo: string | null;
}

export interface FilaImport {
  fila: number;
  nombre: string;
  estado: EstadoFila;
  cambios: CambioImport[];
  avisos: string[];
}

export interface AvisoImport {
  fila: number | null;
  nombre: string | null;
  campo: string | null;
  mensaje: string;
}

export interface ResumenImport {
  filasArchivo: number;
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  duplicadas: number;
  conAvisos: number;
  columnasIgnoradas: number;
}

export function construirResumen(
  filas: FilaImport[],
  columnas: ColumnaReporte[],
): ResumenImport {
  const conteo = (e: EstadoFila) => filas.filter((f) => f.estado === e).length;
  return {
    filasArchivo: filas.length,
    creadas: conteo('crear'),
    actualizadas: conteo('actualizar'),
    sinCambios: conteo('sin-cambios'),
    duplicadas: conteo('duplicada'),
    conAvisos: filas.filter((f) => f.avisos.length > 0).length,
    columnasIgnoradas: columnas.filter((c) => c.estado === 'ignorada').length,
  };
}

const ESTADO_META: Record<EstadoFila, { label: string; fg: string; bg: string }> = {
  crear: { label: 'Creada', fg: 'FF1B5E20', bg: 'FFE8F5E9' },
  actualizar: { label: 'Actualizada', fg: 'FF0D47A1', bg: 'FFE3F2FD' },
  'sin-cambios': { label: 'Sin cambios', fg: 'FF334155', bg: 'FFF1F5F9' },
  duplicada: { label: 'Duplicada', fg: 'FFBF360C', bg: 'FFFFF3E0' },
};

const HEADER_BG = 'FF1E293B';

function estiloHeader(fila: ExcelJS.Row) {
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  fila.height = 24;
}

function ancho(ws: ExcelJS.Worksheet, anchos: number[]) {
  anchos.forEach((w, i) => {
    const col = ws.getColumn(i + 1);
    if (col) col.width = w;
  });
}

/**
 * Excel de reporte de importación, multi-hoja:
 * Resumen | Instituciones | Cambios | Avisos | Columnas.
 */
export async function construirExcelReporte(opts: {
  archivo: string;
  resumen: ResumenImport;
  filas: FilaImport[];
  avisos: AvisoImport[];
  columnas: ColumnaReporte[];
}): Promise<Buffer> {
  const { archivo, resumen, filas, avisos, columnas } = opts;
  const wb = new ExcelJS.Workbook();

  // ── Resumen ──────────────────────────────────────────────────────────────
  const rs = wb.addWorksheet('Resumen');
  rs.mergeCells('A1:D1');
  const titulo = rs.getCell('A1');
  titulo.value = 'Reporte de importación — Perfil Institucional';
  titulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  titulo.alignment = { vertical: 'middle', horizontal: 'center' };
  rs.getRow(1).height = 30;

  rs.addRow([]);
  rs.addRow(['Archivo', archivo]);
  rs.addRow(['Fecha', new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })]);
  rs.addRow([]);

  const tabla = rs.addRow(['Concepto', 'Cantidad']);
  estiloHeader(tabla);
  const metricas: [string, number, string, string][] = [
    ['Filas en el archivo', resumen.filasArchivo, 'FF334155', 'FFF8FAFC'],
    ['Instituciones creadas', resumen.creadas, 'FF1B5E20', 'FFE8F5E9'],
    ['Instituciones actualizadas', resumen.actualizadas, 'FF0D47A1', 'FFE3F2FD'],
    ['Sin cambios', resumen.sinCambios, 'FF475569', 'FFF1F5F9'],
    ['Filas duplicadas (omitidas)', resumen.duplicadas, 'FFBF360C', 'FFFFF3E0'],
    ['Filas con avisos', resumen.conAvisos, 'FF854D0E', 'FFFEF9C3'],
    ['Columnas ignoradas', resumen.columnasIgnoradas, 'FFB91C1C', 'FFFEE2E2'],
    ['Avisos totales', avisos.length, 'FF854D0E', 'FFFEF9C3'],
  ];
  for (const [label, n, fg, bg] of metricas) {
    const r = rs.addRow([label, n]);
    r.getCell(1).font = { bold: true, color: { argb: fg } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(2).font = { bold: true, color: { argb: fg } };
  }
  ancho(rs, [36, 44, 14, 14]);

  // ── Instituciones ────────────────────────────────────────────────────────
  const is = wb.addWorksheet('Instituciones');
  is.addRow(['Fila', 'Institución', 'Estado', 'Cambios', 'Avisos']);
  estiloHeader(is.getRow(1));
  for (const f of filas) {
    const meta = ESTADO_META[f.estado];
    const r = is.addRow([f.fila, f.nombre, meta.label, f.cambios.length, f.avisos.length]);
    const celda = r.getCell(3);
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.bg } };
    celda.font = { bold: true, color: { argb: meta.fg } };
    celda.alignment = { horizontal: 'center' };
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(4).alignment = { horizontal: 'center' };
    r.getCell(5).alignment = { horizontal: 'center' };
  }
  is.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
  ancho(is, [8, 40, 16, 12, 10]);

  // ── Cambios ──────────────────────────────────────────────────────────────
  const cs = wb.addWorksheet('Cambios');
  cs.addRow(['Fila', 'Institución', 'Campo', 'Anterior', 'Nuevo']);
  estiloHeader(cs.getRow(1));
  let cambiosTotal = 0;
  for (const f of filas) {
    for (const c of f.cambios) {
      cambiosTotal++;
      const r = cs.addRow([f.fila, f.nombre, c.campo, c.anterior ?? '—', c.nuevo ?? '—']);
      r.getCell(4).font = { color: { argb: 'FFB91C1C' } };
      r.getCell(5).font = { color: { argb: 'FF15803D' }, bold: true };
      r.getCell(1).alignment = { horizontal: 'center' };
    }
  }
  if (!cambiosTotal) cs.addRow(['', '', '(sin cambios)', '', '']);
  cs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
  ancho(cs, [8, 40, 28, 34, 34]);

  // ── Avisos ───────────────────────────────────────────────────────────────
  const av = wb.addWorksheet('Avisos');
  av.addRow(['Fila', 'Institución', 'Campo', 'Detalle']);
  estiloHeader(av.getRow(1));
  for (const a of avisos) {
    const r = av.addRow([a.fila ?? '—', a.nombre ?? '—', a.campo ?? '—', a.mensaje]);
    r.getCell(4).font = { color: { argb: 'FF854D0E' } };
    r.getCell(1).alignment = { horizontal: 'center' };
  }
  if (!avisos.length) av.addRow(['—', '—', '—', 'Sin avisos']);
  ancho(av, [8, 38, 24, 70]);

  // ── Columnas ─────────────────────────────────────────────────────────────
  const cl = wb.addWorksheet('Columnas');
  cl.addRow(['Columna en el archivo', 'Asignada a', 'Estado', 'Detalle']);
  estiloHeader(cl.getRow(1));
  const estadoCol: Record<string, { label: string; fg: string; bg: string }> = {
    mapeada: { label: 'Mapeada', fg: 'FF1B5E20', bg: 'FFE8F5E9' },
    ignorada: { label: 'Ignorada', fg: 'FFB91C1C', bg: 'FFFEE2E2' },
    ausente: { label: 'Sin columna', fg: 'FF854D0E', bg: 'FFFEF9C3' },
  };
  for (const c of columnas) {
    const meta = estadoCol[c.estado];
    const r = cl.addRow([c.origen, c.destino, meta.label, c.detalle ?? '']);
    const cell = r.getCell(3);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.bg } };
    cell.font = { bold: true, color: { argb: meta.fg } };
    cell.alignment = { horizontal: 'center' };
  }
  ancho(cl, [40, 40, 16, 70]);

  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  return buffer;
}
