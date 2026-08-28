import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Subject, takeUntil } from 'rxjs';
import {
  PerfilInstitucionalService,
  PiFicha,
  PiGrupoFicha,
  PiHistorialItem,
} from '../../../../core/services/perfil-institucional.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SessionService } from '../../../../core/services/session.service';
import { PI_ICONS } from './pi-icons';
import {
  FechaCivil,
  bogotaCivilAUtc,
  fechaBogotaActual,
  rangoDiaBogotaUtc,
  restarDiasCivil,
} from './perfil-detalle-date.util';

type Tab = 'informacion' | 'historial';

@Component({
  selector: 'app-perfil-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './perfil-detalle.component.html',
  styleUrl: './perfil-detalle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilDetalleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  readonly icons = PI_ICONS;

  ficha: PiFicha | null = null;

  /* Acordeones de campos personalizados */
  gruposAbiertos: Record<string, boolean> = {};

  /* Dropdown searchable de asesores (modal base) */
  dropdownAsesorAbierto = false;
  dropdownExpandArriba = false;
  dropdownRect: { top?: number; bottom?: number; left: number; width: number } = { left: 0, width: 0 };
  busquedaAsesor = '';
  loading = true;
  guardando = false;

  tab: Tab = 'informacion';

  historial: PiHistorialItem[] = [];
  historialPage = 1;
  historialTotal = 0;
  historialCargando = false;
  historialFiltroFecha: 'todos' | 'hoy' | 'ayer' | 'rango' = 'todos';
  historialRangoDesde = '';
  historialRangoHasta = '';

  grupoEditar: PiGrupoFicha | null = null;
  borrador: Record<string, string | boolean> = {};

  /* Modal correos */
  modalEmailsCampoId: string | null = null;
  modalEmailsCampoNombre = '';
  modalEmails: string[] = [];
  guardandoEmails = false;

  /* Modal email institución */
  modalEmailInstitucion = false;
  emailInstitucionLista: string[] = [];
  guardandoEmailInstitucion = false;

  /* Modal ciudad institución */
  modalCiudadInstitucion = false;
  ciudadInstitucionValor = '';
  guardandoCiudadInstitucion = false;

  /* Modal editables base */
  modalBaseCampo: 'nombre' | 'link' | 'calendario' | 'proyecto' | 'asesor' | null = null;
  baseValor = '';
  baseGuardando = false;
  advisors: { id: string; name: string }[] = [];

  subiendoLogo = false;
  exportando = false;
  guardandoEstado = false;

  private readonly ACCIONES_LABEL: Record<string, string> = {
    actualizar_valor: 'Actualizó',
    actualizar_logo: 'Actualizó el logo',
    cambiar_estado: 'Cambió el estado',
    crear_campo: 'Creó el campo',
    editar_campo: 'Editó el campo',
    eliminar_campo: 'Eliminó el campo',
  };

  constructor(
    private piService: PerfilInstitucionalService,
    private sessionService: SessionService,
    private notification: NotificationService,
    private route: ActivatedRoute,
    private location: Location,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.location.back();
      return;
    }
    this.cargar(id);
    this.cargarAsesores();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get institucionId(): string | null {
    return this.ficha?.institucion.id ?? null;
  }

  volver(): void {
    this.location.back();
  }

  cargar(id?: string): void {
    const targetId = id ?? this.institucionId;
    if (!targetId) return;
    if (!id) this.loading = true;
    this.piService.obtenerFicha(targetId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ficha) => {
          this.ficha = ficha;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.notification.error('Error', 'No se pudo cargar la ficha de la institución');
          this.cdr.detectChanges();
        },
      });
  }

  /* ---------- Tabs ---------- */
  cambiarTab(tab: Tab): void {
    this.tab = tab;
    if (tab === 'historial' && this.historial.length === 0) this.cargarHistorial(true);
    this.cdr.detectChanges();
  }

  /* ---------- Logo ---------- */
  abrirSelectorLogo(input: HTMLInputElement): void {
    input.click();
  }

  alSeleccionarLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.institucionId) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      this.notification.error('Formato no válido', 'Usa una imagen JPG, PNG, WebP o GIF');
      return;
    }
    this.subiendoLogo = true;
    this.piService.subirLogo(this.institucionId, file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.subiendoLogo = false;
          if (this.ficha) {
            const version = Date.now();
            this.ficha.institucion.logoUrl = `${res.logoUrl}?v=${version}`;
          }
          this.notification.success('Logo actualizado', file.name);
          this.cdr.detectChanges();
        },
        error: () => {
          this.subiendoLogo = false;
          this.notification.error('Error', 'No se pudo subir el logo');
          this.cdr.detectChanges();
        },
      });
  }

  /* ---------- Acordeones de grupos ---------- */
  grupoAbierto(id: string): boolean {
    return this.gruposAbiertos[id] === true;
  }

  toggleGrupo(id: string): void {
    this.gruposAbiertos[id] = !this.grupoAbierto(id);
    this.cdr.detectChanges();
  }

  /* ---------- Edición de valores ---------- */
  abrirEdicion(grupo: PiGrupoFicha): void {
    this.grupoEditar = grupo;
    this.borrador = {};
    for (const item of grupo.campos) {
      const campo = item.campo;
      if (campo.tipo === 'booleano') {
        this.borrador[campo.id] = item.valor === 'true';
      } else {
        this.borrador[campo.id] = item.valor ?? '';
      }
    }
    this.cdr.detectChanges();
  }

  cerrarEdicion(): void {
    this.grupoEditar = null;
    this.borrador = {};
  }

  guardarEdicion(): void {
    if (!this.grupoEditar || !this.institucionId) return;
    const valores = this.grupoEditar.campos.map((item) => {
      let valor: string | null;
      if (item.campo.tipo === 'booleano') {
        valor = this.borrador[item.campo.id] ? 'true' : 'false';
      } else {
        const raw = String(this.borrador[item.campo.id] ?? '').trim();
        valor = raw === '' ? null : raw;
      }
      return { campoId: item.campo.id, valor };
    });

    this.guardando = true;
    this.piService.guardarValores(this.institucionId, valores)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarEdicion();
          this.notification.success('Información guardada', '');
          this.cargar();
        },
        error: (err: any) => {
          this.guardando = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudieron guardar los cambios');
          this.cdr.detectChanges();
        },
      });
  }

  /* ---------- Valores ---------- */
  esBooleanoActivo(valor: string | null): boolean {
    return valor === 'true';
  }

  parseEmails(valor: string | null): string[] {
    if (!valor) return [];
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed.filter((e: unknown) => typeof e === 'string' && e.trim()) : [];
    } catch {
      return valor.trim() ? [valor.trim()] : [];
    }
  }

  serializarEmails(emails: string[]): string {
    const limpios = emails.map(e => e.trim()).filter(Boolean);
    return JSON.stringify(limpios);
  }

  /* ---------- Modal correos ---------- */
  abrirModalEmails(item: { campo: { id: string; nombre: string }; valor: string | null }): void {
    this.modalEmailsCampoId = item.campo.id;
    this.modalEmailsCampoNombre = item.campo.nombre;
    this.modalEmails = this.parseEmails(item.valor);
    this.cdr.detectChanges();
  }

  cerrarModalEmails(): void {
    this.modalEmailsCampoId = null;
    this.modalEmailsCampoNombre = '';
    this.modalEmails = [];
  }

  agregarEmailModal(input: HTMLInputElement): void {
    const val = input.value.trim();
    if (!val) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      this.notification.error('Formato inválido', 'Ingresa un correo electrónico válido');
      return;
    }
    if (this.modalEmails.includes(val)) {
      this.notification.warning('Duplicado', 'Este correo ya está en la lista');
      return;
    }
    this.modalEmails.push(val);
    input.value = '';
    this.cdr.detectChanges();
  }

  quitarEmailModal(index: number): void {
    this.modalEmails.splice(index, 1);
    this.cdr.detectChanges();
  }

  guardarEmails(): void {
    if (!this.modalEmailsCampoId || !this.institucionId) return;
    const valor = this.modalEmails.length > 0 ? this.serializarEmails(this.modalEmails) : null;
    this.guardandoEmails = true;
    this.piService.guardarValores(this.institucionId, [{ campoId: this.modalEmailsCampoId, valor }])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardandoEmails = false;
          this.cerrarModalEmails();
          this.notification.success('Correos guardados', '');
          this.cargar();
        },
        error: (err: any) => {
          this.guardandoEmails = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudieron guardar los correos');
          this.cdr.detectChanges();
        },
      });
  }

  /* ---------- Modal email institución ---------- */
  parseEmailsInstitucion(): string[] {
    const raw = this.ficha?.institucion.email;
    if (!raw) return [];
    return raw.split('|').map(e => e.trim()).filter(Boolean);
  }

  abrirModalEmailInstitucion(): void {
    this.emailInstitucionLista = this.parseEmailsInstitucion();
    this.modalEmailInstitucion = true;
    this.cdr.detectChanges();
  }

  cerrarModalEmailInstitucion(): void {
    this.modalEmailInstitucion = false;
    this.emailInstitucionLista = [];
  }

  agregarEmailInstitucion(input: HTMLInputElement): void {
    const val = input.value.trim();
    if (!val) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      this.notification.error('Formato inválido', 'Ingresa un correo electrónico válido');
      return;
    }
    if (this.emailInstitucionLista.includes(val)) {
      this.notification.warning('Duplicado', 'Este correo ya está en la lista');
      return;
    }
    this.emailInstitucionLista.push(val);
    input.value = '';
    this.cdr.detectChanges();
  }

  quitarEmailInstitucion(index: number): void {
    this.emailInstitucionLista.splice(index, 1);
    this.cdr.detectChanges();
  }

  guardarEmailInstitucion(): void {
    if (!this.institucionId) return;
    const limpios = this.emailInstitucionLista.map(e => e.trim()).filter(Boolean);
    const valor = limpios.length > 0 ? limpios.join('|') : null;
    this.guardandoEmailInstitucion = true;
    this.piService.actualizarEmail(this.institucionId, valor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardandoEmailInstitucion = false;
          if (this.ficha) this.ficha.institucion.email = valor;
          this.cerrarModalEmailInstitucion();
          this.notification.success('Correos actualizados', '');
          this.cargar();
        },
        error: (err: any) => {
          this.guardandoEmailInstitucion = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudieron guardar los correos');
          this.cdr.detectChanges();
        },
      });
  }

  abrirModalCiudadInstitucion(): void {
    this.ciudadInstitucionValor = this.ficha?.institucion.ciudad ?? '';
    this.modalCiudadInstitucion = true;
  }

  cerrarModalCiudadInstitucion(): void {
    this.modalCiudadInstitucion = false;
    this.ciudadInstitucionValor = '';
  }

  guardarCiudadInstitucion(): void {
    if (!this.institucionId) return;
    this.guardandoCiudadInstitucion = true;
    this.piService.actualizarCiudad(this.institucionId, this.ciudadInstitucionValor.trim() || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardandoCiudadInstitucion = false;
          if (this.ficha) this.ficha.institucion.ciudad = this.ciudadInstitucionValor.trim() || null;
          this.cerrarModalCiudadInstitucion();
          this.notification.success('Ciudad actualizada', '');
          this.cargar();
        },
        error: (err: any) => {
          this.guardandoCiudadInstitucion = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudo guardar la ciudad');
          this.cdr.detectChanges();
        },
      });
  }

  toggleEstado(): void {
    if (!this.institucionId || !this.ficha) return;
    this.guardandoEstado = true;
    const nuevo = !this.ficha.institucion.activo;
    this.piService.cambiarEstado(this.institucionId, nuevo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardandoEstado = false;
          this.notification.success(
            nuevo ? 'Institución activada' : 'Institución inactivada',
            '',
          );
          this.cargar();
        },
        error: (err: any) => {
          this.guardandoEstado = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudo cambiar el estado');
          this.cdr.detectChanges();
        },
      });
  }

  cargarAsesores(): void {
    this.sessionService.findAdvisors().pipe(takeUntil(this.destroy$)).subscribe({
      next: (users: any[]) => {
        this.advisors = (users || [])
          .filter(u => u && u.active !== false)
          .map(u => ({ id: u.id, name: u.name ?? '' }))
          .filter(a => a.name);
        this.cdr.detectChanges();
      },
      error: () => {
        this.advisors = [];
      },
    });
  }

  abrirModalBase(campo: 'nombre' | 'link' | 'calendario' | 'proyecto' | 'asesor'): void {
    const inst = this.ficha?.institucion;
    if (!inst) return;
    switch (campo) {
      case 'nombre': this.baseValor = inst.nombre ?? ''; break;
      case 'link': this.baseValor = inst.link ?? ''; break;
      case 'calendario': this.baseValor = inst.calendario ?? ''; break;
      case 'proyecto': this.baseValor = inst.tipoColegio ?? ''; break;
      case 'asesor': {
        const match = this.advisors.find(a => a.name === inst.advisorNombre);
        this.baseValor = match ? match.id : '';
        this.busquedaAsesor = '';
        this.dropdownAsesorAbierto = false;
        break;
      }
    }
    this.modalBaseCampo = campo;
  }

  toggleDropdownAsesor(trigger?: HTMLElement): void {
    const willOpen = !this.dropdownAsesorAbierto;
    this.dropdownAsesorAbierto = willOpen;
    if (willOpen && trigger) {
      const r = trigger.getBoundingClientRect();
      const optionsH = Math.min(280, window.innerHeight * 0.4);
      const spaceBelow = window.innerHeight - r.bottom - 12;
      if (spaceBelow < optionsH) {
        this.dropdownExpandArriba = true;
        this.dropdownRect = {
          left: r.left,
          width: r.width,
          bottom: window.innerHeight - r.top + 12,
        };
      } else {
        this.dropdownExpandArriba = false;
        this.dropdownRect = { left: r.left, width: r.width, top: r.bottom + 6 };
      }
    }
    this.cdr.detectChanges();
  }

  seleccionarAsesorId(id: string): void {
    this.baseValor = id;
    this.dropdownAsesorAbierto = false;
    this.cdr.detectChanges();
  }

  filtrarAsesoresBusqueda(): { id: string; name: string }[] {
    const q = this.busquedaAsesor.trim().toLowerCase();
    if (!q) return this.advisors;
    return this.advisors.filter(a => a.name.toLowerCase().includes(q));
  }

  cerrarModalBase(): void {
    this.modalBaseCampo = null;
    this.baseValor = '';
    this.dropdownAsesorAbierto = false;
    this.busquedaAsesor = '';
  }

  get asesorSeleccionadoNombre(): string {
    const a = this.advisors.find(x => x.id === this.baseValor);
    return a ? a.name : '';
  }

  get baseCampoTitulo(): string {
    switch (this.modalBaseCampo) {
      case 'nombre': return 'Editar nombre';
      case 'link': return 'Editar link';
      case 'calendario': return 'Editar calendario';
      case 'proyecto': return 'Editar proyecto';
      case 'asesor': return 'Asignar asesor';
      default: return 'Editar';
    }
  }

  get baseCampoEsAsesor(): boolean {
    return this.modalBaseCampo === 'asesor';
  }

  guardarBase(): void {
    if (!this.institucionId || !this.modalBaseCampo) return;
    const dto: any = {};
    switch (this.modalBaseCampo) {
      case 'nombre': dto.nombre = this.baseValor.trim(); break;
      case 'link': dto.link = this.baseValor.trim(); break;
      case 'calendario': dto.calendario = this.baseValor.trim() || null; break;
      case 'proyecto': dto.tipoColegio = this.baseValor.trim() || null; break;
      case 'asesor': dto.advisorId = this.baseValor || null; break;
    }
    this.baseGuardando = true;
    this.piService.actualizarBase(this.institucionId, dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.baseGuardando = false;
          this.cerrarModalBase();
          this.notification.success('Cambios guardados', '');
          this.cargar();
        },
        error: (err: any) => {
          this.baseGuardando = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudieron guardar los cambios');
          this.cdr.detectChanges();
        },
      });
  }

  formatearValor(item: { campo: { tipo: string }; valor: string | null }): string {
    if (!item.valor) return '—';
    if (item.campo.tipo === 'fecha') {
      const d = new Date(`${item.valor}T00:00:00`);
      return isNaN(d.getTime())
        ? item.valor
        : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    return item.valor;
  }

  camposPendientes(grupo: PiGrupoFicha): number {
    return grupo.campos.filter(item => item.campo.requerido && !item.valor).length;
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter((p) => p.length > 1 && /^[a-záéíóúñü]/i.test(p))
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || nombre.substring(0, 2).toUpperCase();
  }

  /* ---------- Historial ---------- */
  private obtenerRangoFecha(): { desde?: string; hasta?: string } {
    const hoy = this.fechaHoy;

    if (this.historialFiltroFecha === 'hoy') {
      return rangoDiaBogotaUtc(hoy);
    }
    if (this.historialFiltroFecha === 'ayer') {
      return rangoDiaBogotaUtc(restarDiasCivil(hoy, 1));
    }
    if (this.historialFiltroFecha === 'rango' && this.historialRangoDesde && this.historialRangoHasta) {
      const [dy, dm, dd] = this.historialRangoDesde.split('-').map(Number);
      const [hy, hm, hd] = this.historialRangoHasta.split('-').map(Number);
      const desde = bogotaCivilAUtc({ year: dy, month: dm, day: dd }, 0, 0, 0, 0);
      const hasta = bogotaCivilAUtc({ year: hy, month: hm, day: hd }, 23, 59, 59, 999);
      return { desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString() };
    }
    return {};
  }

  private get fechaHoy(): FechaCivil {
    return fechaBogotaActual();
  }

  cargarHistorial(reset: boolean): void {
    if (!this.institucionId) return;
    if (reset) {
      this.historialPage = 1;
      this.historialCargando = true;
    }
    const rango = this.obtenerRangoFecha();
    this.piService.historial(this.institucionId, String(this.historialPage), rango.desde, rango.hasta)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.historial = reset ? res.data : [...this.historial, ...res.data];
          this.historialTotal = res.total;
          this.historialCargando = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.historialCargando = false;
          this.notification.error('Error', 'No se pudo cargar el historial');
          this.cdr.detectChanges();
        },
      });
  }

  filtrarHistorialFecha(filtro: 'todos' | 'hoy' | 'ayer' | 'rango'): void {
    this.historialFiltroFecha = filtro;
    if (filtro !== 'rango') {
      this.historialRangoDesde = '';
      this.historialRangoHasta = '';
    }
    this.cargarHistorial(true);
  }

  aplicarRangoHistorial(): void {
    if (this.historialRangoDesde && this.historialRangoHasta) {
      this.cargarHistorial(true);
    }
  }

  masHistorial(): void {
    this.historialPage++;
    this.historialCargando = true;
    this.cargarHistorial(false);
  }

  accionLabel(accion: string): string {
    return this.ACCIONES_LABEL[accion] ?? accion;
  }

  formatearFecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const tzOpts = { timeZone: 'America/Bogota' as const };
    return d.toLocaleDateString('es-CO', { ...tzOpts, day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('es-CO', { ...tzOpts, hour: '2-digit', minute: '2-digit' });
  }

  /* ── Export ficha ── */
  exportarFicha(): void {
    if (!this.institucionId) return;
    this.exportando = true;
    this.cdr.detectChanges();
    this.piService.exportarFicha(this.institucionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ficha-${(this.ficha?.institucion.nombre ?? 'institucion').replace(/\s+/g, '_')}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
          this.exportando = false;
          this.notification.success('Exportación', 'Ficha descargada');
          this.cdr.detectChanges();
        },
        error: () => {
          this.exportando = false;
          this.notification.error('Error', 'No se pudo exportar la ficha');
          this.cdr.detectChanges();
        },
      });
  }
}
