import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CorreoMensaje } from './correo-mensaje.entity';

/**
 * Metadata de un adjunto. El binario NO se guarda en la base: se descarga de
 * Graph en streaming cuando el usuario pulsa descargar, y asi el archivo no
 * queda persistido en el servidor.
 */
@Entity('correo_adjuntos')
@Index('idx_correo_adjuntos_mensaje', ['mensajeId'])
export class CorreoAdjunto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'graph_attachment_id', type: 'varchar', length: 255 })
  graphAttachmentId: string;

  @ManyToOne(() => CorreoMensaje, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mensaje_id' })
  mensaje: CorreoMensaje;

  @Column({ name: 'mensaje_id', type: 'uuid' })
  mensajeId: string;

  @Column({ name: 'graph_message_id', type: 'varchar', length: 255 })
  graphMessageId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  nombre: string | null;

  @Column({ name: 'content_type', type: 'varchar', length: 200, nullable: true })
  contentType: string | null;

  @Column({ type: 'int', nullable: true })
  tamano: number | null;

  @Column({ name: 'is_inline', type: 'boolean', default: false })
  isInline: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
