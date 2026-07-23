import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface HorarioSlot {
  dia: number; // 0=dom, 1=lun ... 6=sáb
  inicio: string; // "08:00"
  fin: string; // "17:00"
}

// ★ Horario de almuerzo personal del asesor
export interface HorarioAlmuerzo {
  dia: number; // 0=dom, 1=lun ... 6=sáb
  inicio: string; // "12:00"
  fin: string; // "13:00"
}

@Entity('configuracion')
export class Configuracion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // NULL = global, UUID = override de asesor
  @Column({ name: 'advisor_id', type: 'uuid', nullable: true, unique: true })
  advisorId: string | null;

  // ── Bienvenida ────────────────────────────────────────────────────────────
  @Column({ name: 'mensaje_bienvenida', type: 'text' })
  mensajeBienvenida: string;

  // ── Inactividad asesor ────────────────────────────────────────────────────
  @Column({ name: 'asesor_inactividad_seg', type: 'int', default: 120 })
  asesorInactividadSeg: number;

  @Column({ name: 'asesor_inactividad_msg', type: 'text' })
  asesorInactividadMsg: string;

  // ── Inactividad cliente ───────────────────────────────────────────────────
  @Column({ name: 'cliente_inactividad_seg', type: 'int', default: 180 })
  clienteInactividadSeg: number;

  @Column({ name: 'cliente_inactividad_msg', type: 'text' })
  clienteInactividadMsg: string;

  @Column({ name: 'cliente_inactividad_iters', type: 'int', default: 2 })
  clienteInactividadIters: number;

  @Column({ name: 'cliente_cierre_msg', type: 'text' })
  clienteCierreMsg: string;

  // ── Horarios de jornada (configurados por el admin — no tocar) ────────────
  @Column({ type: 'jsonb', default: '[]' })
  horarios: HorarioSlot[];

  @Column({ name: 'horario_fuera_msg', type: 'text' })
  horarioFueraMsg: string;

  @Column({ name: 'horarios_activos', type: 'boolean', default: false })
  horariosActivos: boolean;

  @Column({
    name: 'whatsapp_assignment_msg',
    type: 'text',
    default:
      'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
  })
  whatsappAssignmentMsg: string;

  @Column({
    name: 'whatsapp_queue_msg',
    type: 'text',
    default:
      'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
  })
  whatsappQueueMsg: string;

  @Column({
    name: 'whatsapp_out_of_hours_msg',
    type: 'text',
    default:
      'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
  })
  whatsappOutOfHoursMsg: string;

  @Column({
    name: 'whatsapp_call_unavailable_msg',
    type: 'text',
    default:
      'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
  })
  whatsappCallUnavailableMsg: string;

  @Column({
    name: 'whatsapp_quick_replies',
    type: 'jsonb',
    default:
      '[{"name":"Saludo","content":"Hola, con gusto reviso tu caso."},{"name":"Espera","content":"Dame un momento mientras valido la informacion."},{"name":"Despedida","content":"Quedo atento si necesitas algo mas."}]',
  })
  whatsappQuickReplies: any[];

  // ★ Horarios de almuerzo personales del asesor
  // Columna nueva — requiere ejecutar el ALTER TABLE de abajo en la BD
  @Column({ type: 'jsonb', default: '[]' })
  almuerzos: HorarioAlmuerzo[];

  @Column({
    name: 'ticket_categories',
    type: 'jsonb',
    default: () =>
      '\'["Soporte tecnico","Administrativo","Academico","Facturacion","Otro"]\'::jsonb',
  })
  ticketCategories: string[];

  // ── Sonido ──────────────────────────────────────────────────────────────────
  @Column({ name: 'sonido_activado', type: 'boolean', default: true })
  sonidoActivado: boolean;

  @Column({ name: 'sonido_whatsapp', length: 30, default: 'whatsapp1' })
  sonidoWhatsapp: string;

  @Column({ name: 'sonido_asesor', length: 30, default: 'asesor1' })
  sonidoAsesor: string;

  @Column({ name: 'sonido_cliente', length: 30, default: 'cliente1' })
  sonidoCliente: string;

  @Column({ name: 'sonido_asignacion', length: 30, default: 'asignacion1' })
  sonidoAsignacion: string;

  // ── IA Prompt ──────────────────────────────────────────────────────────────
  @Column({ name: 'ai_prompt_config', type: 'jsonb', nullable: true })
  aiPromptConfig: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
