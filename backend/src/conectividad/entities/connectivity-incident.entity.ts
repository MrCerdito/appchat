import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Revisión administrativa de un incidente de conectividad detectado.
 *
 * La DETECCIÓN es on-read (se calcula cada vez desde `advisor_activity_log`);
 * esta tabla solo guarda lo que un humano decide: estado de revisión,
 * comentario y responsable. La clave `clave` identifica al incidente de forma
 * estable (`userId:desdeISO` para cortes, `userId:YYYY-MM-DDTHH:dia|hora`
 * para patrones de ráfaga) y NO depende de la posición en la lista.
 *
 * Los eventos históricos NUNCA se modifican al revisar un incidente.
 */
@Entity('connectivity_incidents')
@Index(['userId', 'clave'], { unique: true })
export class ConnectivityIncident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Identificador estable del incidente (ver comentario de la clase). */
  @Column({ type: 'varchar', length: 80 })
  clave: string;

  /** nuevo | en_revision | resuelto | descartado. */
  @Column({ type: 'varchar', length: 20, default: 'nuevo' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @Column({ type: 'uuid', nullable: true })
  responsableId: string | null;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
