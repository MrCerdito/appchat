import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Registro de auditoría de los cambios sobre plantillas de comunicados
 * (creación, edición y eliminación).
 *
 * Nota producción (synchronize: false): crear la tabla manualmente:
 *   CREATE TABLE comunicado_template_logs (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     template_id uuid NULL REFERENCES comunicado_templates(id) ON DELETE SET NULL,
 *     template_name varchar(150) NULL,
 *     usuario_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
 *     accion varchar(50) NOT NULL,
 *     cambios jsonb NULL,
 *     created_at timestamptz NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX idx_template_logs_template_id ON comunicado_template_logs(template_id);
 *   CREATE INDEX idx_template_logs_created_at ON comunicado_template_logs(created_at);
 */
@Entity('comunicado_template_logs')
@Index('idx_template_logs_template_id', ['templateId'])
export class ComunicadoTemplateLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'template_name', type: 'varchar', length: 150, nullable: true })
  templateName: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User | null;

  @Column({ length: 50 })
  accion: string;

  @Column({ type: 'jsonb', nullable: true })
  cambios: Record<string, { antes: string | null; nuevo: string | null }> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}