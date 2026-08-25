import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { PiCategoria } from './entities/pi-categoria.entity';
import { PiCampo } from './entities/pi-campo.entity';
import { PiValor } from './entities/pi-valor.entity';
import { PiHistorial } from './entities/pi-historial.entity';
import {
  CreatePiCampoDto,
  CreatePiCategoriaDto,
  UpdatePiCampoDto,
  UpdatePiCategoriaDto,
  UpsertPiValoresDto,
} from './dto/perfil-institucional.dto';

interface ListarQuery {
  q?: string;
  calendario?: string;
  tipo?: string;
  asesor?: string;
  estado?: string;
  sort?: string;
}

@Injectable()
export class PerfilInstitucionalService {
  constructor(
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    @InjectRepository(PiCategoria)
    private readonly categoriaRepo: Repository<PiCategoria>,
    @InjectRepository(PiCampo) private readonly campoRepo: Repository<PiCampo>,
    @InjectRepository(PiValor) private readonly valorRepo: Repository<PiValor>,
    @InjectRepository(PiHistorial)
    private readonly historialRepo: Repository<PiHistorial>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  private sinAcentos(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // ── Instituciones ────────────────────────────────────────────────────────

  async listarInstituciones(query: ListarQuery & Record<string, string>) {
    const q = this.sinAcentos((query.q ?? '').trim().toLowerCase());

    const [colegios, campos, valores] = await Promise.all([
      this.colegioRepo.find({ relations: { advisor: true } }),
      this.campoRepo.find({
        where: { activo: true },
        relations: { categoria: true },
      }),
      this.valorRepo.find(),
    ]);

    const valoresPorColegio = new Map<string, Map<string, string | null>>();
    for (const v of valores) {
      if (!valoresPorColegio.has(v.colegioId))
        valoresPorColegio.set(v.colegioId, new Map());
      valoresPorColegio.get(v.colegioId)!.set(v.campoId, v.valor);
    }

    const filtrosCustom = Object.entries(query)
      .filter(([k, v]) => k.startsWith('f_') && v !== '' && v != null)
      .map(([k, v]) => [k.slice(2), String(v).toLowerCase()] as const);

    const resultado = colegios.filter((c) => {
      if (query.calendario) {
        const allowed = query.calendario.split(',').map(s => s.trim());
        if (!allowed.includes(c.calendario ?? '')) return false;
      }
      if (query.tipo) {
        const allowed = query.tipo.split(',').map(s => s.trim());
        if (!allowed.includes(c.tipoColegio ?? '')) return false;
      }
      if (query.asesor) {
        const allowed = query.asesor.split(',').map(s => s.trim().toLowerCase());
        const nombre = (c.advisor?.name ?? '').toLowerCase();
        if (!allowed.includes(nombre)) return false;
      }
      if (query.estado === 'activo' && !c.activo) return false;
      if (query.estado === 'inactivo' && c.activo) return false;

      const vals =
        valoresPorColegio.get(c.id) ?? new Map<string, string | null>();

      for (const [campoId, esperado] of filtrosCustom) {
        const real = (vals.get(campoId) ?? '').toLowerCase();
        if (real !== esperado) return false;
      }

      if (q) {
        const enBase =
          this.sinAcentos(c.nombre.toLowerCase()).includes(q) ||
          this.sinAcentos((c.email ?? '').toLowerCase()).includes(q) ||
          this.sinAcentos(c.link.toLowerCase()).includes(q) ||
          c.id.includes(q);
        let enValores = false;
        for (const valor of vals.values()) {
          if (valor && this.sinAcentos(valor.toLowerCase()).includes(q)) {
            enValores = true;
            break;
          }
        }
        if (!enBase && !enValores) return false;
      }

      return true;
    });

    const sort = query.sort ?? 'nombre';
    resultado.sort((a, b) => {
      if (sort === 'id') return a.id < b.id ? -1 : 1;
      if (sort === 'nombre-desc') return b.nombre.localeCompare(a.nombre, 'es');
      if (sort === 'asesor') {
        const na = (a.advisor?.name ?? '').localeCompare(b.advisor?.name ?? '', 'es');
        if (na !== 0) return na;
        return a.nombre.localeCompare(b.nombre, 'es');
      }
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(query.limit ?? '15', 10) || 15),
    );
    const total = resultado.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const inicio = (Math.min(page, pages) - 1) * limit;

    return {
      total,
      page,
      limit,
      pages,
      asesoresDisponibles: [...new Set(
        colegios
          .map(c => c.advisor?.name)
          .filter((n): n is string => !!n && n.trim() !== '')
          .sort((a, b) => a.localeCompare(b, 'es'))
      )],
      instituciones: resultado.slice(inicio, inicio + limit).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        link: c.link,
        email: c.email,
        logoUrl: c.logoUrl,
        activo: c.activo,
        calendario: c.calendario,
        tipoColegio: c.tipoColegio,
        advisorNombre: c.advisor?.name ?? null,
        valores: Object.fromEntries(valoresPorColegio.get(c.id) ?? []),
      })),
      camposFiltrables: campos
        .filter((f) => f.filtrable)
        .map((f) => ({
          id: f.id,
          nombre: f.nombre,
          tipo: f.tipo,
          opciones: f.opciones,
        })),
    };
  }

  async obtenerFicha(colegioId: string) {
    const colegio = await this.colegioRepo.findOne({
      where: { id: colegioId },
      relations: { advisor: true },
    });
    if (!colegio) throw new NotFoundException('Institución no encontrada');

    const [campos, valores] = await Promise.all([
      this.campoRepo.find({
        where: { activo: true, mostrarPerfil: true },
        relations: { categoria: true },
      }),
      this.valorRepo.find({
        where: { colegioId } as FindOptionsWhere<PiValor>,
      }),
    ]);

    const valoresMap = new Map(valores.map((v) => [v.campoId, v.valor]));
    const ultimaActualizacion = valores.reduce<Date | null>(
      (max, v) => (!max || v.updatedAt > max ? v.updatedAt : max),
      null,
    );

    // Deduplicar categorías por ID (TypeORM devuelve una instancia distinta
    // de la relación por cada campo, un Set por referencia no funciona)
    const categoriasMap = new Map<string, PiCategoria>();
    for (const campo of campos) {
      if (campo.categoria && !categoriasMap.has(campo.categoria.id)) {
        categoriasMap.set(campo.categoria.id, campo.categoria);
      }
    }
    const categorias = [...categoriasMap.values()]
      .filter((cat) => cat.activa)
      .sort((a, b) => a.orden - b.orden);

    const grupos = categorias.map((cat) => ({
      categoriaId: cat.id,
      categoriaNombre: cat.nombre,
      categoriaEsSistema: cat.esSistema,
      campos: campos
        .filter((f) => f.categoriaId === cat.id)
        .sort(
          (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
        )
        .map((f) => ({
          campo: f,
          valor: valoresMap.get(f.id) ?? null,
        })),
    }));

    return {
      institucion: {
        id: colegio.id,
        nombre: colegio.nombre,
        link: colegio.link,
        email: colegio.email,
        logoUrl: colegio.logoUrl,
        activo: colegio.activo,
        calendario: colegio.calendario,
        tipoColegio: colegio.tipoColegio,
        advisorNombre: colegio.advisor?.name ?? null,
      },
      grupos,
      ultimaActualizacion,
    };
  }

  async guardarValores(
    colegioId: string,
    dto: UpsertPiValoresDto,
    userId: string,
  ) {
    const colegio = await this.colegioRepo.findOneBy({ id: colegioId });
    if (!colegio) throw new NotFoundException('Institución no encontrada');
    if (!dto.valores?.length)
      throw new BadRequestException('Sin valores para guardar');

    const ids = [...new Set(dto.valores.map((v) => v.campoId))];
    const campos = await this.campoRepo.findBy({ id: In(ids) });
    if (campos.length !== ids.length)
      throw new BadRequestException('Campo desconocido');

    let cambios = 0;
    for (const item of dto.valores) {
      const campo = campos.find((c) => c.id === item.campoId)!;
      const nuevo = item.valor == null || item.valor === '' ? null : item.valor;

      let registro = await this.valorRepo.findOneBy({
        colegioId,
        campoId: campo.id,
      });
      const anterior = registro?.valor ?? null;

      if ((registro?.valor ?? null) === nuevo) continue;

      if (registro) {
        registro.valor = nuevo;
        registro.updatedBy = { id: userId } as User;
      } else {
        registro = this.valorRepo.create({
          colegioId,
          campoId: campo.id,
          valor: nuevo,
          updatedBy: { id: userId } as User,
        });
      }
      await this.valorRepo.save(registro);

      await this.historialRepo.insert({
        colegioId,
        campoId: campo.id,
        usuario: { id: userId } as User,
        accion: 'actualizar_valor',
        valorAnterior: anterior,
        valorNuevo: nuevo,
      });
      cambios++;
    }

    return { ok: true, cambios };
  }

  async subirLogo(
    colegioId: string,
    filePath: string,
    urlPublica: string,
    userId: string,
  ) {
    const colegio = await this.colegioRepo.findOneBy({ id: colegioId });
    if (!colegio) throw new NotFoundException('Institución no encontrada');

    const anterior = colegio.logoUrl;
    colegio.logoUrl = urlPublica;
    await this.colegioRepo.save(colegio);

    if (anterior && anterior.startsWith('/uploads/perfil/')) {
      const viejo = join(
        process.cwd(),
        'uploads',
        'perfil',
        anterior.split('/').pop() ?? '',
      );
      try {
        if (existsSync(viejo)) unlinkSync(viejo);
      } catch {
        /* noop */
      }
    }

    await this.historialRepo.insert({
      colegioId,
      usuario: { id: userId } as User,
      accion: 'actualizar_logo',
      valorAnterior: anterior,
      valorNuevo: urlPublica,
    });

    void filePath;
    return { ok: true, logoUrl: urlPublica };
  }

  async cambiarEstado(colegioId: string, activo: boolean, userId: string) {
    const colegio = await this.colegioRepo.findOneBy({ id: colegioId });
    if (!colegio) throw new NotFoundException('Institución no encontrada');

    const anterior = colegio.activo;
    colegio.activo = activo;
    await this.colegioRepo.save(colegio);

    await this.historialRepo.insert({
      colegioId,
      usuario: { id: userId } as User,
      accion: 'cambiar_estado',
      valorAnterior: anterior ? 'true' : 'false',
      valorNuevo: activo ? 'true' : 'false',
    });

    return { ok: true, activo };
  }

  moverArchivoLogo(file: Express.Multer.File, colegioId: string): string {
    const dir = join(process.cwd(), 'uploads', 'perfil');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ext =
      file.originalname.substring(file.originalname.lastIndexOf('.')) || '.jpg';
    const finalName = `logo-${colegioId.substring(0, 8)}-${Date.now()}${ext}`;
    renameSync(file.path, join(dir, finalName));
    return `/uploads/perfil/${finalName}`;
  }

  // ── Campos ───────────────────────────────────────────────────────────────

  listarCampos() {
    return this.campoRepo.find({
      relations: { categoria: true },
      order: { orden: 'ASC', nombre: 'ASC' },
    });
  }

  private validarOpciones(
    tipo: string,
    opciones?: { valor: string; orden?: number }[],
  ) {
    if (tipo !== 'lista') return [];
    if (!opciones?.length)
      throw new BadRequestException('Un campo tipo lista requiere opciones');
    return opciones.map((o, i) => ({
      valor: o.valor.trim(),
      orden: o.orden ?? i,
    }));
  }

  async crearCampo(dto: CreatePiCampoDto) {
    const categoria = await this.categoriaRepo.findOneBy({
      id: dto.categoriaId,
    });
    if (!categoria) throw new BadRequestException('Categoría desconocida');

    const opciones = this.validarOpciones(dto.tipo, dto.opciones);
    const campo = await this.campoRepo.save(
      this.campoRepo.create({ ...dto, opciones }),
    );

    await this.historialRepo.insert({
      campoId: campo.id,
      accion: 'crear_campo',
      valorNuevo: `${campo.nombre} (${campo.tipo})`,
    });

    return this.campoRepo.findOneOrFail({
      where: { id: campo.id },
      relations: { categoria: true },
    });
  }

  async actualizarCampo(id: string, dto: UpdatePiCampoDto) {
    const campo = await this.campoRepo.findOneBy({ id });
    if (!campo) throw new NotFoundException('Campo no encontrado');

    const datos: Partial<PiCampo> = { ...dto, opciones: undefined };
    if (dto.opciones)
      datos.opciones = this.validarOpciones(
        datos.tipo ?? campo.tipo,
        dto.opciones,
      );

    await this.campoRepo.update(id, datos);
    await this.historialRepo.insert({
      campoId: id,
      accion: 'editar_campo',
      valorNuevo: datos.nombre ?? campo.nombre,
    });

    return this.campoRepo.findOneOrFail({
      where: { id },
      relations: { categoria: true },
    });
  }

  async duplicarCampo(id: string) {
    const campo = await this.campoRepo.findOneBy({ id });
    if (!campo) throw new NotFoundException('Campo no encontrado');

    const copia = await this.campoRepo.save(
      this.campoRepo.create({
        ...campo,
        id: undefined,
        nombre: `${campo.nombre} (copia)`,
        esSistema: false,
      } as Partial<PiCampo>),
    );

    await this.historialRepo.insert({
      campoId: copia.id,
      accion: 'crear_campo',
      valorNuevo: `Duplicado de ${campo.nombre}`,
    });

    return this.campoRepo.findOneOrFail({
      where: { id: copia.id },
      relations: { categoria: true },
    });
  }

  async eliminarCampo(id: string) {
    const campo = await this.campoRepo.findOneBy({ id });
    if (!campo) throw new NotFoundException('Campo no encontrado');

    await this.campoRepo.delete(id);
    return { ok: true };
  }

  // ── Categorías ───────────────────────────────────────────────────────────

  listarCategorias() {
    return this.categoriaRepo.find({ order: { orden: 'ASC', nombre: 'ASC' } });
  }

  async crearCategoria(dto: CreatePiCategoriaDto) {
    const existe = await this.categoriaRepo.findOneBy({ nombre: dto.nombre });
    if (existe)
      throw new BadRequestException('Ya existe una categoría con ese nombre');
    return this.categoriaRepo.save(this.categoriaRepo.create(dto));
  }

  async actualizarCategoria(id: string, dto: UpdatePiCategoriaDto) {
    const categoria = await this.categoriaRepo.findOneBy({ id });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    await this.categoriaRepo.update(id, dto);
    return this.categoriaRepo.findOneByOrFail({ id });
  }

  async eliminarCategoria(id: string) {
    const categoria = await this.categoriaRepo.findOneBy({ id });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');

    const conCampos = await this.campoRepo.countBy({ categoriaId: id });
    if (conCampos > 0) {
      throw new BadRequestException(
        'La categoría tiene campos asociados; muévelos o elimínalos primero',
      );
    }

    await this.categoriaRepo.delete(id);
    return { ok: true };
  }

  async reordenarCategorias(items: { id: string; orden: number }[]) {
    for (const item of items) {
      await this.categoriaRepo.update(item.id, { orden: item.orden });
    }
    return { ok: true };
  }

  // ── Exportar / Importar ───────────────────────────────────────────────────

  async exportarExcel(): Promise<Buffer> {
    const [colegios, campos, valores] = await Promise.all([
      this.colegioRepo.find({ relations: { advisor: true }, order: { nombre: 'ASC' } }),
      this.campoRepo.find({ where: { activo: true }, relations: { categoria: true }, order: { orden: 'ASC', nombre: 'ASC' } }),
      this.valorRepo.find(),
    ]);

    const valoresPorColegio = new Map<string, Map<string, string | null>>();
    for (const v of valores) {
      if (!valoresPorColegio.has(v.colegioId)) valoresPorColegio.set(v.colegioId, new Map());
      valoresPorColegio.get(v.colegioId)!.set(v.campoId, v.valor);
    }

    const categoriasMap = new Map<string, { nombre: string; orden: number }>();
    for (const c of campos) {
      if (c.categoria && !categoriasMap.has(c.categoria.id)) {
        categoriasMap.set(c.categoria.id, { nombre: c.categoria.nombre, orden: c.categoria.orden });
      }
    }
    const categorias = [...categoriasMap.entries()].sort((a, b) => a[1].orden - b[1].orden);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Instituciones');

    const headers = ['Nombre', 'Email', 'Link', 'Calendario', 'Tipo', 'Asesor', 'Activo'];
    for (const [, cat] of categorias) {
      for (const c of campos.filter(f => f.categoriaId && categoriasMap.has(f.categoriaId) && categoriasMap.get(f.categoriaId)!.nombre === cat.nombre)) {
        headers.push(`${cat.nombre} > ${c.nombre}`);
      }
    }

    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

    for (const c of colegios) {
      const vals = valoresPorColegio.get(c.id) ?? new Map();
      const row: (string | null)[] = [
        c.nombre, c.email ?? '', c.link, c.calendario ?? '', c.tipoColegio ?? '',
        c.advisor?.name ?? '', c.activo ? 'Sí' : 'No',
      ];
      for (const [, cat] of categorias) {
        for (const campo of campos.filter(f => f.categoriaId && categoriasMap.has(f.categoriaId) && categoriasMap.get(f.categoriaId)!.nombre === cat.nombre)) {
          row.push(vals.get(campo.id) ?? '');
        }
      }
      ws.addRow(row);
    }

    for (const col of ws.columns) {
      if (!col) continue;
      let max = 10;
      col.eachCell!({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 4, 45);
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async exportarFichaExcel(colegioId: string): Promise<Buffer> {
    const ficha = await this.obtenerFicha(colegioId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ficha.institucion.nombre);

    const baseData = [
      ['Nombre', ficha.institucion.nombre],
      ['Email', ficha.institucion.email ?? ''],
      ['Link', ficha.institucion.link],
      ['Calendario', ficha.institucion.calendario ?? ''],
      ['Tipo', ficha.institucion.tipoColegio ?? ''],
      ['Asesor', ficha.institucion.advisorNombre ?? ''],
      ['Activo', ficha.institucion.activo ? 'Sí' : 'No'],
    ];

    for (const row of baseData) ws.addRow(row);

    for (const grupo of ficha.grupos) {
      ws.addRow([]);
      ws.addRow([grupo.categoriaNombre]).font = { bold: true, size: 12, color: { argb: 'FF2563EB' } };
      ws.addRow([grupo.categoriaNombre]).border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      for (const item of grupo.campos) {
        ws.addRow([item.campo.nombre, item.valor ?? '—']);
      }
    }

    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 60;

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async importarExcel(filePath: string, userId: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('Instituciones') ?? wb.worksheets[0];
    if (!ws || ws.rowCount < 2) throw new BadRequestException('El archivo no contiene datos válidos');

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNum) => {
      headers[colNum - 1] = String(cell.value ?? '').trim();
    });

    const [allCampos, allCategorias] = await Promise.all([
      this.campoRepo.find({ relations: { categoria: true } }),
      this.categoriaRepo.find(),
    ]);

    const catByName = new Map(allCategorias.map(c => [c.nombre.toLowerCase(), c]));
    const campoLookup = new Map<string, PiCampo>();
    for (const c of allCampos) {
      const catName = c.categoria?.nombre ?? '';
      const headerName = catName ? `${catName} > ${c.nombre}` : c.nombre;
      campoLookup.set(headerName.toLowerCase(), c);
    }

    const baseHeaders = ['nombre', 'email', 'link', 'calendario', 'tipo', 'asesor', 'activo'];
    let created = 0;
    let updated = 0;
    const errores: string[] = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nombreCell = row.getCell(1);
      const nombre = String(nombreCell.value ?? '').trim();
      if (!nombre) continue;

      let colegio = await this.colegioRepo.findOneBy({ nombre });
      if (!colegio) {
        const linkVal = String(row.getCell(3).value ?? '').trim() || 'https://';
        const emailVal = String(row.getCell(2).value ?? '').trim();
        const calendarioVal = String(row.getCell(4).value ?? '').trim() || undefined;
        const tipoVal = String(row.getCell(5).value ?? '').trim() || undefined;
        const activoVal = String(row.getCell(7).value ?? 'Sí').trim().toLowerCase();
        const nuevo = this.colegioRepo.create({
          nombre, link: linkVal, email: emailVal,
          calendario: calendarioVal as any, tipoColegio: tipoVal as any,
          activo: activoVal !== 'no' && activoVal !== 'false',
        });
        colegio = await this.colegioRepo.save(nuevo);
        created++;
      } else {
        updated++;
      }

      const valoresToSave: { campoId: string; valor: string | null }[] = [];
      for (let c = 1; c < headers.length; c++) {
        const h = headers[c]?.toLowerCase() ?? '';
        if (baseHeaders.includes(h)) continue;
        const campo = campoLookup.get(h);
        if (!campo) continue;
        const val = String(row.getCell(c + 1).value ?? '').trim() || null;
        valoresToSave.push({ campoId: campo.id, valor: val });
      }

      const colegioId = Array.isArray(colegio) ? colegio[0].id : colegio.id;

      if (valoresToSave.length > 0) {
        await this.guardarValores(colegioId, { valores: valoresToSave }, userId);
      }
    }

    try { unlinkSync(filePath); } catch { /* noop */ }

    return { ok: true, created, updated, total: created + updated, errores };
  }

  // ── Historial ────────────────────────────────────────────────────────────

  async listarHistorial(
    colegioId: string | undefined,
    page = '1',
    limit = '30',
  ) {
    const pag = Math.max(1, parseInt(page, 10) || 1);
    const porPagina = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    const qb = this.historialRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.usuario', 'u')
      .orderBy('h.createdAt', 'DESC')
      .skip((pag - 1) * porPagina)
      .take(porPagina);

    if (colegioId) qb.where('h.colegio_id = :colegioId', { colegioId });

    const [data, total] = await qb.getManyAndCount();
    const nombresCampos = await this.nombresDeCampos(data);

    return {
      data: data.map((h) => ({
        ...h,
        usuario: h.usuario ? { id: h.usuario.id, name: h.usuario.name } : null,
        campoNombre: h.campoId ? (nombresCampos.get(h.campoId) ?? null) : null,
      })),
      total,
      page: pag,
      limit: porPagina,
      pages: Math.ceil(total / porPagina),
    };
  }

  private async nombresDeCampos(
    registros: PiHistorial[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        registros.map((r) => r.campoId).filter((x): x is string => !!x),
      ),
    ];
    if (!ids.length) return new Map();
    const filas = await this.campoRepo.find({
      where: { id: In(ids) },
      select: ['id', 'nombre'],
    });
    return new Map(filas.map((f) => [f.id, f.nombre]));
  }
}
