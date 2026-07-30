import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('colegios')
export class Colegio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200, unique: true })
  nombre: string;

  @Column({ length: 500 })
  link: string;

  @Column({ length: 200, nullable: true })
  email: string;
}
