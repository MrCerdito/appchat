import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('ai_logs')
export class AiLog {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  sessionId: string;

  @Index()
  @Column({ nullable: true })
  colegio: string;

  @Column({ nullable: true })
  rol: string;

  @Column({ nullable: true })
  tipoSolicitud: string;

  @Column({ nullable: true })
  clientName: string;

  @Column('text')
  pregunta: string;

  @Column('text', { nullable: true })
  respuesta: string;

  @Column('jsonb', { nullable: true })
  chunksUsados: {
    nombre    : string;
    categoria : string | null;
    chunkIndex: number;
    distancia : number | null;
    fragmento : string;
  }[];

  @Column({ default: false })
  tuvoContexto: boolean;

  @Column({ nullable: true })
  tiempoRespuestaMs: number;

  @Column({ nullable: true })
  tokensEstimados: number;

  @Column({ default: false })
  transfer: boolean;

  @Column({ nullable: true })
  feedback: boolean;

  @Column({ default: false })
  esRestringido: boolean;

  @Column({ default: false })
  huboError: boolean;

  @Column('text', { nullable: true })
  errorMsg: string;

  @CreateDateColumn()
  creadoEn: Date;
}