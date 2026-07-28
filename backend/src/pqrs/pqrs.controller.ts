import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { PqrsService } from './pqrs.service';
import { CreatePqrsDto } from './dto/create-pqrs.dto';
import { UpdatePqrsDto } from './dto/update-pqrs.dto';
import { QueryPqrsDto } from './dto/query-pqrs.dto';

@Controller('pqrs')
export class PqrsController {
  constructor(private readonly pqrsService: PqrsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreatePqrsDto,
  ) {
    return this.pqrsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: QueryPqrsDto,
  ) {
    return this.pqrsService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pqrsService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdatePqrsDto,
  ) {
    return this.pqrsService.update(id, dto);
  }
}
