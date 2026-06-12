import { Controller, Get, Post, Put, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../auth/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Controller('advisors')
@UseGuards(JwtAuthGuard)
export class AdvisorsController {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  @Get()
  findAll(): Promise<User[]> {
    return this.userRepo.find({
      where: { role: 'advisor' },
      select: ['id', 'name', 'email', 'status', 'activeChats', 'active'],
    });
  }

  @Post()
  async create(@Body() body: { name: string; email: string; password: string }): Promise<User> {
    const hash = await bcrypt.hash(body.password, 10);
    const user = this.userRepo.create({
      name: body.name,
      email: body.email,
      password: hash,
      role: 'advisor',
      active: true,
      status: 'offline',
    });
    return this.userRepo.save(user);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; email?: string }): Promise<User> {
    await this.userRepo.update(id, body);
    return this.userRepo.findOneOrFail({ where: { id } });
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string): Promise<User> {
    const user = await this.userRepo.findOneOrFail({ where: { id } });
    await this.userRepo.update(id, { active: !user.active });
    return this.userRepo.findOneOrFail({ where: { id } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.userRepo.delete(id);
  }
}