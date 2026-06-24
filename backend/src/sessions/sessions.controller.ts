import { Controller, Get, Post, Patch, Param, Body, UseGuards, HttpCode, HttpStatus, Request, Query } from '@nestjs/common'
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString() @IsNotEmpty() @Length(1, 100)
  clientName: string;

  @IsString() @IsNotEmpty() @Length(1, 20)
  identificacion: string;

  @IsString() @IsNotEmpty() @Length(1, 100)
  apellido: string;

  @IsString() @IsNotEmpty() @Length(1, 50)
  rol: string;

  @IsString() @IsNotEmpty() @Length(1, 100)
  colegio: string;

  @IsString() @IsOptional()
  colegioLink?: string | null;

  @IsString() @IsNotEmpty() @Length(1, 100)
  tipoSolicitud: string;
}

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

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
  findAdvisors() {
    return this.sessionsService.findAllAdvisors();
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
  getMetricsByAdvisor(
    @Param('id') id: string,
    @Query('tz') tz?: string,
  ) {
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
  takeOver(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.sessionsService.takeOver(id, req.user.id);
  }

  // ── Rutas dinámicas AL FINAL ──────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  getMessages(@Param('id') id: string) {
    return this.sessionsService.getMessages(id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id') id: string) {
    return this.sessionsService.close(id);
  }

  @Post(':id/rating')
  @HttpCode(HttpStatus.CREATED)
  saveRating(
    @Param('id') id: string,
    @Body() body: { estrellas: number; comentario?: string; etiquetas?: string[] },
  ) {
    return this.sessionsService.saveRating(
      id,
      body.estrellas,
      body.comentario ?? null,
      body.etiquetas  ?? [],
    );
  }

  @Get(':id/rating')
  getRating(@Param('id') id: string) {
    return this.sessionsService.getRating(id);
  }
}
