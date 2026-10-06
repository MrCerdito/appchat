import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Estado de sincronizacion por carpeta de buzon.
 *
 * `delta_link` es el token opaco que devuelve `messages/delta`. Guardarlo es lo
 * que evita releer la carpeta entera en cada pasada: al volver, se reanuda
 * desde ahi. Cuando ese token expira Graph responde 410 y hay que rehacer la
 * sincronizacion completa de esa carpeta (ver CorreosSyncService).
 *
 * Se indexa por (buzon, carpeta) y no solo por carpeta porque el id de Graph es
 * unico por buzon, no por la organizacion.
 */
@Entity('correo_carpeta_sync')
@Index('idx_correo_carpeta_sync_folder', ['buzon', 'folderId'], { unique: true })
export class CorreoCarpetaSync {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  buzon: string;

  @Column({ name: 'folder_id', type: 'varchar', length: 255 })
  folderId: string;

  @Column({ name: 'folder_display_name', type: 'varchar', length: 255, nullable: true })
  folderDisplayName: string | null;

  @Column({ name: 'parent_folder_id', type: 'varchar', length: 255, nullable: true })
  parentFolderId: string | null;

  @Column({ name: 'delta_link', type: 'text', nullable: true })
  deltaLink: string | null;

  /**
   * True cuando ya se hizo una importacion completa de la carpeta, paginando
   * hasta el final.
   *
   * Es imprescindible y no es solo una optimizacion: `messages/delta` devuelve
   * en la primera pasada los mensajes mas recientes y despues un deltaLink, pero
   * los antiguos no vuelven a aparecer porque no son "cambios". Sin esta marca,
   * una carpeta con 54 mensajes se quedaba con 50 para siempre y el asesor no
   * veia su correo viejo.
   */
  @Column({ name: 'importado_completo', type: 'boolean', default: false })
  importadoCompleto: boolean;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
