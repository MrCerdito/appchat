import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  PerfilInstitucionalService,
  PiFicha,
  PiGrupoFicha,
  PiHistorialItem,
} from '../../../../core/services/perfil-institucional.service';
import { NotificationService } from '../../../../core/services/notification.service';

type Tab = 'informacion' | 'historial';

@Component({
  selector: 'app-perfil-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './perfil-detalle.component.html',
  styleUrl: './perfil-detalle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilDetalleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ficha: PiFicha | null = null;
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

  subiendoLogo = false;
  exportando = false;

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

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter((p) => p.length > 1 && /^[a-záéíóúñü]/i.test(p))
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || nombre.substring(0, 2).toUpperCase();
  }

  /* ---------- Historial ---------- */
  private obtenerFechaColombia(): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    return {
      year:  parseInt(parts.find(p => p.type === 'year')!.value),
      month: parseInt(parts.find(p => p.type === 'month')!.value),
      day:   parseInt(parts.find(p => p.type === 'day')!.value),
    };
  }

  private colombiaToIso(y: number, m: number, d: number, h: number, min: number, s: number, ms: number): string {
    return new Date(Date.UTC(y, m - 1, d, h + 5, min, s, ms)).toISOString();
  }

  private obtenerRangoFecha(): { desde?: string; hasta?: string } {
    const { year, month, day } = this.obtenerFechaColombia();

    if (this.historialFiltroFecha === 'hoy') {
      return {
        desde: this.colombiaToIso(year, month, day, 0, 0, 0, 0),
        hasta: this.colombiaToIso(year, month, day, 23, 59, 59, 999),
      };
    }
    if (this.historialFiltroFecha === 'ayer') {
      const ayer = new Date(Date.UTC(year, month - 1, day - 1));
      const ay = ayer.getUTCFullYear();
      const am = ayer.getUTCMonth() + 1;
      const ad = ayer.getUTCDate();
      return {
        desde: this.colombiaToIso(ay, am, ad, 0, 0, 0, 0),
        hasta: this.colombiaToIso(ay, am, ad, 23, 59, 59, 999),
      };
    }
    if (this.historialFiltroFecha === 'rango' && this.historialRangoDesde && this.historialRangoHasta) {
      const [dy, dm, dd] = this.historialRangoDesde.split('-').map(Number);
      const [hy, hm, hd] = this.historialRangoHasta.split('-').map(Number);
      return {
        desde: this.colombiaToIso(dy, dm, dd, 0, 0, 0, 0),
        hasta: this.colombiaToIso(hy, hm, hd, 23, 59, 59, 999),
      };
    }
    return {};
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
