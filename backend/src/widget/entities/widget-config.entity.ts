import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('widget_config')
export class WidgetConfig {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Apariencia del botón ──────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, default: '#2563eb' })
  color: string;

  @Column({ type: 'varchar', length: 20, default: 'bottom-right' })
  posicion: string;

  @Column({ type: 'varchar', length: 10, default: 'circle' })
  forma: string;

  @Column({ type: 'varchar', length: 5, default: 'md' })
  tamano: string;

  @Column({ type: 'varchar', length: 20, default: 'chat' })
  icono: string;

  @Column({ name: 'texto_boton', type: 'varchar', length: 60, default: '' })
  textoBoton: string;

  @Column({ name: 'mostrar_texto', type: 'boolean', default: false })
  mostrarTexto: boolean;

  // ── Comportamiento ────────────────────────────────────────────────────────
  @Column({ name: 'abrir_automatico', type: 'boolean', default: false })
  abrirAutomatico: boolean;

  @Column({ name: 'delay_auto_abrir', type: 'int', default: 5 })
  delayAutoAbrir: number;

  @Column({ name: 'mensaje_burbuja', type: 'varchar', length: 150, default: '¿Necesitas ayuda? ¡Chatea con nosotros!' })
  mensajeBurbuja: string;

  @Column({ name: 'mostrar_burbuja', type: 'boolean', default: true })
  mostrarBurbuja: boolean;

  // ── Panel de chat (textos) ────────────────────────────────────────────────
  @Column({ name: 'titulo_panel', type: 'varchar', length: 100, default: 'Soporte en línea' })
  tituloPanelChat: string;

  @Column({ name: 'subtitulo_panel', type: 'varchar', length: 150, default: 'Estamos aquí para ayudarte' })
  subtituloPanelChat: string;

  @Column({ name: 'chat_url', type: 'varchar', length: 255, default: 'https://ia.innovacloud.co' })
  chatUrl: string;

  // ── Diseño del chat cliente ───────────────────────────────────────────────
  // Color del header y botones de acción dentro del chat
  @Column({ name: 'chat_header_color', type: 'varchar', length: 20, default: '#1a1a1a' })
  chatHeaderColor: string;

  // Color de fondo general del chat (pantalla detrás de los mensajes)
  @Column({ name: 'chat_bg_color', type: 'varchar', length: 20, default: '#f0ede9' })
  chatBgColor: string;

  // Color de las burbujas del asesor / IA
  @Column({ name: 'chat_bubble_color', type: 'varchar', length: 20, default: '#ffffff' })
  chatBubbleColor: string;

  // Color de las burbujas del usuario/cliente
  @Column({ name: 'chat_bubble_user_color', type: 'varchar', length: 20, default: '#1a1a1a' })
  chatBubbleUserColor: string;

  // Nombre de la marca que aparece en el header del chat
  @Column({ name: 'chat_marca', type: 'varchar', length: 80, default: 'Soporte en línea' })
  chatMarca: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}