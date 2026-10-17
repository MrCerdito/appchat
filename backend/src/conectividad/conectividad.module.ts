import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectivityIncident } from './entities/connectivity-incident.entity';
import { ConectividadService } from './conectividad.service';
import { ConectividadController } from './conectividad.controller';

/**
 * Módulo de monitoreo de conectividad de asesores (Historial de Conectividad).
 * Lee `advisor_activity_log` (misma fuente que Métricas·Conexiones) y la tabla
 * `connectivity_incidents` para el seguimiento administrativo de incidentes.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ConnectivityIncident])],
  controllers: [ConectividadController],
  providers: [ConectividadService],
  exports: [ConectividadService],
})
export class ConectividadModule {}
