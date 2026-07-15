import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Query,
  Logger,
  Inject,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionsService } from './sessions.service';
import { TicketsService } from '../tickets/tickets.service';
import { Message } from '../chat/entities/message.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';
import { ChatGateway } from '../chat/chat.gateway';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  clientName: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  identificacion: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  apellido: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  rol: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  colegio: string;

  @IsString()
  @IsOptional()
  colegioLink?: string | null;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  tipoSolicitud: string;
}

@Controller('sessions')
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly ticketsService: TicketsService,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  // ── Público ───────────────────────────────────────────────
  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.create(dto);
  }

  // ── Rutas fijas PRIMERO (antes de :id) ────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Request() req: any) {
    return this.sessionsService.findAll(req.user.id);
  }

  @Get('paginated')
  @UseGuards(JwtAuthGuard)
  findAllPaginated(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.sessionsService.findAllPaginated(req.user.id, +page, +limit);
  }

  @Get('advisors')
  @UseGuards(JwtAuthGuard)
  async findAdvisors() {
    const advisors = await this.sessionsService.findAllAdvisors();
    return advisors.map((a) => ({
      ...a,
      status: (this.chatGateway.advisorStatuses.has(a.id)
        ? this.chatGateway.advisorStatuses.get(a.id)
        : a.status) as 'online' | 'busy' | 'offline',
    }));
  }

  @Get('waiting')
  @UseGuards(JwtAuthGuard)
  findWaiting() {
    return this.sessionsService.findWaitingSessions();
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard)
  getMetrics() {
    return this.sessionsService.getMetrics();
  }

  @Get('metrics/asesor/:id')
  @UseGuards(JwtAuthGuard)
  getMetricsByAdvisor(@Param('id') id: string, @Query('tz') tz?: string) {
    return this.sessionsService.getMetricsByAdvisor(id, tz);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard)
  findAllAdmin() {
    return this.sessionsService.findAllAdmin();
  }

  @Get('admin/all/paginated')
  @UseGuards(JwtAuthGuard)
  findAllAdminPaginated(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.sessionsService.findAllAdminPaginated(+page, +limit);
  }

  @Get('colegios/list')
  findColegios() {
    return this.sessionsService.findAllColegios();
  }

  @Get('metrics/ranking')
  @UseGuards(JwtAuthGuard)
  getRankingAsesores() {
    return this.sessionsService.getRankingAsesores();
  }

  @Get('metrics/asesor/:id/comentarios')
  @UseGuards(JwtAuthGuard)
  getComentariosByAdvisor(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.sessionsService.getComentariosByAdvisor(id, +page, +limit);
  }

  @Get('admin/comentarios')
  @UseGuards(JwtAuthGuard)
  getAllComentarios(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('advisorId') advisorId?: string,
  ) {
    return this.sessionsService.getAllComentarios(+page, +limit, advisorId);
  }

  // ★ NUEVO — actualiza el estado del asesor directamente en BD por HTTP
  // Garantiza que la BD se actualice aunque el socket falle o no tenga el rol correcto.
  // PATCH /sessions/advisor/status  { "status": "online" | "busy" | "offline" }
  @Patch('advisor/status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setMyStatus(
    @Body('status') status: string,
    @Request() req: any,
  ): Promise<{ ok: boolean }> {
    const advisorId = req.user.id;
    return this.sessionsService
      .setAdvisorStatus(advisorId, status)
      .then(() => ({ ok: true }));
  }

  // Agregar este endpoint ANTES de las rutas dinámicas (:id)
  @Patch(':id/takeover')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  takeOver(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.takeOver(id, req.user.id);
  }

  // ── Rutas dinámicas AL FINAL ──────────────────────────────

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Request() req: any) {
    const session = await this.sessionsService.findOne(id);
    const userRole = req.user.role;
    if (userRole === 'estudiante' || userRole === 'padre') {
      if (session.advisor?.id !== req.user.id) {
        throw new ForbiddenException('No autorizado para ver esta sesión');
      }
    }
    return session;
  }

  @Get(':id/codigo')
  @UseGuards(JwtAuthGuard)
  findCodigo(@Param('id') id: string) {
    return this.sessionsService.findCodigo(id);
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  getMessages(@Param('id') id: string) {
    return this.sessionsService.getMessages(id);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string, @Request() req: any) {
    const session = await this.sessionsService.findOne(id);
    const userRole = req.user.role;
    if (userRole === 'administrador' || session.advisor?.id === req.user.id) {
      return this.sessionsService.close(id);
    }
    throw new ForbiddenException(
      'Solo el asesor asignado o un administrador puede cerrar la sesión',
    );
  }

  @Post(':id/rating')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async saveRating(
    @Param('id') id: string,
    @Body()
    body: { estrellas: number; comentario?: string; etiquetas?: string[] },
    @Request() req: any,
  ) {
    const session = await this.sessionsService.findOne(id);
    if (req.user.role === 'estudiante' || req.user.role === 'padre') {
      if (session.clientName !== req.user.name) {
        throw new ForbiddenException(
          'Solo el cliente que inició la sesión puede calificar',
        );
      }
    }
    return this.sessionsService.saveRating(
      id,
      body.estrellas,
      body.comentario ?? null,
      body.etiquetas ?? [],
    );
  }

  @Get(':id/rating')
  @UseGuards(JwtAuthGuard)
  getRating(@Param('id') id: string) {
    return this.sessionsService.getRating(id);
  }

  @Post(':id/ticket')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTicketFromSession(
    @Param('id') id: string,
    @Body()
    body: {
      titulo?: string;
      descripcion?: string;
      priority?: string;
      category?: string;
    },
    @Request() req: any,
  ) {
    const session = await this.sessionsService.findOne(id);

    const messages = await this.messageRepo.find({
      where: { session: { id } },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    messages.reverse();

    const conversation = messages.map((m) => ({
      role: m.senderType === 'client' ? 'client' : 'advisor',
      name: m.senderName,
      content: m.content,
      timestamp: m.createdAt,
    }));

    const dto = {
      titulo: body.titulo ?? `Ticket desde sesion ${session.codigo || id}`,
      descripcion: body.descripcion ?? undefined,
      priority: body.priority ?? 'medium',
      category: body.category ?? undefined,
      sourceType: 'web' as const,
      sourceId: id,
      clientName:
        `${session.clientName || ''} ${session.apellido || ''}`.trim() ||
        'Cliente',
      clientInfo: {
        identificacion: session.identificacion,
        rol: session.rol,
        colegio: session.colegio,
        tipoSolicitud: session.tipoSolicitud,
      },
      conversation,
    };
    return this.ticketsService.create(dto, req.user.id);
  }
}
