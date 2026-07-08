import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, Query, UseGuards, ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdvisorsService } from './advisors.service';
import { CreateAdvisorDto } from './dto/create-advisor.dto';
import { UpdateAdvisorDto } from './dto/update-advisor.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { QueryAdvisorDto } from './dto/query-advisor.dto';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { User } from '../auth/entities/user.entity';

@Controller('advisors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdvisorsController {
  constructor(private readonly advisorsService: AdvisorsService) {}

  @Get()
  @Roles('admin')
  findAll(@Query() query: QueryAdvisorDto): Promise<{ data: User[]; total: number; page: number; limit: number; pages: number } | User[]> {
    if (query.page || query.limit || query.search) {
      return this.advisorsService.findAllPaginated(
        query.page ?? 1,
        query.limit ?? 20,
        query.search,
      );
    }
    return this.advisorsService.findAll();
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id') id: string): Promise<User> {
    return this.advisorsService.findById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body(new ValidationPipe({ whitelist: true })) body: CreateAdvisorDto): Promise<User> {
    return this.advisorsService.create(body.name, body.email, body.password);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: UpdateAdvisorDto,
  ): Promise<User> {
    return this.advisorsService.update(id, body);
  }

  @Patch(':id/password')
  @Roles('admin')
  updatePassword(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: UpdatePasswordDto,
  ): Promise<{ ok: boolean }> {
    return this.advisorsService.updatePassword(id, body.password).then(() => ({ ok: true }));
  }

  @Patch(':id/toggle')
  @Roles('admin')
  toggle(@Param('id') id: string): Promise<User> {
    return this.advisorsService.toggle(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string): Promise<void> {
    return this.advisorsService.remove(id);
  }
}
