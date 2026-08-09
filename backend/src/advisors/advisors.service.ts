import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';
import * as ExcelJS from 'exceljs';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { ImportUserDto } from './dto/import-user.dto';
import { InternalChatService } from '../internal-chat/internal-chat.service';

function parseCellString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (typeof val === 'object') {
    if (val.text !== undefined) return parseCellString(val.text);
    if (val.result !== undefined) return parseCellString(val.result);
    if (Array.isArray(val.richText)) {
      return val.richText.map((rt: any) => parseCellString(rt?.text)).join('').trim();
    }
  }
  return String(val).trim();
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ... (otras interfaces)

@Injectable()
export class AdvisorsService {
  private readonly logger = new Logger(AdvisorsService.name); // Instanciar Logger

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => InternalChatService))
    @Optional()
    private readonly internalChatService?: InternalChatService,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({
      where: { role: 'advisor' },
      select: [
        'id',
        'name',
        'email',
        'status',
        'activeChats',
        'active',
        'createdAt',
        'profilePhotoUrl',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    search?: string,
    role?: 'admin' | 'advisor' | 'todos',
  ): Promise<PaginatedResult<User>> {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.status',
        'user.activeChats',
        'user.active',
        'user.createdAt',
        'user.role',
        'user.profilePhotoUrl',
      ])
      .orderBy('user.createdAt', 'DESC');

    if (role === 'admin' || role === 'advisor') {
      qb.andWhere('user.role = :role', { role });
    }

    if (search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('user.name ILIKE :search', { search: `%${search}%` }).orWhere(
            'user.email ILIKE :search',
            { search: `%${search}%` },
          );
        }),
      );
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      select: [
        'id',
        'name',
        'email',
        'status',
        'activeChats',
        'active',
        'createdAt',
        'role',
        'profilePhotoUrl',
      ],
    });
    if (!user) throw new NotFoundException('Asesor no encontrado');
    return user;
  }

  async create(
    name: string,
    email: string,
    password: string,
    role: 'admin' | 'advisor' = 'advisor',
  ): Promise<User> {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      name,
      email,
      password: hash,
      role,
    });
    const saved = await this.userRepo.save(user);
    await this.internalChatService?.ensureSupportGroup().catch(() => {});
    return saved;
  }

  async update(
    id: string,
    dto: { name?: string; email?: string; role?: 'admin' | 'advisor' },
    actorId?: string,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');

    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (exists) throw new ConflictException('El email ya está registrado');
    }

    if (dto.role && dto.role !== user.role) {
      await this.assertCanChangeRole(user, dto.role, actorId);
      user.role = dto.role;
    }

    if (dto.name) user.name = dto.name;
    if (dto.email) user.email = dto.email;
    return this.userRepo.save(user);
  }

  async updatePassword(id: string, password: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');

    user.password = await bcrypt.hash(password, 10);
    await this.userRepo.save(user);
  }

  async toggle(id: string, actorId?: string): Promise<User> {
    if (actorId && id === actorId) {
      throw new ForbiddenException(
        'No puedes cambiar el estado de tu propia cuenta',
      );
    }
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');
    if (user.active && user.role === 'admin') {
      await this.assertNotLastActiveAdmin(user);
    }
    user.active = !user.active;
    return this.userRepo.save(user);
  }

  async remove(id: string, actorId?: string): Promise<void> {
    if (actorId && id === actorId) {
      throw new ForbiddenException('No puedes eliminar tu propia cuenta');
    }
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');
    if (user.role === 'admin') {
      await this.assertNotLastActiveAdmin(user);
    }
    await this.userRepo.remove(user);
  }

  /**
   * Evita que una cuenta se quede sin administradores activos:
   * no se permite desactivar, eliminar ni degradar al último admin activo.
   */
  private async assertNotLastActiveAdmin(target: User): Promise<void> {
    if (target.role !== 'admin') return;
    const activeAdmins = await this.userRepo.count({
      where: { role: 'admin', active: true },
    });
    if (activeAdmins <= 1) {
      throw new ForbiddenException(
        'No puedes desactivar/eliminar al último administrador activo',
      );
    }
  }

  private async assertCanChangeRole(
    target: User,
    newRole: 'admin' | 'advisor',
    actorId?: string,
  ): Promise<void> {
    if (actorId && target.id === actorId) {
      throw new ForbiddenException('No puedes cambiar el rol de tu propia cuenta');
    }
    if (target.role === 'admin' && newRole !== 'admin') {
      await this.assertNotLastActiveAdmin(target);
    }
  }

  async updatePhoto(id: string, profilePhotoUrl: string | null): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');
    user.profilePhotoUrl = profilePhotoUrl;
    return this.userRepo.save(user);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA MASIVA (IMPORTAR/EXPORTAR EXCEL)
  // ─────────────────────────────────────────────────────────────────────────
  async importUsers(filePath: string): Promise<{ message: string; created: number; updated: number; errors: any[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) throw new BadRequestException('El archivo Excel no tiene hojas de trabajo');

    const errors: any[] = [];

    // Columnas esperadas y sus validaciones (usando parseCellString para evitar errores con objetos/formatos)
    const headerRow = worksheet.getRow(1).values as any[];
    const idColIndex = headerRow.findIndex(h => parseCellString(h).toLowerCase() === 'id');
    const emailColIndex = headerRow.findIndex(h => parseCellString(h).toLowerCase() === 'email');
    const nameColIndex = headerRow.findIndex(h => parseCellString(h).toLowerCase() === 'nombre');
    const roleColIndex = headerRow.findIndex(h => parseCellString(h).toLowerCase() === 'rol');
    const activeColIndex = headerRow.findIndex(h => parseCellString(h).toLowerCase() === 'activo');
    const photoColIndex = headerRow.findIndex(h => {
      const s = parseCellString(h).toLowerCase();
      return s.includes('foto') || s.includes('photo') || s.includes('url');
    });

    if (emailColIndex === -1 || nameColIndex === -1 || roleColIndex === -1) {
      throw new BadRequestException('El archivo Excel debe contener las columnas: Email, Nombre, Rol');
    }

    const result = await this.dataSource.transaction(async (transactionalEntityManager) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (let i = 2; i <= worksheet.actualRowCount; i++) { // Empezar desde la fila 2 (después del encabezado)
        const row = worksheet.getRow(i);
        const rowValues = row.values as any[];
        if (!rowValues || !rowValues.length) continue;

        const rawId = idColIndex !== -1 ? parseCellString(rowValues[idColIndex]) : '';
        const rawEmail = parseCellString(rowValues[emailColIndex]);
        const rawName = parseCellString(rowValues[nameColIndex]);
        const rawRoleStr = parseCellString(rowValues[roleColIndex]).toLowerCase();
        const rawActive = activeColIndex !== -1 ? parseCellString(rowValues[activeColIndex]) : '';
        const rawPhoto = photoColIndex !== -1 ? parseCellString(rowValues[photoColIndex]) : '';

        // Saltar filas totalmente vacías
        if (!rawEmail && !rawName) continue;

        const rawUser = {
          email: rawEmail,
          name: rawName,
          role: (rawRoleStr === 'admin' || rawRoleStr === 'administrador') ? 'admin' : 'advisor',
          active: rawActive ? (rawActive.toLowerCase() === 'true' || rawActive === '1') : undefined,
        };

        const importUserDto = plainToClass(ImportUserDto, rawUser);
        const rowErrors = await validate(importUserDto);

        if (rowErrors.length > 0) {
          errors.push({ row: i, email: rawEmail, error: rowErrors.map(e => Object.values(e.constraints ?? {})).flat().join('; ') });
          continue;
        }

        let user: User | null = null;

        // 1. Si viene ID, buscar primero por ID
        if (rawId) {
          user = await transactionalEntityManager.findOne(User, { where: { id: rawId } });
        }

        // 2. Si no se encontró por ID (o no traía ID), buscar por Email
        if (!user && rawEmail) {
          user = await transactionalEntityManager.findOne(User, { where: { email: rawEmail } });
        }

        if (user) {
          // Actualizar usuario existente — NUNCA se rota la contraseña
          if (rawName && user.name !== rawName) user.name = rawName;
          if (rawEmail && user.email !== rawEmail) user.email = rawEmail;
          if (importUserDto.role && user.role !== importUserDto.role) user.role = importUserDto.role;
          if (importUserDto.active !== undefined) user.active = importUserDto.active;
          if (rawPhoto) user.profilePhotoUrl = rawPhoto;

          await transactionalEntityManager.save(User, user);
          updatedCount++;
        } else {
          // Crear nuevo usuario (NO requiere ID)
          const password = this.generateStrongPassword();
          const hashedPassword = await bcrypt.hash(password, 10);
          user = transactionalEntityManager.create(User, {
            ...(rawId ? { id: rawId } : {}),
            name: importUserDto.name,
            email: importUserDto.email,
            password: hashedPassword,
            role: importUserDto.role,
            active: importUserDto.active ?? true,
            ...(rawPhoto ? { profilePhotoUrl: rawPhoto } : {}),
          });
          await transactionalEntityManager.save(User, user);
          createdCount++;
          this.logger.warn(`Contraseña generada para ${importUserDto.email}: ${password}`);
        }
      }
      return { message: 'Importación completada', created: createdCount, updated: updatedCount, errors };
    });

    // Auto-ingreso de todos los asesores nuevos/actualizados al grupo de soporte interno
    await this.internalChatService?.ensureSupportGroup().catch(() => {});

    return result;
  }

  async exportUsers(): Promise<Buffer> {
    const users = await this.userRepo.find({
      select: [
        'id',
        'name',
        'email',
        'role',
        'status',
        'activeChats',
        'active',
        'createdAt',
        'profilePhotoUrl',
      ],
      order: { createdAt: 'DESC' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Asesores');

    // Definir encabezados de columna
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 40 },
      { header: 'Rol', key: 'role', width: 15 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Chats Activos', key: 'activeChats', width: 15 },
      { header: 'Activo', key: 'active', width: 10 },
      { header: 'Fecha de Creación', key: 'createdAt', width: 20 },
      { header: 'URL Foto Perfil', key: 'profilePhotoUrl', width: 50 },
    ];

    // Añadir datos de usuario
    users.forEach(user => {
      worksheet.addRow({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        activeChats: user.activeChats,
        active: user.active ? 'TRUE' : 'FALSE',
        createdAt: user.createdAt?.toISOString().split('T')[0] ?? '',
        profilePhotoUrl: user.profilePhotoUrl ?? '',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  // Método privado para generar contraseñas (copiado de SeedService)
  private generateStrongPassword(): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    const bytes = require('crypto').randomBytes(16);
    let pw = '';
    for (let i = 0; i < bytes.length; i++) {
      pw += chars[bytes[i] % chars.length];
    }
    return pw;
  }

}

