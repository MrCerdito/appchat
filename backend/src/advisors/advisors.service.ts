import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class AdvisorsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({
      where: { role: 'advisor' },
      select: ['id', 'name', 'email', 'status', 'activeChats', 'active', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(name: string, email: string, password: string): Promise<User> {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({ name, email, password: hash, role: 'advisor' });
    return this.userRepo.save(user);
  }

  async update(id: string, dto: { name?: string; email?: string }): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Asesor no encontrado');

    if (dto.name)  user.name = dto.name;
    if (dto.email) user.email = dto.email;
    return this.userRepo.save(user);
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
}