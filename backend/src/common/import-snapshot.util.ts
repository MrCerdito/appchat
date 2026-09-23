import {
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'fs';
import { join } from 'path';
import { DataSource, In } from 'typeorm';
import { Colegio } from '../sessions/entities/colegio.entity';
import { User } from '../auth/entities/user.entity';
import { PiValor } from '../perfil-institucional/entities/pi-valor.entity';
import { PiCampo } from '../perfil-institucional/entities/pi-campo.entity';

const BACKUP_DIR = join(process.cwd(), 'uploads', 'backups');
const MAX_BACKUPS = 20;

function asegurarDir(): void {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

function sanitizarNombre(file: string): boolean {
  return (
    file.startsWith('colegios-') &&
    file.endsWith('.json') &&
    !file.includes('..') &&
    !file.includes('/') &&
    !file.includes('\\')
  );
}

export function listarBackups(): {
  file: string;
  fecha: Date;
  sizeMb: number;
}[] {
  asegurarDir();
  return readdirSync(BACKUP_DIR)
    .filter(sanitizarNombre)
    .sort()
    .reverse()
    .map((file) => {
      try {
        const st = statSync(join(BACKUP_DIR, file));
        return { file, fecha: st.mtime, sizeMb: +(st.size / 1024 / 1024).toFixed(3) };
      } catch {
        return { file, fecha: new Date(0), sizeMb: 0 };
      }
    });
}

/** Crea un snapshot de colegios + valores PI antes de una importación. */
export async function crearBackupColegios(ds: DataSource): Promise<string> {
  asegurarDir();
  const colegioRepo = ds.getRepository(Colegio);
  const valorRepo = ds.getRepository(PiValor);

  const colegios = await colegioRepo.find({ relations: ['advisor'] });
  const valores = await valorRepo.find({
    relations: ['campo', 'campo.categoria'],
  });
  const nombreById = new Map(colegios.map((c) => [c.id, c.nombre]));

  const data = {
    tipo: 'colegios_snapshot',
    createdAt: new Date().toISOString(),
    colegios: colegios.map((c) => ({
      nombre: c.nombre,
      link: c.link,
      links: c.links ?? [],
      email: c.email ?? null,
      calendario: c.calendario ?? null,
      tipoColegio: c.tipoColegio ?? null,
      ciudad: c.ciudad ?? null,
      activo: c.activo,
      advisorName: c.advisor?.name ?? null,
    })),
    valores: valores.map((v) => ({
      colegioNombre: nombreById.get(v.colegioId) ?? v.colegioId,
      campoNombre: v.campo?.nombre ?? null,
      categoriaNombre: v.campo?.categoria?.nombre ?? null,
      valor: v.valor,
    })),
  };

  const file = `colegios-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19)}.json`;
  writeFileSync(join(BACKUP_DIR, file), JSON.stringify(data, null, 2), 'utf8');

  const list = listarBackups();
  for (const b of list.slice(MAX_BACKUPS)) {
    try {
      rmSync(join(BACKUP_DIR, b.file), { force: true });
    } catch {
      /* noop */
    }
  }
  return file;
}

/** Restaura un snapshot (colegios + valores PI) dentro de una transacción. */
export async function restaurarBackupColegios(
  ds: DataSource,
  fileName: string,
): Promise<{ colegios: number; valores: number; warnings: string[] }> {
  if (!sanitizarNombre(fileName))
    throw new Error('Nombre de backup inválido');
  asegurarDir();
  const raw = readFileSync(join(BACKUP_DIR, fileName), 'utf8');
  const data = JSON.parse(raw) as {
    colegios: any[];
    valores: any[];
  };
  if (!Array.isArray(data.colegios))
    throw new Error('El backup no es válido');
  const warnings: string[] = [];

  const userRepo = ds.getRepository(User);
  const campoRepo = ds.getRepository(PiCampo);

  const users = await userRepo.find({
    where: { role: In(['advisor', 'admin']), active: true },
    select: ['id', 'name'],
  });
  const advisorByName = new Map<string, string>();
  for (const u of users) {
    if (u.name) advisorByName.set(u.name.toLowerCase().trim(), u.id);
  }

  const campos = await campoRepo.find({ relations: ['categoria'] });
  const campoByHeader = new Map<string, string>();
  for (const c of campos) {
    const cat = (c as any).categoria?.nombre ?? '';
    const key = (cat ? `${cat} > ${c.nombre}` : c.nombre).toLowerCase();
    campoByHeader.set(key, c.id);
  }

  const mapaValores = new Map<string, { header: string; valor: string | null }[]>();
  for (const v of data.valores ?? []) {
    const k = String(v.colegioNombre ?? '').toLowerCase();
    if (!mapaValores.has(k)) mapaValores.set(k, []);
    const header = v.categoriaNombre
      ? `${v.categoriaNombre} > ${v.campoNombre}`
      : v.campoNombre;
    if (header) {
      mapaValores.get(k)!.push({ header: header.toLowerCase(), valor: v.valor });
    }
  }

  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const manager = qr.manager;
    const colegioRepoM = manager.getRepository(Colegio);
    const valorRepoM = manager.getRepository(PiValor);

    let nCol = 0;
    let nVal = 0;
    const total = data.colegios.length;
    for (const c of data.colegios) {
      if (!c?.nombre) continue;
      const nombre = String(c.nombre).slice(0, 200);
      const advisorId = c.advisorName
        ? (advisorByName.get(String(c.advisorName).toLowerCase().trim()) ?? null)
        : null;

      let ent = await colegioRepoM.findOne({ where: { nombre } });
      const payload = {
        link: (c.link || 'https://').slice(0, 500),
        links: Array.isArray(c.links) ? c.links.slice(0, 10) : [],
        email: c.email ? String(c.email).slice(0, 200) : undefined,
        ciudad: c.ciudad ? String(c.ciudad).slice(0, 100) : null,
        calendario:
          c.calendario === 'A' || c.calendario === 'B' ? c.calendario : null,
        tipoColegio: c.tipoColegio ? String(c.tipoColegio).slice(0, 100) : null,
        activo: c.activo !== false,
        advisorId,
      };
      if (!ent) {
        ent = colegioRepoM.create({ nombre, ...payload });
        await colegioRepoM.save(ent);
      } else {
        Object.assign(ent, payload);
        await colegioRepoM.save(ent);
      }
      nCol++;

      const items = mapaValores.get(nombre.toLowerCase());
      if (items && items.length) {
        await valorRepoM.delete({ colegioId: ent.id });
        for (const it of items) {
          const campoId = campoByHeader.get(it.header);
          if (!campoId) {
            warnings.push(`Campo desconocido "${it.header}" (${nombre})`);
            continue;
          }
          if (it.valor == null || it.valor === '') continue;
          await valorRepoM.insert({
            colegioId: ent.id,
            campoId,
            valor: it.valor,
          });
          nVal++;
        }
      }
    }
    await qr.commitTransaction();
    return { colegios: nCol, valores: nVal, warnings };
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }
}