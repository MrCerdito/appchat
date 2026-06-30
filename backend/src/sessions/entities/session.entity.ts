import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Message } from '../../chat/entities/message.entity';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

@Entity('sessions')
@Index('idx_sessions_status', ['status'])
@Index('idx_sessions_advisor_id', ['advisor'])
@Index('idx_sessions_advisor_id_status', ['advisor', 'status'])
@Index('idx_sessions_status_created_at', ['status', 'createdAt'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  codigo: string | null;

  @Column({ name: 'client_name', type: 'text', transformer: encryptedTextTransformer })
  clientName: string;

  @Column({ type: 'text', nullable: true, transformer: encryptedTextTransformer })
  identificacion: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedTextTransformer })
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

  @ManyToOne(() => User, (user) => user.sessions, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'advisor_id' })
  advisor: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'closed_at', nullable: true, type: 'timestamp' })
  closedAt: Date | null;

  @OneToMany(() => Message, (message) => message.session)
  messages: Message[];
}
