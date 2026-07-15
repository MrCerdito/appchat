import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'fs';
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
  findAll(@Query() query: QueryAdvisorDto): Promise<
    | {
        data: User[];
        total: number;
        page: number;
        limit: number;
        pages: number;
      }
    | User[]
  > {
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
  create(
    @Body(new ValidationPipe({ whitelist: true })) body: CreateAdvisorDto,
  ): Promise<User> {
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
    return this.advisorsService
      .updatePassword(id, body.password)
      .then(() => ({ ok: true }));
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

  @Patch(':id/photo')
  @Roles('admin', 'advisor')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Solo se permiten imágenes', ''),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ profilePhotoUrl: string }> {
    if (!file) throw new BadRequestException('Archivo no recibido');

    const ext =
      file.originalname.substring(file.originalname.lastIndexOf('.')) || '.jpg';
    const timestamp = Date.now();
    const filename = `profile-${id}-${timestamp}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'profiles');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    try {
      const oldFiles = readdirSync(dir).filter((f) =>
        f.startsWith(`profile-${id}-`),
      );
      for (const old of oldFiles) unlinkSync(join(dir, old));
    } catch {
      /* ignore */
    }
    writeFileSync(join(dir, filename), file.buffer);

    const backendUrl = process.env.APP_URL || 'http://localhost:3001';
    const profilePhotoUrl = `${backendUrl}/uploads/profiles/${filename}`;
    await this.advisorsService.updatePhoto(id, profilePhotoUrl);
    return { profilePhotoUrl };
  }

  @Delete(':id/photo')
  @Roles('admin', 'advisor')
  async deletePhoto(@Param('id') id: string): Promise<{ ok: boolean }> {
    const user = await this.advisorsService.findById(id);
    if (user.profilePhotoUrl) {
      const oldPath = join(
        process.cwd(),
        'uploads',
        'profiles',
        `profile-${id}.*`,
      );
      try {
        const oldName = user.profilePhotoUrl.split('/').pop();
        if (oldName)
          unlinkSync(join(process.cwd(), 'uploads', 'profiles', oldName));
      } catch {
        /* File may not exist */
      }
    }
    await this.advisorsService.updatePhoto(id, null);
    return { ok: true };
  }
}
