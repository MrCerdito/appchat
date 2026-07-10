import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { WidgetConfig } from '../widget/entities/widget-config.entity';
import { Faq } from '../faq/entities/faq.entity';
import { Colegio } from '../sessions/entities/colegio.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Configuracion)
    private readonly configRepo: Repository<Configuracion>,
    @InjectRepository(WidgetConfig)
    private readonly widgetRepo: Repository<WidgetConfig>,
    @InjectRepository(Faq)
    private readonly faqRepo: Repository<Faq>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed() {
    const adminExists = await this.userRepo.findOne({
      where: { role: 'admin' },
    });
    if (adminExists) {
      this.logger.log('Base de datos ya tiene datos — seed omitido');
      return;
    }

    this.logger.log('Base de datos vacía — insertando datos iniciales...');

    try {
      await this.seedUsers();
      await this.seedConfiguracion();
      await this.seedWidgetConfig();
      await this.seedColegios();
      await this.seedFaqs();
      this.logger.log('Seed completado exitosamente');
    } catch (error) {
      this.logger.error('Error durante el seed:', error);
    }
  }

  private async seedUsers() {
    const passwordHashAdmin = await bcrypt.hash('Admin123', 10);
    const passwordHashAsesor = await bcrypt.hash('asesor123', 10);

    const admin = this.userRepo.create({
      name: 'Administrador',
      email: 'admin@innovacloud.co',
      password: passwordHashAdmin,
      role: 'admin',
      active: true,
      status: 'offline',
      activeChats: 0,
    });
    await this.userRepo.save(admin);

    const advisor = this.userRepo.create({
      name: 'Andres Sapta',
      email: 'asesor@innovacloud.com',
      password: passwordHashAsesor,
      role: 'advisor',
      active: true,
      status: 'offline',
      activeChats: 0,
    });
    await this.userRepo.save(advisor);

    this.logger.log('Usuarios creados exitosamente');
  }

  private async seedConfiguracion() {
    const config = this.configRepo.create({
      advisorId: null,
      mensajeBienvenida:
        '¡Hola! Soy {{asesor}}, tu asesor de soporte. ¿En qué puedo ayudarte hoy?',
      asesorInactividadSeg: 120,
      asesorInactividadMsg:
        'Estamos trabajando en tu solicitud, en breve te atendemos.',
      clienteInactividadSeg: 180,
      clienteInactividadMsg:
        '¿Sigues en línea? Tu sesión se cerrará pronto si no hay respuesta.',
      clienteInactividadIters: 2,
      clienteCierreMsg:
        'La sesión ha sido cerrada por inactividad. Puedes iniciar una nueva consulta cuando lo necesites.',
      horarios: [
        { dia: 1, inicio: '08:00', fin: '17:00' },
        { dia: 2, inicio: '08:00', fin: '17:00' },
        { dia: 3, inicio: '08:00', fin: '17:00' },
        { dia: 4, inicio: '08:00', fin: '17:00' },
        { dia: 5, inicio: '08:00', fin: '17:00' },
      ],
      horarioFueraMsg:
        'En este momento estamos fuera de horario. Nuestro horario de atención es de lunes a viernes de 8:00 a 17:00.',
      horariosActivos: true,
      whatsappAssignmentMsg:
        'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
      whatsappQueueMsg:
        'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
      whatsappOutOfHoursMsg:
        'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
      whatsappCallUnavailableMsg:
        'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
      whatsappQuickReplies: [
        'Hola, con gusto reviso tu caso.',
        'Dame un momento mientras valido la informacion.',
        'Quedo atento si necesitas algo mas.',
      ],
      almuerzos: [],
      ticketCategories: [
        'Soporte tecnico',
        'Administrativo',
        'Academico',
        'Facturacion',
        'Otro',
      ],
    });
    await this.configRepo.save(config);
    this.logger.log('Configuración global creada');
  }

  private async seedWidgetConfig() {
    const widget = this.widgetRepo.create({
      color: '#2563eb',
      posicion: 'bottom-right',
      forma: 'circle',
      tamano: 'md',
      icono: 'chat',
      textoBoton: '',
      mostrarTexto: false,
      abrirAutomatico: false,
      delayAutoAbrir: 5,
      mensajeBurbuja: '¿Necesitas ayuda? ¡Chatea con nosotros!',
      mostrarBurbuja: true,
      tituloPanelChat: 'Soporte en línea',
      subtituloPanelChat: 'Estamos aquí para ayudarte',
      chatUrl: 'https://ia.innovacloud.co',
      chatHeaderColor: '#1a1a1a',
      chatBgColor: '#f0ede9',
      chatBubbleColor: '#ffffff',
      chatBubbleUserColor: '#1a1a1a',
      chatMarca: 'Soporte en línea',
    });
    await this.widgetRepo.save(widget);
    this.logger.log('Widget config creado');
  }

  private async seedColegios() {
    const colegios = this.colegioRepo.create([
      {
        nombre: 'Innovacloud',
        link: 'https://innovacloud.co',
        email: 'info@innovacloud.co',
      },
      { nombre: 'Colegio General', link: '#', email: '' },
    ]);
    await this.colegioRepo.save(colegios);
    this.logger.log('Colegios creados');
  }

  private async seedFaqs() {
    const faqs = this.faqRepo.create([
      {
        pregunta: '¿Cómo puedo contactar a un asesor?',
        respuesta:
          'Puedes contactar a un asesor a través de nuestro chat en línea. Solo escribe tu consulta y un asesor te atenderá a la brevedad.',
        categoria: 'General',
        keywords: ['contactar', 'asesor', 'ayuda', 'humano'],
        orden: 1,
        activo: true,
      },
      {
        pregunta: '¿Cuál es el horario de atención?',
        respuesta:
          'Nuestro horario de atención es de lunes a viernes de 8:00 a 17:00.',
        categoria: 'General',
        keywords: ['horario', 'atencion', 'horas'],
        orden: 2,
        activo: true,
      },
      {
        pregunta: '¿Cómo puedo crear un ticket de soporte?',
        respuesta:
          'Durante tu conversación con un asesor, puedes solicitar la creación de un ticket para dar seguimiento a tu caso de manera más estructurada.',
        categoria: 'Soporte',
        keywords: ['ticket', 'soporte', 'caso', 'seguimiento'],
        orden: 3,
        activo: true,
      },
    ]);
    await this.faqRepo.save(faqs);
    this.logger.log('FAQs creadas');
  }
}
