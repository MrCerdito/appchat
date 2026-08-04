import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm'; // Añadir DataSource
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';
import * as ExcelJS from 'exceljs'; // Nueva importación
import { createReadStream, unlinkSync } from 'fs'; // Nueva importación
import { PassThrough } from 'stream'; // Nueva importación
import { validate } from 'class-validator'; // Nueva importación
import { plainToClass } from 'class-transformer'; // Nueva importación
import { ImportUserDto } from './dto/import-user.dto'; // Nueva importación

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
  ): Promise<PaginatedResult<User>> {
    const where: any = { role: 'advisor' };

    if (search) {
      where.name = ILike(`%${search}%`);
    }

    const [data, total] = await this.userRepo.findAndCount({
      where,
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
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

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

  async create(name: string, email: string, password: string): Promise<User> {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      name,
      email,
      password: hash,
      role: 'advisor',
    });
    return this.userRepo.save(user);
  }

  async update(
    id: string,
    dto: { name?: string; email?: string },
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');

    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (exists) throw new ConflictException('El email ya está registrado');
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

  async toggle(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');
    user.active = !user.active;
    return this.userRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');
    await this.userRepo.remove(user);
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

    const usersToProcess: ImportUserDto[] = [];
    const errors: any[] = [];

    // Columnas esperadas y sus validaciones
    const headerRow = worksheet.getRow(1).values as string[];
    const emailColIndex = headerRow.findIndex(h => h?.toLowerCase() === 'email');
    const nameColIndex = headerRow.findIndex(h => h?.toLowerCase() === 'nombre');
    const roleColIndex = headerRow.findIndex(h => h?.toLowerCase() === 'rol');
    const activeColIndex = headerRow.findIndex(h => h?.toLowerCase() === 'activo');

    if (emailColIndex === -1 || nameColIndex === -1 || roleColIndex === -1) {
      throw new BadRequestException('El archivo Excel debe contener las columnas: Email, Nombre, Rol');
    }

    const result = await this.dataSource.transaction(async (transactionalEntityManager) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (let i = 2; i <= worksheet.actualRowCount; i++) { // Empezar desde la fila 2 (después del encabezado)
        const row = worksheet.getRow(i);
        const rowValues = row.values as string[];

        const rawUser = {
          email: rowValues[emailColIndex]?.trim() ?? '',
          name: rowValues[nameColIndex]?.trim() ?? '',
          role: rowValues[roleColIndex]?.trim() ?? '',
          active: rowValues[activeColIndex]?.trim() ?? undefined,
        };

        const importUserDto = plainToClass(ImportUserDto, rawUser);
        const rowErrors = await validate(importUserDto);

        if (rowErrors.length > 0) {
          errors.push({ row: i, email: rawUser.email, error: rowErrors.map(e => Object.values(e.constraints ?? {})).flat().join('; ') });
          continue;
        }

        let user = await transactionalEntityManager.findOne(User, { where: { email: importUserDto.email } });

        if (user) {
          // Actualizar usuario existente — NUNCA se rota la contraseña (evita
          // que importar/exportar deje cuentas con contraseña desconocida).
          if (user.name !== importUserDto.name) user.name = importUserDto.name;
          if (user.role !== importUserDto.role) user.role = importUserDto.role;
          if (importUserDto.active !== undefined) user.active = importUserDto.active;

          await transactionalEntityManager.save(User, user);
          updatedCount++;
        } else {
          // Crear nuevo usuario — solo aquí se genera una contraseña segura
          const password = this.generateStrongPassword();
          const hashedPassword = await bcrypt.hash(password, 10);
          user = transactionalEntityManager.create(User, {
            name: importUserDto.name,
            email: importUserDto.email,
            password: hashedPassword,
            role: importUserDto.role,
            active: importUserDto.active ?? true, // Por defecto activo
            // Otros campos se inicializarán con sus valores por defecto de la entidad
          });
          await transactionalEntityManager.save(User, user);
          createdCount++;
          // Opcional: enviar la contraseña por email (fuera de este scope).
          // Por ahora se loguea una sola vez para que el admin pueda entregarla.
          this.logger.warn(`Contraseña generada para ${importUserDto.email}: ${password}`);
        }
      }
      return { message: 'Importación completada', created: createdCount, updated: updatedCount, errors };
    });
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

