import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EstadoActividad =
  | 'online'
  | 'busy'
  | 'meeting'
  | 'almuerzo'
  | 'offline';
export type TipoActividad =
  | 'conexion'
  | 'desconexion'
  | 'status'
  | 'almuerzo_inicio'
  | 'almuerzo_fin';

@Entity('advisor_activity_log')
@Index('idx_advisor_activity_usuario_fecha', ['userId', 'fecha', 'desde'])
export class AdvisorActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Día en hora Bogotá (UTC-5), p. ej. 2026-09-08. */
  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 20 })
  tipo: TipoActividad;

  /** Estado efectivo tras el evento: online (Disponible) | busy (Ocupado) | meeting (En reunión) | almuerzo (En almuerzo) | offline (Inactivo). */
  @Column({ type: 'varchar', length: 10 })
  estado: EstadoActividad;

  /** true cuando el evento ocurre dentro de un periodo de almuerzo. */
  @Column({ type: 'boolean', default: false })
  almuerzo: boolean;

  /** Origen del evento: connect | disconnect | manual | almuerzo | timeout | sistema. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  causa: string | null;

  /** Inicio (UTC) del periodo que abre este evento. */
  @Column({ type: 'timestamptz' })
  desde: Date;

  /** Instante en que el periodo se cierra (lo rellena la agregación al leer). */
  @Column({ type: 'timestamptz', nullable: true })
  hasta: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}