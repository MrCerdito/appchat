import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Message } from '../../chat/entities/message.entity';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_name', length: 100 })
  clientName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  identificacion: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  apellido: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rol: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  colegio: string | null;

  @Column({ name: 'colegio_link', type: 'varchar', length: 500, nullable: true })
  colegioLink: string | null;

  @Column({ name: 'tipo_solicitud', type: 'varchar', length: 100, nullable: true })
  tipoSolicitud: string | null;

  // ── Estado del ciclo de vida de la sesión ─────────────────────────────────
  // 'ai'      → El cliente está siendo atendido por el asistente virtual.
  //             NO aparece en la cola de asesores. No se asigna a nadie.
  // 'waiting' → El cliente solicitó un asesor humano. Está en cola de espera.
  // 'active'  → Un asesor fue asignado y está atendiendo.
  // 'closed'  → La sesión fue cerrada (por cliente, asesor o sistema).
  @Column({ length: 20, default: 'ai' })
  status: string;

  @ManyToOne(() => User, (user) => user.sessions, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'advisor_id' })
  advisor: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'closed_at', nullable: true, type: 'timestamp' })
  closedAt: Date | null;

  @OneToMany(() => Message, (message) => message.session)
  messages: Message[];
}