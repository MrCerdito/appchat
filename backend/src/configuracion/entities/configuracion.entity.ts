import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTextTransformer } from '../../common/security/encrypted-text.transformer';

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
  @Column({ name: 'mensaje_bienvenida', type: 'text', nullable: true, default: '' })
  mensajeBienvenida: string;

  // ── Inactividad asesor ────────────────────────────────────────────────────
  @Column({ name: 'asesor_inactividad_seg', type: 'int', default: 120 })
  asesorInactividadSeg: number;

  @Column({ name: 'asesor_inactividad_msg', type: 'text', nullable: true, default: '' })
  asesorInactividadMsg: string;

  // ── Reconexion asesor ─────────────────────────────────────────────────────
  @Column({ name: 'asesor_reconexion_seg', type: 'int', default: 120 })
  asesorReconexionSeg: number;

  @Column({ name: 'asesor_reconexion_msg', type: 'text', nullable: true, default: '' })
  asesorReconexionMsg: string;

  // ── Inactividad cliente ───────────────────────────────────────────────────
  @Column({ name: 'cliente_inactividad_seg', type: 'int', default: 180 })
  clienteInactividadSeg: number;

  @Column({ name: 'cliente_inactividad_msg', type: 'text', nullable: true, default: '' })
  clienteInactividadMsg: string;

  @Column({ name: 'cliente_inactividad_iters', type: 'int', default: 2 })
  clienteInactividadIters: number;

  @Column({ name: 'cliente_cierre_msg', type: 'text', nullable: true, default: '' })
  clienteCierreMsg: string;

  // ── Horarios de jornada (configurados por el admin — no tocar) ────────────
  @Column({ type: 'jsonb', default: '[]' })
  horarios: HorarioSlot[];

  @Column({ name: 'horario_fuera_msg', type: 'text', nullable: true, default: '' })
  horarioFueraMsg: string;

  @Column({ name: 'horarios_activos', type: 'boolean', default: false })
  horariosActivos: boolean;

  @Column({
    name: 'whatsapp_assignment_msg',
    type: 'text',
    nullable: true,
    default:
      'Hola, soy {{agente}}. Ya fui asignado a tu conversacion y revisare tu caso.',
  })
  whatsappAssignmentMsg: string;

  @Column({
    name: 'whatsapp_queue_msg',
    type: 'text',
    nullable: true,
    default:
      'Te encuentras en cola. En breves momentos un agente se comunicara contigo.',
  })
  whatsappQueueMsg: string;

  @Column({
    name: 'whatsapp_out_of_hours_msg',
    type: 'text',
    nullable: true,
    default:
      'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
  })
  whatsappOutOfHoursMsg: string;

  @Column({
    name: 'whatsapp_call_unavailable_msg',
    type: 'text',
    nullable: true,
    default:
      'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un agente te atendera.',
  })
  whatsappCallUnavailableMsg: string;

  @Column({
    name: 'whatsapp_quick_replies',
    type: 'jsonb',
    default:
      '[{"name":"Saludo","content":"Hola, con gusto reviso tu caso."},{"name":"Espera","content":"Dame un momento mientras valido la informacion."},{"name":"Despedida","content":"Quedo atento si necesitas algo mas."}]',
  })
  whatsappQuickReplies: any[];

  @Column({
    name: 'whatsapp_max_active_chats_per_advisor',
    type: 'int',
    default: 3,
  })
  whatsappMaxActiveChatsPerAdvisor: number;

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

  @Column({ name: 'sonido_whatsapp', length: 30, nullable: true, default: 'whatsapp1' })
  sonidoWhatsapp: string;

  @Column({ name: 'sonido_asesor', length: 30, nullable: true, default: 'asesor1' })
  sonidoAsesor: string;

  @Column({ name: 'sonido_cliente', length: 30, nullable: true, default: 'cliente1' })
  sonidoCliente: string;

  @Column({ name: 'sonido_asignacion', length: 30, nullable: true, default: 'asignacion1' })
  sonidoAsignacion: string;

  // ── Correo de tickets (chat en linea) ───────────────────────────────────────
  @Column({ name: 'ticket_email_activo', type: 'boolean', default: true })
  ticketEmailActivo: boolean;

  @Column({
    name: 'ticket_email_asunto',
    type: 'text',
    nullable: true,
    default: 'Tu caso {{codigo}} fue registrado',
  })
  ticketEmailAsunto: string;

  @Column({
    name: 'ticket_email_cuerpo',
    type: 'text',
    nullable: true,
    default:
      'Hola {{nombre}},\n\nRecibimos tu solicitud y quedo registrada con el codigo {{codigo}}. Este numero te servira para consultar el estado de tu caso cuando quieras.\n\nDatos del caso:\n- Titulo: {{titulo}}\n- Descripcion: {{descripcion}}\n- Prioridad: {{prioridad}}\n- Fecha: {{fecha}}\n\nInformacion que registraste:\n\n{{informacion}}\n\nConversacion de tu solicitud:\n\n{{conversacion}}\n\nSi necesitas agregar algo o tienes alguna duda, puedes responder este correo o volver a escribirnos por el chat. Quedamos atentos.\n\nAtentamente,\nEquipo de Soporte',
  })
  ticketEmailCuerpo: string;

  // Modelo de bloques del editor visual de correo (round-trip del admin).
  // Si es NULL, el cuerpo se trata como HTML/plano legacy.
  @Column({ name: 'ticket_email_design', type: 'jsonb', nullable: true })
  ticketEmailDesign: any | null;

  // ── Remitente SMTP (correo propio que envia los tickets) ──────────────────
  @Column({ name: 'smtp_host', type: 'text', nullable: true, default: '' })
  smtpHost: string;

  @Column({ name: 'smtp_port', type: 'int', default: 465 })
  smtpPort: number;

  @Column({ name: 'smtp_secure', type: 'boolean', default: true })
  smtpSecure: boolean;

  @Column({ name: 'smtp_user', type: 'text', nullable: true, default: '' })
  smtpUser: string;

  @Column({
    name: 'smtp_pass',
    type: 'text',
    nullable: true,
    default: '',
    transformer: encryptedTextTransformer,
  })
  smtpPass: string;

  @Column({ name: 'mail_from', type: 'text', nullable: true, default: '' })
  mailFrom: string;

  // ── IA Prompt ──────────────────────────────────────────────────────────────
  @Column({ name: 'ai_prompt_config', type: 'jsonb', nullable: true })
  aiPromptConfig: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
