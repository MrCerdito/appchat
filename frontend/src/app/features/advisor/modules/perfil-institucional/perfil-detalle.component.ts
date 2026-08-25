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

  grupoEditar: PiGrupoFicha | null = null;
  borrador: Record<string, string | boolean> = {};

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
  cargarHistorial(reset: boolean): void {
    if (!this.institucionId) return;
    if (reset) {
      this.historialPage = 1;
      this.historialCargando = true;
    }
    this.piService.historial(this.institucionId, String(this.historialPage))
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
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) +
          ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
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
