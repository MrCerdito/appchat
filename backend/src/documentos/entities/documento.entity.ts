import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('documentos')
export class Documento {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'text' })
  contenido: string;

  @Column({ name: 'chunk_index', default: 0 })
  chunkIndex: number;

  @Column({ name: 'total_chunks', default: 1 })
  totalChunks: number;

  @Column({ type: 'text', nullable: true })
  embedding: string | null;

  @Column({ name: 'pdf_path', type: 'text', nullable: true })
  pdfPath: string | null;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string | null;

  @Column({ type: 'text', nullable: true })
  colegio: string | null;

  @Column({ type: 'text', nullable: true })
  categoria: string | null;

  // Roles permitidos guardados como texto separado por comas
  // Ej: "admin,docente,estudiante,padre"
  // Se serializa/deserializa manualmente en el service
  @Column({ name: 'roles_permitidos', type: 'text', nullable: true })
  rolesPermitidos: string | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}