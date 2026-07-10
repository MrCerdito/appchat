import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

@Injectable()
export class AdvisorsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
}
