import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import ExcelJS from 'exceljs';
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { normalizarTipoColegio } from '../common/tipo-colegio.util';
import { crearBackupColegios } from '../common/import-snapshot.util';
import {
  CampoRef,
  ColumnaReporte,
  canonizarCorreosGuardados,
  claveNombre,
  construirCorreos,
  mapearColumnas,
} from './importar-helpers.util';
import {
  AvisoImport,
  CambioImport,
  EstadoFila,
  FilaImport,
  ResumenImport,
  construirExcelReporte,
  construirResumen,
} from './importar-reporte.util';
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
    @InjectDataSource() private readonly dataSource: DataSource,
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
        const allowed = query.calendario.split(',').map((s) => s.trim());
        if (!allowed.includes(c.calendario ?? '')) return false;
      }
      if (query.tipo) {
        const allowed = query.tipo.split(',').map((s) => s.trim());
        if (!allowed.includes(c.tipoColegio ?? '')) return false;
      }
      if (query.asesor) {
        const allowed = query.asesor
          .split(',')
          .map((s) => s.trim().toLowerCase());
        const nombre = (c.advisor?.name ?? '').toLowerCase();
        if (!allowed.includes(nombre)) return false;
      }
      if (query.estado) {
        const estado = query.estado.trim().toLowerCase();
        if (estado === 'activo' && !c.activo) return false;
        if (estado === 'inactivo' && c.activo) return false;
        if (['true', '1'].includes(estado) && !c.activo) return false;
        if (['false', '0'].includes(estado) && c.activo) return false;
      }

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
        const na = (a.advisor?.name ?? '').localeCompare(
          b.advisor?.name ?? '',
          'es',
        );
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
      asesoresDisponibles: [
        ...new Set(
          colegios
            .map((c) => c.advisor?.name)
            .filter((n): n is string => !!n && n.trim() !== '')
            .sort((a, b) => a.localeCompare(b, 'es')),
        ),
      ],
      instituciones: resultado.slice(inicio, inicio + limit).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        link: c.link,
        email: c.email,
        logoUrl: c.logoUrl,
        activo: c.activo,
        calendario: c.calendario,
        tipoColegio: c.tipoColegio,
        ciudad: c.ciudad,
        advisorNombre: c.advisor?.name ?? null,
        valores: Object.fromEntries(valoresPorColegio.get(c.id) ?? []),
      })),
      camposFiltrables: campos.map((f) => ({
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
        ciudad: colegio.ciudad,
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

  async actualizarEmailInstitucion(
    colegioId: string,
    email: string | null,
    userId: string,
  ) {
    const colegio = await this.colegioRepo.findOneBy({ id: colegioId });
    if (!colegio) throw new NotFoundException('Institución no encontrada');

    const anterior = colegio.email;
    if (anterior === email) return { ok: true, email: anterior };

    colegio.email = email ?? '';
    await this.colegioRepo.save(colegio);

    await this.historialRepo.insert({
      colegioId,
      usuario: { id: userId } as User,
      accion: 'actualizar_valor',
      valorAnterior: anterior,
      valorNuevo: email,
    });

    return { ok: true, email };
  }

  async actualizarCiudad(
    colegioId: string,
    ciudad: string | null,
    userId: string,
  ) {
    const colegio = await this.colegioRepo.findOneBy({ id: colegioId });
    if (!colegio) throw new NotFoundException('Institución no encontrada');

    const anterior = colegio.ciudad;
    const valor = ciudad && ciudad.trim() ? ciudad.trim().slice(0, 100) : null;
    if (anterior === valor) return { ok: true, ciudad: anterior };

    colegio.ciudad = valor;
    await this.colegioRepo.save(colegio);

    await this.historialRepo.insert({
      colegioId,
      usuario: { id: userId } as User,
      accion: 'actualizar_valor',
      valorAnterior: anterior,
      valorNuevo: valor,
    });

    return { ok: true, ciudad: valor };
  }

  async actualizarCamposBase(
    colegioId: string,
    dto: {
      nombre?: string;
      link?: string;
      calendario?: string | null;
      tipoColegio?: string | null;
      advisorId?: string | null;
    },
    userId: string,
  ) {
    const colegio = await this.colegioRepo.findOne({
      where: { id: colegioId },
      relations: { advisor: true },
    });
    if (!colegio) throw new NotFoundException('Institución no encontrada');

    const logs: {
      campo: string;
      anterior: string | null;
      nuevo: string | null;
    }[] = [];

    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim().slice(0, 200);
      if (nombre && nombre !== colegio.nombre) {
        const dup = await this.colegioRepo.findOne({ where: { nombre } });
        if (dup)
          throw new NotFoundException(
            `Ya existe un colegio con el nombre "${nombre}"`,
          );
        logs.push({ campo: 'Nombre', anterior: colegio.nombre, nuevo: nombre });
        colegio.nombre = nombre;
      }
    }
    if (dto.link !== undefined) {
      const link = dto.link.trim().slice(0, 500);
      if (link && link !== colegio.link) {
        logs.push({ campo: 'Link', anterior: colegio.link, nuevo: link });
        colegio.link = link;
      }
    }
    if (dto.calendario !== undefined) {
      const val =
        dto.calendario && dto.calendario.trim()
          ? dto.calendario.trim().slice(0, 5)
          : null;
      if (val !== colegio.calendario) {
        logs.push({
          campo: 'Calendario',
          anterior: colegio.calendario,
          nuevo: val,
        });
        colegio.calendario = val;
      }
    }
    if (dto.tipoColegio !== undefined) {
      const val =
        dto.tipoColegio && dto.tipoColegio.trim()
          ? dto.tipoColegio.trim().slice(0, 100)
          : null;
      if (val !== colegio.tipoColegio) {
        logs.push({
          campo: 'Proyecto',
          anterior: colegio.tipoColegio,
          nuevo: val,
        });
        colegio.tipoColegio = val;
      }
    }
    if (dto.advisorId !== undefined) {
      const advisorId = dto.advisorId || null;
      let advisorNombre: string | null = null;
      if (advisorId) {
        const user = await this.userRepo
          .findOne({
            where: {
              id: advisorId,
              role: In(['advisor', 'admin']),
              active: true,
            },
            select: ['id', 'name'],
          })
          .catch(() => null);
        if (!user) throw new NotFoundException('Asesor no encontrado');
        advisorNombre = user.name ?? null;
      }
      if (advisorId !== colegio.advisorId) {
        logs.push({
          campo: 'Asesor',
          anterior: colegio.advisor?.name ?? null,
          nuevo: advisorNombre,
        });
        colegio.advisorId = advisorId;
        colegio.advisor = advisorId ? ({ id: advisorId } as User) : null;
      }
    }

    if (logs.length) {
      try {
        await this.colegioRepo.save(colegio);
        for (const log of logs) {
          await this.historialRepo.insert({
            colegioId,
            usuario: { id: userId } as User,
            accion: 'actualizar_valor',
            valorAnterior: log.anterior,
            valorNuevo: log.nuevo,
          });
        }
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new NotFoundException('Ya existe un colegio con ese nombre');
        }
        throw err;
      }
    } else {
      await this.colegioRepo.save(colegio);
    }

    const updated =
      (await this.colegioRepo.findOne({
        where: { id: colegioId },
        relations: { advisor: true },
      })) || colegio;

    return {
      ok: true,
      institucion: {
        id: updated.id,
        nombre: updated.nombre,
        link: updated.link,
        email: updated.email,
        calendario: updated.calendario,
        tipoColegio: updated.tipoColegio,
        ciudad: updated.ciudad,
        logoUrl: updated.logoUrl,
        activo: updated.activo,
        advisorNombre: updated.advisor?.name ?? null,
        advisorId: updated.advisorId,
      },
    };
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
    const { headers, rows } = await this.getDatosExport();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Instituciones');
    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
    });
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };

    for (const row of rows) {
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

  async exportarCsv(): Promise<string> {
    const { headers, rows } = await this.getDatosExport();
    const csvLines = [
      headers.map((h) => this.escapeCsvVal(h)).join(';'),
      ...rows.map((r) => r.map((v) => this.escapeCsvVal(v)).join(';')),
    ];
    return '\uFEFF' + csvLines.join('\n');
  }

  async getDatosExport(): Promise<{ headers: string[]; rows: (string | null)[][] }> {
    const [colegios, campos, valores] = await Promise.all([
      this.colegioRepo.find({
        relations: { advisor: true },
        order: { nombre: 'ASC' },
      }),
      this.campoRepo.find({
        where: { activo: true },
        relations: { categoria: true },
        order: { orden: 'ASC', nombre: 'ASC' },
      }),
      this.valorRepo.find(),
    ]);

    const valoresPorColegio = new Map<string, Map<string, string | null>>();
    for (const v of valores) {
      if (!valoresPorColegio.has(v.colegioId))
        valoresPorColegio.set(v.colegioId, new Map());
      valoresPorColegio.get(v.colegioId)!.set(v.campoId, v.valor);
    }

    const categoriasMap = new Map<string, { nombre: string; orden: number }>();
    for (const c of campos) {
      if (c.categoria && !categoriasMap.has(c.categoria.id)) {
        categoriasMap.set(c.categoria.id, {
          nombre: c.categoria.nombre,
          orden: c.categoria.orden,
        });
      }
    }
    const categorias = [...categoriasMap.entries()].sort(
      (a, b) => a[1].orden - b[1].orden,
    );

    const headers = [
      'Nombre',
      'Email',
      'Link',
      'Calendario',
      'Ciudad',
      'Tipo',
      'Asesor',
      'Activo',
    ];
    for (const [, cat] of categorias) {
      for (const c of campos.filter(
        (f) =>
          f.categoriaId &&
          categoriasMap.has(f.categoriaId) &&
          categoriasMap.get(f.categoriaId)!.nombre === cat.nombre,
      )) {
        headers.push(`${cat.nombre} > ${c.nombre}`);
      }
    }

    const rows: (string | null)[][] = [];
    for (const c of colegios) {
      const vals = valoresPorColegio.get(c.id) ?? new Map();
      const row: (string | null)[] = [
        c.nombre,
        c.email ?? '',
        c.link,
        c.calendario ?? '',
        c.ciudad ?? '',
        normalizarTipoColegio(c.tipoColegio) ?? '',
        c.advisor?.name ?? '',
        c.activo ? 'Sí' : 'No',
      ];
      for (const [, cat] of categorias) {
        for (const campo of campos.filter(
          (f) =>
            f.categoriaId &&
            categoriasMap.has(f.categoriaId) &&
            categoriasMap.get(f.categoriaId)!.nombre === cat.nombre,
        )) {
          let val = vals.get(campo.id) ?? '';
          if (campo.tipo === 'booleano' && val) {
            const lower = val.toLowerCase().trim();
            if (
              lower === 'true' ||
              lower === 'sí' ||
              lower === 'si' ||
              lower === 'activo'
            ) {
              val = 'Sí';
            } else if (
              lower === 'false' ||
              lower === 'no' ||
              lower === 'inactivo'
            ) {
              val = 'No';
            }
          }
          row.push(val);
        }
      }
      rows.push(row);
    }

    return { headers, rows };
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
      ['Ciudad', ficha.institucion.ciudad ?? ''],
      ['Tipo', normalizarTipoColegio(ficha.institucion.tipoColegio) ?? ''],
      ['Asesor', ficha.institucion.advisorNombre ?? ''],
      ['Activo', ficha.institucion.activo ? 'Sí' : 'No'],
    ];

    for (const row of baseData) ws.addRow(row);

    for (const grupo of ficha.grupos) {
      ws.addRow([]);
      ws.addRow([grupo.categoriaNombre]).font = {
        bold: true,
        size: 12,
        color: { argb: 'FF2563EB' },
      };
      ws.addRow([grupo.categoriaNombre]).border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      for (const item of grupo.campos) {
        let val = item.valor ?? '—';
        if (item.campo.tipo === 'booleano' && item.valor) {
          const lower = item.valor.toLowerCase().trim();
          if (
            lower === 'true' ||
            lower === 'sí' ||
            lower === 'si' ||
            lower === 'activo'
          ) {
            val = 'Sí';
          } else if (
            lower === 'false' ||
            lower === 'no' ||
            lower === 'inactivo'
          ) {
            val = 'No';
          }
        }
        ws.addRow([item.campo.nombre, val]);
      }
    }

    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 60;

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  private getCellValue(cell: any): string {
    if (!cell || cell.value == null) return '';
    const val = cell.value;
    if (typeof val === 'object') {
      if ('text' in val) return String(val.text || '').trim();
      if ('result' in val) return String(val.result || '').trim();
    }
    return String(val).trim();
  }

  private csvToRows(text: string): string[][] {
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean) return [];
    const firstLine = clean.split(/\r?\n/)[0] || '';
    const semis = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const delimiter = semis > commas ? ';' : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && clean[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    row.push(field);
    if (row.length > 1 || (row[0] || '').trim()) rows.push(row);
    return rows;
  }

  private escapeCsvVal(value: string | null | undefined): string {
    const v = (value ?? '').toString();
    return /("|;|,|\n|\r)/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  async importarExcel(
    filePath: string,
    userId: string,
    opts: { preview?: boolean; reasignarAsesores?: boolean } = {},
  ) {
    const { preview = false, reasignarAsesores = false } = opts;
    const MAX_FILAS = 10000;
    const archivoNombre = basename(filePath);
    const wb = new ExcelJS.Workbook();

    // ── Lectura del archivo (Excel o CSV) ───────────────────────────────
    if (/\.csv$/i.test(filePath)) {
      const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const rows = this.csvToRows(text);
      if (!rows.length)
        throw new BadRequestException('El archivo no contiene datos válidos');
      const wsCsv = wb.addWorksheet('Instituciones');
      for (const r of rows) wsCsv.addRow(r);
    } else {
      try {
        await wb.xlsx.readFile(filePath);
      } catch {
        throw new BadRequestException(
          'No se pudo leer el archivo Excel. Verifica que sea un .xlsx válido.',
        );
      }
    }

    const ws = wb.getWorksheet('Instituciones') ?? wb.worksheets[0];
    if (!ws || ws.rowCount < 2)
      throw new BadRequestException('El archivo no contiene datos válidos');
    if (ws.rowCount - 1 > MAX_FILAS)
      throw new BadRequestException(
        `El archivo supera el límite de ${MAX_FILAS} filas.`,
      );

    // ── Encabezados: la posición no importa, sólo el nombre ────────────
    const encabezados: { col: number; texto: string }[] = [];
    ws.getRow(1).eachCell((cell, colNum) => {
      const texto = this.getCellValue(cell);
      if (texto) encabezados.push({ col: colNum, texto });
    });

    const allCampos = await this.campoRepo.find({
      relations: { categoria: true },
    });
    const camposRef: CampoRef[] = allCampos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      categoria: c.categoria?.nombre ?? null,
    }));
    const campoById = new Map(allCampos.map((c) => [c.id, c]));
    const activos = allCampos
      .filter((c) => c.activo)
      .map((c) => ({ id: c.id, nombre: c.nombre, categoria: c.categoria?.nombre ?? null }));

    const mapeo = mapearColumnas(encabezados, camposRef, {
      ausentes: activos,
    });
    const colNombre = mapeo.base.get('nombre');
    if (colNombre == null) {
      const encontrados =
        encabezados.map((e) => `"${e.texto}"`).join(', ') ||
        '(sin encabezados)';
      throw new BadRequestException(
        `El archivo debe contener la columna "Nombre". Encabezados encontrados: ${encontrados}`,
      );
    }

    const avisos: AvisoImport[] = [];
    const avisar = (
      fila: number | null,
      nombre: string | null,
      campo: string | null,
      mensaje: string,
    ) => {
      avisos.push({ fila, nombre, campo, mensaje });
    };

    const truncate = (s: string | null | undefined, max: number): string => {
      if (s == null) return '';
      const v = String(s);
      return v.length > max ? v.slice(0, max) : v;
    };

    // ── Asesores (nombre único; ambiguo = no asignar) ───────────────────
    const allUsers = await this.userRepo.find({
      where: { role: In(['advisor', 'admin']), active: true },
      select: ['id', 'name'],
    });
    const advisorMap = new Map<string, string>();
    const advisorCount = new Map<string, number>();
    for (const u of allUsers) {
      if (!u.name) continue;
      const k = u.name.toLowerCase().trim();
      advisorMap.set(k, u.id);
      advisorCount.set(k, (advisorCount.get(k) ?? 0) + 1);
    }
    const resolverAsesor = (
      raw: string,
    ): { id: string | null; problema: 'no-encontrado' | 'ambiguo' | null } => {
      if (!raw) return { id: null, problema: null };
      const k = raw.toLowerCase().trim();
      if (advisorCount.get(k) === undefined)
        return { id: null, problema: 'no-encontrado' };
      if (advisorCount.get(k) === 1)
        return { id: advisorMap.get(k) ?? null, problema: null };
      return { id: null, problema: 'ambiguo' };
    };
    const nombreDeAsesor = (id: string): string =>
      allUsers.find((u) => u.id === id)?.name ?? '';

    const activoBoolFrom = (raw: string): boolean => {
      const val = raw.toLowerCase().trim();
      return (
        val === 'sí' ||
        val === 'si' ||
        val === 'true' ||
        val === 'activo' ||
        val === 'yes' ||
        val === 's' ||
        val === ''
      );
    };

    // ── Lectura de filas (todo lo que se descarta queda reportado) ──────
    type Fila = {
      r: number;
      nombre: string;
      key: string;
      link: string;
      emailCelda: string;
      emailPresente: boolean;
      calendario: string;
      ciudad: string;
      tipo: string;
      asesor: string;
      activoRaw: string;
      dinamicos: { campoId: string; valorBruto: string }[];
    };
    const filas: Fila[] = [];
    const duplicadas: FilaImport[] = [];
    const nombresVistos = new Map<string, number>();

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nombre = truncate(this.getCellValue(row.getCell(colNombre)), 200);
      if (!nombre) {
        let conContenido = false;
        row.eachCell({ includeEmpty: false }, (c) => {
          if (!conContenido && this.getCellValue(c)) conContenido = true;
        });
        if (conContenido)
          avisar(r, null, 'Nombre', 'Fila con datos pero sin nombre — omitida.');
        continue;
      }

      const key = claveNombre(nombre);
      if (nombresVistos.has(key)) {
        const mensaje = `Fila repetida en el archivo (ya leída en la fila ${nombresVistos.get(key)}) — se omite.`;
        avisar(r, nombre, 'Nombre', mensaje);
        duplicadas.push({
          fila: r,
          nombre,
          estado: 'duplicada',
          cambios: [],
          avisos: [mensaje],
        });
        continue;
      }
      nombresVistos.set(key, r);

      const cellVal = (col?: number): string =>
        col == null ? '' : this.getCellValue(row.getCell(col));

      const linkRaw = cellVal(mapeo.base.get('link'));
      const emailRaw = cellVal(mapeo.base.get('email'));
      const calendarioRaw = cellVal(mapeo.base.get('calendario'));
      const ciudadRaw = cellVal(mapeo.base.get('ciudad'));
      const tipoRaw = cellVal(mapeo.base.get('tipo'));
      const asesorRaw = cellVal(mapeo.base.get('asesor'));
      const activoRaw = cellVal(mapeo.base.get('activo')).toLowerCase().trim();

      // Correos: la app acepta varios con el formato "a@x.com|b@y.com"
      const { valor: emailCanon, invalidos } = construirCorreos(emailRaw);
      if (invalidos.length) {
        avisar(
          r,
          nombre,
          'Email',
          `Correo(s) inválido(s): ${invalidos.join(', ')} — ${
            emailCanon
              ? `se guardan los válidos (${emailCanon}).`
              : 'ninguno válido; se conserva el valor actual.'
          }`,
        );
      }
      let emailFinal = emailCanon ?? '';
      if (emailFinal.length > 200) {
        avisar(r, nombre, 'Email', 'Email recortado a 200 caracteres.');
        emailFinal = truncate(emailFinal, 200);
      }

      if (linkRaw.length > 500)
        avisar(r, nombre, 'Link', 'Link recortado a 500 caracteres.');
      if (ciudadRaw.length > 100)
        avisar(r, nombre, 'Ciudad', 'Ciudad recortada a 100 caracteres.');

      const calendario = calendarioRaw.toUpperCase().trim();
      if (calendarioRaw && calendario !== 'A' && calendario !== 'B')
        avisar(
          r,
          nombre,
          'Calendario',
          `Calendario debe ser A o B (recibido "${calendarioRaw}") — no se aplica.`,
        );

      let tipo = normalizarTipoColegio(tipoRaw) ?? '';
      if (tipo.length > 50) {
        avisar(r, nombre, 'Tipo', 'Tipo recortado a 50 caracteres.');
        tipo = truncate(tipo, 50);
      }

      filas.push({
        r,
        nombre,
        key,
        link: truncate(linkRaw, 500),
        emailCelda: emailFinal,
        emailPresente: emailRaw !== '',
        calendario,
        ciudad: truncate(ciudadRaw, 100),
        tipo,
        asesor: asesorRaw,
        activoRaw,
        dinamicos: mapeo.dinamicos.map((d) => ({
          campoId: d.campoId,
          valorBruto: cellVal(d.col),
        })),
      });
    }

    if (!filas.length)
      throw new BadRequestException('El archivo no contiene datos válidos');

    // ── Existencia por nombre normalizado (evita duplicados por estilo) ─
    const todos = await this.colegioRepo.find({ relations: ['advisor'] });
    const existentePorKey = new Map(
      todos.map((c) => [claveNombre(c.nombre), c]),
    );
    const todosValores = await this.valorRepo.find();
    const valoresPorColegio = new Map<string, PiValor[]>();
    for (const v of todosValores) {
      const arr = valoresPorColegio.get(v.colegioId) ?? [];
      arr.push(v);
      valoresPorColegio.set(v.colegioId, arr);
    }

    // ── Plan por fila ──────────────────────────────────────────────────
    type PlanValores = {
      campo: PiCampo;
      anteriorVal: string | null;
      nuevoVal: string | null;
      showAnterior: string | null;
      showNuevo: string | null;
      reporte: CambioImport;
    };
    type PlanRow = {
      filaR: number;
      nombre: string;
      nombreKey: string;
      id?: string;
      estado: EstadoFila;
      cambiosBase: Record<string, any>;
      cambiosReporte: CambioImport[];
      valores: PlanValores[];
    };
    const plan: PlanRow[] = [];
    const cambiosAsesor: {
      colegio: string;
      anterior: string | null;
      nuevo: string;
    }[] = [];

    const show = (v: string | null | undefined): string | null =>
      v == null || v === '' ? null : v;

    for (const f of filas) {
      const ex = existentePorKey.get(f.key);
      const cambiosBase: Record<string, any> = {};
      const reporte: CambioImport[] = [];

      const linkOk = /^https?:\/\//i.test(f.link);
      const calOk = f.calendario === 'A' || f.calendario === 'B';

      if (!ex) {
        const link =
          truncate(
            linkOk
              ? f.link
              : f.link && /^[a-zA-Z0-9.-]+\.[a-z]{2,}/i.test(f.link)
                ? `https://${f.link}`
                : '',
            500,
          ) || 'https://';
        if (f.link && !linkOk)
          avisar(
            f.r,
            f.nombre,
            'Link',
            `Link sin http:// ("${f.link}") — se guardó normalizado.`,
          );
        cambiosBase.link = link;
        reporte.push({ campo: 'Link', anterior: null, nuevo: link });
        if (f.emailCelda) {
          cambiosBase.email = f.emailCelda;
          reporte.push({ campo: 'Email', anterior: null, nuevo: f.emailCelda });
        }
        if (calOk) {
          cambiosBase.calendario = f.calendario;
          reporte.push({
            campo: 'Calendario',
            anterior: null,
            nuevo: f.calendario,
          });
        }
        if (f.tipo) {
          cambiosBase.tipoColegio = f.tipo;
          reporte.push({ campo: 'Tipo sistema', anterior: null, nuevo: f.tipo });
        }
        if (f.ciudad) {
          cambiosBase.ciudad = f.ciudad;
          reporte.push({ campo: 'Ciudad', anterior: null, nuevo: f.ciudad });
        }
        if (f.activoRaw !== '') {
          const ab = activoBoolFrom(f.activoRaw);
          cambiosBase.activo = ab;
          reporte.push({
            campo: 'Activo',
            anterior: null,
            nuevo: ab ? 'Sí' : 'No',
          });
        }
        if (f.asesor) {
          const { id, problema } = resolverAsesor(f.asesor);
          if (id) {
            cambiosBase.advisorId = id;
            reporte.push({
              campo: 'Asesor',
              anterior: null,
              nuevo: nombreDeAsesor(id),
            });
          } else if (problema === 'no-encontrado') {
            avisar(
              f.r,
              f.nombre,
              'Asesor',
              `Asesor "${f.asesor}" no encontrado — se creará sin asesor.`,
            );
          } else {
            avisar(
              f.r,
              f.nombre,
              'Asesor',
              `Asesor "${f.asesor}" es ambiguo — no se asigna.`,
            );
          }
        }
        plan.push({
          filaR: f.r,
          nombre: f.nombre,
          nombreKey: f.key,
          estado: 'crear',
          cambiosBase,
          cambiosReporte: [
            { campo: 'Institución', anterior: null, nuevo: 'Creada' },
            ...reporte,
          ],
          valores: [],
        });
      } else {
        // ── Existente: celda en blanco = no tocar ──
        if (f.nombre !== ex.nombre)
          avisar(
            f.r,
            f.nombre,
            'Nombre',
            `El nombre difiere sólo en mayúsculas/espacios del registrado ("${ex.nombre}"); se conserva el nombre de la BD.`,
          );

        if (linkOk && f.link !== (ex.link || '')) {
          cambiosBase.link = f.link;
          reporte.push({ campo: 'Link', anterior: show(ex.link), nuevo: f.link });
        }
        if (f.emailPresente && f.emailCelda) {
          const actual = canonizarCorreosGuardados(ex.email);
          if (f.emailCelda !== actual) {
            cambiosBase.email = f.emailCelda;
            reporte.push({
              campo: 'Email',
              anterior: show(ex.email),
              nuevo: f.emailCelda,
            });
          }
        }
        if (calOk && f.calendario !== (ex.calendario || '')) {
          cambiosBase.calendario = f.calendario;
          reporte.push({
            campo: 'Calendario',
            anterior: show(ex.calendario),
            nuevo: f.calendario,
          });
        }
        if (f.tipo && f.tipo !== (ex.tipoColegio || '')) {
          cambiosBase.tipoColegio = f.tipo;
          reporte.push({
            campo: 'Tipo sistema',
            anterior: show(ex.tipoColegio),
            nuevo: f.tipo,
          });
        }
        if (f.ciudad && f.ciudad !== (ex.ciudad || '')) {
          cambiosBase.ciudad = f.ciudad;
          reporte.push({
            campo: 'Ciudad',
            anterior: show(ex.ciudad),
            nuevo: f.ciudad,
          });
        }
        if (f.activoRaw !== '') {
          const ab = activoBoolFrom(f.activoRaw);
          if (ab !== ex.activo) {
            cambiosBase.activo = ab;
            reporte.push({
              campo: 'Activo',
              anterior: ex.activo ? 'Sí' : 'No',
              nuevo: ab ? 'Sí' : 'No',
            });
          }
        }
        if (reasignarAsesores && f.asesor) {
          const { id, problema } = resolverAsesor(f.asesor);
          if (id && ex.advisorId !== id) {
            cambiosBase.advisorId = id;
            const nuevoNombre = nombreDeAsesor(id);
            reporte.push({
              campo: 'Asesor',
              anterior: ex.advisor?.name ?? null,
              nuevo: nuevoNombre,
            });
            cambiosAsesor.push({
              colegio: f.nombre,
              anterior: ex.advisor?.name ?? null,
              nuevo: nuevoNombre,
            });
          } else if (problema === 'no-encontrado') {
            avisar(
              f.r,
              f.nombre,
              'Asesor',
              `Asesor "${f.asesor}" no encontrado — se mantiene el actual.`,
            );
          } else if (problema === 'ambiguo') {
            avisar(
              f.r,
              f.nombre,
              'Asesor',
              `Asesor "${f.asesor}" es ambiguo — se mantiene el actual.`,
            );
          }
        }

        // Campos dinámicos (blanco en existente = no tocar)
        const valoresLocal: PlanValores[] = [];
        const currentValores = valoresPorColegio.get(ex.id) ?? [];
        for (const d of f.dinamicos) {
          const campo = campoById.get(d.campoId);
          if (!campo || d.valorBruto === '') continue;
          let nuevoVal: string | null = d.valorBruto;
          if (campo.tipo === 'booleano' && nuevoVal) {
            const lower = nuevoVal.toLowerCase().trim();
            if (['sí', 'si', 'true', 'activo', 'yes', 's'].includes(lower))
              nuevoVal = 'true';
            else if (['no', 'false', 'inactivo', 'n'].includes(lower))
              nuevoVal = 'false';
          }
          const currentVal = currentValores.find(
            (v) => v.campoId === campo.id,
          );
          const anteriorVal = currentVal?.valor ?? null;
          if (anteriorVal === nuevoVal) continue;
          let showAnterior = anteriorVal;
          let showNuevo = nuevoVal;
          if (campo.tipo === 'booleano') {
            showAnterior =
              anteriorVal === 'true'
                ? 'Sí'
                : anteriorVal === 'false'
                  ? 'No'
                  : anteriorVal;
            showNuevo =
              nuevoVal === 'true'
                ? 'Sí'
                : nuevoVal === 'false'
                  ? 'No'
                  : nuevoVal;
          }
          valoresLocal.push({
            campo,
            anteriorVal,
            nuevoVal,
            showAnterior,
            showNuevo,
            reporte: {
              campo: campo.nombre,
              anterior: showAnterior,
              nuevo: showNuevo,
            },
          });
        }

        // Estado según lo que cambió
        const tieneCambios =
          Object.keys(cambiosBase).length > 0 || valoresLocal.length > 0;
        plan.push({
          filaR: f.r,
          nombre: f.nombre,
          nombreKey: f.key,
          id: ex.id,
          estado: tieneCambios ? 'actualizar' : 'sin-cambios',
          cambiosBase,
          cambiosReporte: reporte,
          valores: valoresLocal,
        });
      }
    }

    // Campos dinámicos para filas nuevas (se insertan juntos)
    for (const p of plan) {
      if (p.estado !== 'crear') continue;
      const f = filas.find((x) => x.key === p.nombreKey);
      if (!f) continue;
      for (const d of f.dinamicos) {
        const campo = campoById.get(d.campoId);
        if (!campo || d.valorBruto === '') continue;
        let nuevoVal: string | null = d.valorBruto;
        if (campo.tipo === 'booleano' && nuevoVal) {
          const lower = nuevoVal.toLowerCase().trim();
          if (['sí', 'si', 'true', 'activo', 'yes', 's'].includes(lower))
            nuevoVal = 'true';
          else if (['no', 'false', 'inactivo', 'n'].includes(lower))
            nuevoVal = 'false';
        }
        let showNuevo = nuevoVal;
        if (campo.tipo === 'booleano') {
          showNuevo =
            nuevoVal === 'true' ? 'Sí' : nuevoVal === 'false' ? 'No' : nuevoVal;
        }
        p.valores.push({
          campo,
          anteriorVal: null,
          nuevoVal,
          showAnterior: null,
          showNuevo,
          reporte: { campo: campo.nombre, anterior: null, nuevo: showNuevo },
        });
      }
    }

    // ── Reporte de filas + resumen ─────────────────────────────────────
    const filasReport: FilaImport[] = [];
    let created = 0;
    let updated = 0;
    for (const p of plan) {
      if (p.estado === 'crear') created++;
      else if (p.estado === 'actualizar') updated++;
      filasReport.push({
        fila: p.filaR,
        nombre: p.nombre,
        estado: p.estado,
        cambios: [
          ...p.cambiosReporte,
          ...p.valores.map((v) => v.reporte),
        ],
        avisos: avisos
          .filter((a) => a.fila === p.filaR)
          .map((a) => a.mensaje),
      });
    }
    filasReport.push(...duplicadas);
    filasReport.sort((a, b) => a.fila - b.fila);

    const resumen = construirResumen(filasReport, mapeo.columnas);

    const logs = filasReport.flatMap((f) =>
      f.cambios.map((c) => ({
        colegio: f.nombre,
        campo: c.campo,
        anterior: c.anterior,
        nuevo: c.nuevo,
        estado: 'exito' as const,
        detalle:
          f.estado === 'crear'
            ? 'Institución creada'
            : c.anterior == null
              ? 'Valor agregado'
              : 'Valor actualizado',
      })),
    );

    const errores = avisos.map(
      (a) =>
        `Fila ${a.fila ?? '—'}${a.nombre ? ` ("${a.nombre}")` : ''}${
          a.campo ? ` [${a.campo}]` : ''
        }: ${a.mensaje}`,
    );

    const respuesta: {
      ok: true;
      preview: boolean;
      created: number;
      updated: number;
      total: number;
      resumen: ResumenImport;
      filas: FilaImport[];
      columnas: ColumnaReporte[];
      avisos: AvisoImport[];
      errores: string[];
      logs: typeof logs;
      cambiosAsesor: typeof cambiosAsesor;
      logExcelBase64: string;
      backup?: string;
    } = {
      ok: true,
      preview,
      created,
      updated,
      total: resumen.filasArchivo,
      resumen,
      filas: filasReport,
      columnas: mapeo.columnas,
      avisos,
      errores,
      logs,
      cambiosAsesor,
      logExcelBase64: '',
    };

    if (preview) {
      try {
        unlinkSync(filePath);
      } catch {
        /* noop */
      }
      return respuesta;
    }

    // Backup antes de mutar (best effort)
    let backupFile = '';
    try {
      backupFile = await crearBackupColegios(this.dataSource);
    } catch {
      /* best effort */
    }

    // Aplica todo en UNA transacción (todo o nada)
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const usuario = { id: userId } as User;
    try {
      const manager = qr.manager;
      const colM = manager.getRepository(Colegio);
      const valM = manager.getRepository(PiValor);
      const histM = manager.getRepository(PiHistorial);

      for (const p of plan) {
        try {
          if (p.estado === 'sin-cambios') continue;

          if (p.estado === 'crear') {
            const ent = colM.create({
              nombre: p.nombre,
              activo: true,
              ...p.cambiosBase,
            });
            const saved = await colM.save(ent);
            p.id = saved.id;
          } else {
            const ent = await colM.findOneBy({ id: p.id! });
            if (!ent) continue;
            Object.assign(ent, p.cambiosBase);
            await colM.save(ent);
          }

          for (const c of p.cambiosReporte) {
            await histM.insert({
              colegioId: p.id!,
              campoId: null,
              usuario,
              accion: 'import',
              valorAnterior: c.anterior,
              valorNuevo: c.nuevo,
            });
          }

          for (const v of p.valores) {
            const reg = await valM.findOneBy({
              colegioId: p.id!,
              campoId: v.campo.id,
            });
            if (reg) {
              reg.valor = v.nuevoVal;
              await valM.save(reg);
            } else if (v.nuevoVal != null) {
              await valM.insert({
                colegioId: p.id!,
                campoId: v.campo.id,
                valor: v.nuevoVal,
                updatedBy: usuario,
              });
            }
            await histM.insert({
              colegioId: p.id!,
              campoId: v.campo.id,
              usuario,
              accion: 'actualizar_valor',
              valorAnterior: v.anteriorVal,
              valorNuevo: v.nuevoVal,
            });
          }
        } catch (err: any) {
          throw new Error(
            `No se pudo guardar "${p.nombre}": ${err?.message ?? err}`,
          );
        }
      }

      await qr.commitTransaction();
    } catch (err: any) {
      await qr.rollbackTransaction();
      throw new BadRequestException(
        `No se pudo aplicar la importación: ${err?.message ?? err} — no se guardó ningún cambio.`,
      );
    } finally {
      await qr.release();
    }

    try {
      unlinkSync(filePath);
    } catch {
      /* noop */
    }

    const buffer = await construirExcelReporte({
      archivo: archivoNombre,
      resumen,
      filas: filasReport,
      avisos,
      columnas: mapeo.columnas,
    });

    return {
      ...respuesta,
      logExcelBase64: buffer.toString('base64'),
      backup: backupFile,
    };
  }

  // ── Historial ────────────────────────────────────────────────────────────

  async listarHistorial(
    colegioId: string | undefined,
    page = '1',
    limit = '30',
    desde?: string,
    hasta?: string,
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
    if (desde) qb.andWhere('h.createdAt >= :desde', { desde });
    if (hasta) qb.andWhere('h.createdAt <= :hasta', { hasta });

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
