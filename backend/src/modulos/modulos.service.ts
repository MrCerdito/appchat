import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Modulo } from './modulo.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ModulosService {
  constructor(
    @InjectRepository(Modulo)
    private readonly moduloRepo: Repository<Modulo>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(): Promise<Modulo[]> {
    return this.moduloRepo.find({
      order: { nombre: 'ASC' },
      relations: ['desarrolladores'],
    });
  }

  async findOne(id: string): Promise<Modulo> {
    const modulo = await this.moduloRepo.findOne({
      where: { id },
      relations: ['desarrolladores'],
    });
    if (!modulo) throw new NotFoundException('Modulo no encontrado');
    return modulo;
  }

  async create(data: { nombre: string; descripcion?: string }): Promise<Modulo> {
    const existing = await this.moduloRepo.findOne({ where: { nombre: data.nombre } });
    if (existing) throw new ConflictException('Ya existe un modulo con ese nombre');
    const modulo = this.moduloRepo.create(data);
    return this.moduloRepo.save(modulo);
  }

  async update(id: string, data: { nombre?: string; descripcion?: string }): Promise<Modulo> {
    const modulo = await this.findOne(id);
    if (data.nombre !== undefined) modulo.nombre = data.nombre;
    if (data.descripcion !== undefined) modulo.descripcion = data.descripcion ?? null;
    return this.moduloRepo.save(modulo);
  }

  async remove(id: string): Promise<void> {
    const modulo = await this.findOne(id);
    await this.moduloRepo.remove(modulo);
  }

  async addDesarrollador(moduloId: string, userId: string): Promise<void> {
    const modulo = await this.findOne(moduloId);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const already = modulo.desarrolladores.some((d) => d.id === userId);
    if (!already) {
      modulo.desarrolladores.push(user);
      await this.moduloRepo.save(modulo);
    }
  }

  async removeDesarrollador(moduloId: string, userId: string): Promise<void> {
    const modulo = await this.findOne(moduloId);
    modulo.desarrolladores = modulo.desarrolladores.filter((d) => d.id !== userId);
    await this.moduloRepo.save(modulo);
  }

  async findDesarrolladores(): Promise<User[]> {
    return this.userRepo.find({
      where: { role: 'desarrollador', active: true },
      select: ['id', 'name', 'email', 'status', 'profilePhotoUrl'],
      order: { name: 'ASC' },
    });
  }
}
