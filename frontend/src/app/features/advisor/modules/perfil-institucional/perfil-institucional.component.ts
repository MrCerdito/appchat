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
import { SessionService } from '../../../../core/services/session.service';

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
  loading = true;
  q = '';
  filtroEstado = '';
  filtroCalendario = '';
  filtroTipo = '';
  orden = 'nombre';
  filtrosDinamicos: FiltroDinamico[] = [];
  valoresFiltros: Record<string, string> = {};

  readonly limitePorPagina = 15;
  page = 1;
  pages = 1;
  total = 0;

  mostrarModalNueva = false;
  guardandoNueva = false;
  nuevaForm = { nombre: '', link: '', email: '', calendario: '', tipoColegio: '' };

  private busquedaTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private piService: PerfilInstitucionalService,
    private sessionService: SessionService,
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
      calendario: this.filtroCalendario || undefined,
      tipo: this.filtroTipo || undefined,
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
    this.filtroCalendario = '';
    this.filtroTipo = '';
    this.orden = 'nombre';
    this.valoresFiltros = {};
    this.page = 1;
    this.cargar();
  }

  get hayFiltros(): boolean {
    return !!(this.q || this.filtroEstado || this.filtroCalendario ||
      this.filtroTipo || Object.values(this.valoresFiltros).some((v) => !!v));
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter((p) => p.length > 1 && /^[a-záéíóúñü]/i.test(p))
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || nombre.substring(0, 2).toUpperCase();
  }

  abrirModalNueva(): void {
    this.nuevaForm = { nombre: '', link: '', email: '', calendario: '', tipoColegio: '' };
    this.mostrarModalNueva = true;
    this.cdr.detectChanges();
  }

  crearNueva(): void {
    if (!this.nuevaForm.nombre.trim() || !this.nuevaForm.link.trim()) return;
    this.guardandoNueva = true;
    this.sessionService.createColegio({
      nombre: this.nuevaForm.nombre.trim(),
      link: this.nuevaForm.link.trim(),
      email: this.nuevaForm.email.trim() || undefined,
      calendario: this.nuevaForm.calendario,
      tipoColegio: this.nuevaForm.tipoColegio,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardandoNueva = false;
          this.mostrarModalNueva = false;
          this.notification.success('Institución creada', this.nuevaForm.nombre);
          this.cargar();
        },
        error: (err: any) => {
          this.guardandoNueva = false;
          this.notification.error('Error', err?.error?.message ?? 'No se pudo crear la institución');
          this.cdr.detectChanges();
        },
      });
  }
}
