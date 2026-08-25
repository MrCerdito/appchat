import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  PerfilInstitucionalService,
  PiInstitucionCard,
} from '../../../../core/services/perfil-institucional.service';
import { NotificationService } from '../../../../core/services/notification.service';

interface FiltroDinamico {
  campoId: string;
  nombre: string;
  tipo: string;
  opciones: string[];
}

@Component({
  selector: 'app-perfil-institucional',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './perfil-institucional.component.html',
  styleUrl: './perfil-institucional.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilInstitucionalComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  instituciones: PiInstitucionCard[] = [];
  asesoresDisponibles: string[] = [];
  loading = true;
  q = '';
  filtroEstado = '';
  filtroCalendario = new Set<string>();
  filtroTipo = new Set<string>();
  filtroAsesor = new Set<string>();
  orden = 'nombre';
  filtrosDinamicos: FiltroDinamico[] = [];
  valoresFiltros: Record<string, string> = {};
  mostrarFiltrosDinamicos = false;

  readonly limitePorPagina = 15;
  page = 1;
  pages = 1;
  total = 0;

  exportando = false;
  importando = false;
  mostrarModalImportar = false;
  archivoImportar: File | null = null;
  resultadoImportar: { ok: boolean; created: number; updated: number; total: number; errores: string[] } | null = null;

  private busquedaTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private piService: PerfilInstitucionalService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    clearTimeout(this.busquedaTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  alEscribirBusqueda(): void {
    clearTimeout(this.busquedaTimer);
    this.busquedaTimer = setTimeout(() => {
      this.page = 1;
      this.cargar(true);
    }, 350);
  }

  limpiarBusqueda(): void {
    clearTimeout(this.busquedaTimer);
    this.q = '';
    this.page = 1;
    this.cargar(true);
  }

  alCambiarFiltros(): void {
    this.page = 1;
    this.cargar();
  }

  toggleCalendario(val: string): void {
    if (this.filtroCalendario.has(val)) {
      this.filtroCalendario.delete(val);
    } else {
      this.filtroCalendario.add(val);
    }
    this.alCambiarFiltros();
  }

  toggleTipo(val: string): void {
    if (this.filtroTipo.has(val)) {
      this.filtroTipo.delete(val);
    } else {
      this.filtroTipo.add(val);
    }
    this.alCambiarFiltros();
  }

  toggleEstado(val: string): void {
    this.filtroEstado = this.filtroEstado === val ? '' : val;
    this.alCambiarFiltros();
  }

  toggleAsesor(nombre: string): void {
    if (this.filtroAsesor.has(nombre)) {
      this.filtroAsesor.delete(nombre);
    } else {
      this.filtroAsesor.add(nombre);
    }
    this.alCambiarFiltros();
  }

  irAPagina(p: number): void {
    if (p < 1 || p > this.pages || p === this.page) return;
    this.page = p;
    this.cargar();
    this.scrollArriba();
  }

  private scrollArriba(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Ventana de páginas numeradas alrededor de la actual. */
  paginasVisibles(): number[] {
    const total = this.pages;
    const actual = this.page;
    const rango: number[] = [];
    let desde = Math.max(1, actual - 2);
    const hasta = Math.min(total, desde + 4);
    desde = Math.max(1, hasta - 4);
    for (let i = desde; i <= hasta; i++) rango.push(i);
    return rango;
  }

  cargar(silencioso = false): void {
    if (!silencioso) this.loading = true;
    const params: Record<string, string | undefined> = {
      q: this.q || undefined,
      estado: this.filtroEstado || undefined,
      calendario: this.filtroCalendario.size > 0 ? [...this.filtroCalendario].join(',') : undefined,
      tipo: this.filtroTipo.size > 0 ? [...this.filtroTipo].join(',') : undefined,
      asesor: this.filtroAsesor.size > 0 ? [...this.filtroAsesor].join(',') : undefined,
      sort: this.orden,
      page: String(this.page),
      limit: String(this.limitePorPagina),
    };
    for (const f of this.filtrosDinamicos) {
      const v = this.valoresFiltros[f.campoId];
      if (v) params[`f_${f.campoId}`] = v;
    }

    this.piService.listarInstituciones(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.instituciones = res.instituciones;
          this.asesoresDisponibles = res.asesoresDisponibles ?? [];
          this.total = res.total;
          this.pages = res.pages ?? 1;
          if (this.page > this.pages) {
            this.page = this.pages;
            this.cargar(true);
            return;
          }
          this.sincronizarFiltrosDinamicos(res.camposFiltrables);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.notification.error('Error', 'No se pudieron cargar las instituciones');
          this.cdr.detectChanges();
        },
      });
  }

  private sincronizarFiltrosDinamicos(
    filtrables: { id: string; nombre: string; tipo: string; opciones: { valor: string }[] }[],
  ): void {
    this.filtrosDinamicos = filtrables.map((f) => ({
      campoId: f.id,
      nombre: f.nombre,
      tipo: f.tipo,
      opciones: (f.opciones ?? []).map((o) => o.valor),
    }));
    for (const f of this.filtrosDinamicos) {
      if (!(f.campoId in this.valoresFiltros)) this.valoresFiltros[f.campoId] = '';
    }
  }

  buscar(): void {
    clearTimeout(this.busquedaTimer);
    this.page = 1;
    this.cargar();
  }

  limpiarFiltros(): void {
    this.q = '';
    this.filtroEstado = '';
    this.filtroCalendario.clear();
    this.filtroTipo.clear();
    this.filtroAsesor.clear();
    this.orden = 'nombre';
    this.valoresFiltros = {};
    this.page = 1;
    this.cargar();
  }

  get hayFiltros(): boolean {
    return !!(this.q || this.filtroEstado || this.filtroCalendario.size > 0 ||
      this.filtroTipo.size > 0 || this.filtroAsesor.size > 0 ||
      Object.values(this.valoresFiltros).some((v) => !!v));
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter((p) => p.length > 1 && /^[a-záéíóúñü]/i.test(p))
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || nombre.substring(0, 2).toUpperCase();
  }

  /* ── Export ── */
  exportarTodo(): void {
    this.exportando = true;
    this.cdr.detectChanges();
    this.piService.exportar()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'instituciones.xlsx';
          a.click();
          URL.revokeObjectURL(url);
          this.exportando = false;
          this.notification.success('Exportación', 'Archivo descargado correctamente');
          this.cdr.detectChanges();
        },
        error: () => {
          this.exportando = false;
          this.notification.error('Error', 'No se pudo exportar');
          this.cdr.detectChanges();
        },
      });
  }

  /* ── Import ── */
  abrirModalImportar(): void {
    this.mostrarModalImportar = true;
    this.archivoImportar = null;
    this.resultadoImportar = null;
  }

  cerrarModalImportar(): void {
    this.mostrarModalImportar = false;
    this.archivoImportar = null;
    this.resultadoImportar = null;
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivoImportar = input.files?.[0] ?? null;
    this.resultadoImportar = null;
  }

  ejecutarImportar(): void {
    if (!this.archivoImportar) return;
    this.importando = true;
    this.cdr.detectChanges();
    this.piService.importar(this.archivoImportar)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.importando = false;
          this.resultadoImportar = res;
          this.notification.success('Importación', `${res.total} instituciones procesadas: ${res.created} creadas, ${res.updated} actualizadas`);
          this.cargar(true);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.importando = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudo importar');
          this.cdr.detectChanges();
        },
      });
  }
}
