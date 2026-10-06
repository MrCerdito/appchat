import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * `buzon` = el correo estaba en la carpeta del asesor cuando se sincronizo.
 * `movido_interno` = lo movio la propia aplicacion hacia la carpeta; sirve para
 * no tratarlo como correo entrante nuevo ni dispararle una notificacion.
 */
export type CorreoOrigen = 'buzon' | 'movido_interno';

/**
 * Espejo local de METADATOS de un mensaje de la carpeta del asesor.
 *
 * El cuerpo HTML del correo NO se guarda: pesa hasta ~1 MB por mensaje y es
 * contenido de terceros. Se pide a Graph bajo demanda y se sanitiza al
 * devolverlo. Aqui queda lo justo para pintar la bandeja, ordenar y paginar
 * sin volver a golpear Graph.
 */
@Entity('correo_mensajes')
@Index('idx_correo_mensajes_asesor_folder', ['asesorId', 'folderId'])
@Index('idx_correo_mensajes_asesor_received', ['asesorId', 'receivedAt'])
@Index('idx_correo_mensajes_conversation', ['conversationId'])
export class CorreoMensaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Id opaco de Graph. Unico en toda la tabla: es la garantia de no procesar
   * dos veces el mismo correo, incluso si se reasigna la carpeta a otro asesor.
   */
  @Index({ unique: true })
  @Column({ name: 'graph_message_id', type: 'varchar', length: 255 })
  graphMessageId: string;

  @Column({ name: 'folder_id', type: 'varchar', length: 255 })
  folderId: string;

  @Column({
    name: 'folder_display_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  folderDisplayName: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asesor_id' })
  asesor: User;

  @Column({ name: 'asesor_id', type: 'uuid' })
  asesorId: string;

  @Column({ name: 'conversation_id', type: 'varchar', length: 255, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ name: 'from_nombre', type: 'varchar', length: 300, nullable: true })
  fromNombre: string | null;

  @Column({ name: 'from_email', type: 'varchar', length: 300, nullable: true })
  fromEmail: string | null;

  @Column({ name: 'reply_to', type: 'simple-json', nullable: true })
  replyTo: string[] | null;

  /** Destinatarios. Se guardan en claro porque forman parte del filtro. */
  @Column({ type: 'simple-json', nullable: true })
  para: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  cc: string[] | null;

  /**
   * Categorias de Outlook asignadas al mensaje. Se guardan tal cual las entrega
   * Graph (por ejemplo `✓ RESUELTO`, `-EN PROCESO`); un arreglo vacio significa
   * que el correo aun no esta clasificado.
   */
  @Column({ type: 'simple-json', nullable: true })
  categorias: string[] | null;

  /** Vista previa que entrega Graph. Metadato, no el cuerpo completo. */
  @Column({ name: 'body_preview', type: 'text', nullable: true })
  bodyPreview: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'has_attachments', type: 'boolean', default: false })
  hasAttachments: boolean;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  importance: string;

  @Column({ name: 'internet_message_id', type: 'varchar', length: 500, nullable: true })
  internetMessageId: string | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'buzon' })
  origen: CorreoOrigen;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
