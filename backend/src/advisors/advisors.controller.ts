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
  ForbiddenException,
  Request,
  Res, // Nueva importación
  StreamableFile, // Nueva importación
  HttpStatus, // Nueva importación
  HttpCode, // Nueva importación
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path'; // Añadir extname
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdvisorsService } from './advisors.service';
import { ChatGateway } from '../chat/chat.gateway';
import { CreateAdvisorDto } from './dto/create-advisor.dto';
import { UpdateAdvisorDto } from './dto/update-advisor.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { QueryAdvisorDto } from './dto/query-advisor.dto';
import { ImportUserDto } from './dto/import-user.dto'; // Nueva importación
import { Roles, RolesGuard } from '../auth/roles.guard';
import { User } from '../auth/entities/user.entity';
import { Response } from 'express'; // Nueva importación

// Directorio donde se guardan las fotos de perfil de asesores
const PROFILE_PHOTOS_DIR = join(process.cwd(), 'uploads', 'profiles');

// Directorio temporal para archivos de importación/exportación
const TEMP_DIR = join(process.cwd(), 'tmp');

// Asegurarse de que el directorio temporal existe
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

@Controller('advisors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdvisorsController {
  constructor(
    private readonly advisorsService: AdvisorsService,
    private readonly chatGateway: ChatGateway,
  ) {}

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
    if (query.page || query.limit || query.search || query.role) {
      return this.advisorsService.findAllPaginated(
        query.page ?? 1,
        query.limit ?? 20,
        query.search,
        query.role,
      );
    }
    return this.advisorsService.findAll();
  }

  // ── Carga masiva de asesores desde Excel ─────────────────────────────
  @Post('import-excel')
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
          cb(null, TEMP_DIR);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `import-users-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          cb(new BadRequestException('Solo se aceptan archivos Excel (.xlsx o .xls)'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB para el archivo Excel
    }),
  )
  async importAdvisors(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ message: string; created: number; updated: number; errors: any[] }> {
    if (!file) throw new BadRequestException('Archivo Excel requerido');

    const filePath = file.path;
    try {
      const result = await this.advisorsService.importUsers(filePath);
      unlinkSync(filePath); // Eliminar el archivo temporal después del procesamiento
      return result;
    } catch (error) {
      unlinkSync(filePath); // Asegurarse de eliminar el archivo temporal incluso si falla
      throw error; // Re-lanzar el error
    }
  }

  // ── Exportar asesores a Excel ─────────────────────────────────────────
  @Get('export-excel')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async exportAdvisors(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.advisorsService.exportUsers();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="asesores-${Date.now()}.xlsx"`,
    });
    return new StreamableFile(file);
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
    return this.advisorsService.create(
      body.name,
      body.email,
      body.password,
      body.role ?? 'advisor',
    );
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: UpdateAdvisorDto,
    @Request() req: any,
  ): Promise<User> {
    return this.advisorsService.update(id, body, req.user.id);
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
  toggle(@Param('id') id: string, @Request() req: any): Promise<User> {
    return this.advisorsService.toggle(id, req.user.id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    return this.advisorsService.remove(id, req.user.id);
  }

  @Patch(':id/photo')
  @Roles('admin', 'advisor')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'profiles');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = file.originalname.substring(file.originalname.lastIndexOf('.')) || '.jpg';
          cb(null, `temp-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Solo se permiten JPEG, PNG, WebP o GIF', ''),
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
    @Request() req: any,
  ): Promise<{ profilePhotoUrl: string }> {
    if (!file) throw new BadRequestException('Archivo no recibido');
    if (req.user.role === 'advisor' && req.user.id !== id) {
      throw new ForbiddenException('No puedes modificar la foto de otro agente');
    }

    const ext =
      file.originalname.substring(file.originalname.lastIndexOf('.')) || '.jpg';
    const timestamp = Date.now();
    const filename = `profile-${id}-${timestamp}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'profiles');
    
    const tempPath = (file as any).path;
    const targetPath = join(dir, filename);
    
    try {
      const oldFiles = readdirSync(dir).filter((f) =>
        f.startsWith(`profile-${id}-`),
      );
      for (const old of oldFiles) unlinkSync(join(dir, old));
    } catch {
      /* ignore */
    }
    
    try {
      const { renameSync } = await import('fs');
      renameSync(tempPath, targetPath);
    } catch {
      const { readFileSync } = await import('fs');
      const data = readFileSync(tempPath);
      writeFileSync(targetPath, data);
      try { unlinkSync(tempPath); } catch { /* ignore */ }
    }

    const backendUrl = process.env.APP_URL || 'http://localhost:3001';
    const profilePhotoUrl = `${backendUrl}/uploads/profiles/${filename}`;
    await this.advisorsService.updatePhoto(id, profilePhotoUrl);
    this.chatGateway.broadcastProfilePhoto(id, profilePhotoUrl);
    return { profilePhotoUrl };
  }

  @Delete(':id/photo')
  @Roles('admin', 'advisor')
  async deletePhoto(@Param('id') id: string, @Request() req: any): Promise<{ ok: boolean }> {
    if (req.user.role === 'advisor' && req.user.id !== id) {
      throw new ForbiddenException('No puedes eliminar la foto de otro agente');
    }
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
    this.chatGateway.broadcastProfilePhoto(id, null);
    return { ok: true };
  }
}
