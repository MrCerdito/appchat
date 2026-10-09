import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import {
  PerfilInstitucionalService,
  PiInstitucionCard,
  PiImportAviso,
  PiImportEstado,
  PiImportResp,
  PiImportResumen,
} from '../../../../core/services/perfil-institucional.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { PI_ICONS } from './pi-icons';

interface FiltroDinamico {
  campoId: string;
  nombre: string;
  tipo: string;
  opciones: string[];
}

@Component({
  selector: 'app-perfil-institucional',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './perfil-institucional.component.html',
  styleUrl: './perfil-institucional.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilInstitucionalComponent implements OnInit, OnDestroy {
  readonly icons = PI_ICONS;

  @HostBinding('class.theme-dark') protected themeDark = false;

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
  filtrosHabilitados: Record<string, boolean> = {};
  mostrarFiltrosDinamicos = false;

  mostrarFiltros = false;
  mostrarDropdownAsesor = false;
  busquedaAsesor = '';
  menuActivoId: string | null = null;
  exportandoFormato: string = '';
  mostrarModalExportar = false;
  arrastrandoArchivo = false;
  erroresVisibles = 15;
  pasoImportar: 'subir' | 'vista-previa' | 'resultado' = 'subir';
  tabImport: 'resumen' | 'cambios' | 'avisos' | 'columnas' = 'resumen';
  vistaPrevia: PiImportResp | null = null;
  previsualizando = false;

  limitePorPagina = 20;
  page = 1;
  pages = 1;
  total = 0;

  exportando = false;
  importando = false;
  mostrarModalImportar = false;
  archivoImportar: File | null = null;
  resultadoImportar: PiImportResp | null = null;

  private busquedaTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private piService: PerfilInstitucionalService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private auth: AuthService,
    private themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    this.themeDark = this.themeService.currentTheme === 'dark';
    this.themeService.currentTheme$.pipe(takeUntil(this.destroy$)).subscribe((t) => {
      this.themeDark = t === 'dark';
      this.cdr.markForCheck();
    });

    const user = this.auth.getUser();
    if (user && user.role === 'advisor' && user.name) {
      this.filtroAsesor.add(user.name.trim());
    }
    this.cargar();
  }

  ngOnDestroy(): void {
    clearTimeout(this.busquedaTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ── Context menu ── */
  toggleMenu(id: string): void {
    this.menuActivoId = this.menuActivoId === id ? null : id;
  }

  cerrarMenus(): void {
    this.menuActivoId = null;
  }

  /* ── Navigation ── */
  protected get esAdmin(): boolean {
    return this.router.url.startsWith('/admin');
  }

  private get baseRoute(): string {
    return this.router.url.startsWith('/admin') ? '/admin' : '/dashboard';
  }

  verInstitucion(id: string): void {
    this.cerrarMenus();
    this.router.navigate([this.baseRoute, 'perfil-institucional', id]);
  }

  editarInstitucion(id: string): void {
    this.cerrarMenus();
    this.router.navigate([this.baseRoute, 'perfil-institucional', id], { queryParams: { edit: true } });
  }

  /* ── Filter panel toggle ── */
  toggleFiltros(): void {
    this.mostrarFiltros = !this.mostrarFiltros;
  }

  /* ── Search ── */
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
    this.cdr.detectChanges();
  }

  toggleTipo(val: string): void {
    if (this.filtroTipo.has(val)) {
      this.filtroTipo.delete(val);
    } else {
      this.filtroTipo.add(val);
    }
    this.cdr.detectChanges();
  }

  toggleEstado(val: string): void {
    this.filtroEstado = this.filtroEstado === val ? '' : val;
    this.cdr.detectChanges();
  }

  toggleAsesor(nombre: string): void {
    if (this.filtroAsesor.has(nombre)) {
      this.filtroAsesor.delete(nombre);
    } else {
      this.filtroAsesor.add(nombre);
    }
    this.cdr.detectChanges();
  }

  toggleFiltroHabilitado(campoId: string): void {
    this.filtrosHabilitados[campoId] = !this.filtrosHabilitados[campoId];
    if (!this.filtrosHabilitados[campoId]) {
      this.valoresFiltros[campoId] = '';
    }
    this.cdr.detectChanges();
  }

  toggleDropdownAsesor(): void {
    this.mostrarDropdownAsesor = !this.mostrarDropdownAsesor;
  }

  seleccionarAsesor(asesor: string): void {
    this.filtroAsesor.clear();
    if (asesor) {
      this.filtroAsesor.add(asesor);
    }
    this.mostrarDropdownAsesor = false;
    this.busquedaAsesor = '';
    this.cdr.detectChanges();
  }

  filtrarAsesores(): string[] {
    if (!this.busquedaAsesor) return this.asesoresDisponibles;
    const term = this.busquedaAsesor.toLowerCase().trim();
    return this.asesoresDisponibles.filter(a => a.toLowerCase().includes(term));
  }

  contarFiltrosSeleccionados(): number {
    let count = 0;
    count += this.filtroCalendario.size;
    count += this.filtroTipo.size;
    if (this.filtroEstado) count += 1;
    count += this.filtroAsesor.size;
    for (const f of this.filtrosDinamicos) {
      if (this.filtrosHabilitados[f.campoId] && this.valoresFiltros[f.campoId]) {
        count++;
      }
    }
    return count;
  }

  aplicarFiltros(): void {
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

  /* ── Data loading ── */
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
      if (this.filtrosHabilitados[f.campoId]) {
        const v = this.valoresFiltros[f.campoId];
        if (v) params[`f_${f.campoId}`] = v;
      }
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

  sincronizarFiltrosDinamicos(
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
      if (!(f.campoId in this.filtrosHabilitados)) this.filtrosHabilitados[f.campoId] = false;
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
    this.filtrosHabilitados = {};
    this.mostrarDropdownAsesor = false;
    this.busquedaAsesor = '';
    this.page = 1;
    this.cargar();
  }

  get hayFiltros(): boolean {
    const tieneFiltrosDinamicos = this.filtrosDinamicos.some(
      (f) => this.filtrosHabilitados[f.campoId] && !!this.valoresFiltros[f.campoId]
    );
    return !!(this.q || this.filtroEstado || this.filtroCalendario.size > 0 ||
      this.filtroTipo.size > 0 || this.filtroAsesor.size > 0 || tieneFiltrosDinamicos);
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

  exportarCsv(): void {
    this.exportando = true;
    this.cdr.detectChanges();
    this.piService.exportarCsv()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (csv) => {
          this.exportando = false;
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'instituciones.csv';
          a.click();
          URL.revokeObjectURL(url);
          this.notification.success('Exportación', 'Archivo CSV descargado correctamente');
          this.cdr.detectChanges();
        },
        error: () => {
          this.exportando = false;
          this.notification.error('Error', 'No se pudo exportar en CSV');
          this.cdr.detectChanges();
        },
      });
  }

  /* ── Import: subir → previsualizar → confirmar ── */
  abrirModalImportar(): void {
    this.mostrarModalImportar = true;
    this.pasoImportar = 'subir';
    this.archivoImportar = null;
    this.vistaPrevia = null;
    this.resultadoImportar = null;
    this.arrastrandoArchivo = false;
    this.tabImport = 'resumen';
    this.erroresVisibles = 15;
  }

  cerrarModalImportar(): void {
    this.mostrarModalImportar = false;
    this.pasoImportar = 'subir';
    this.archivoImportar = null;
    this.vistaPrevia = null;
    this.resultadoImportar = null;
    this.importando = false;
    this.previsualizando = false;
    this.arrastrandoArchivo = false;
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.tomarArchivo(input.files?.[0] ?? null);
    input.value = '';
  }

  private tomarArchivo(file: File | null): void {
    this.archivoImportar = file;
    this.vistaPrevia = null;
    this.resultadoImportar = null;
    this.pasoImportar = 'subir';
    this.erroresVisibles = 15;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoArchivo = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoArchivo = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoArchivo = false;
    this.tomarArchivo(event.dataTransfer?.files?.[0] ?? null);
  }

  previsualizar(): void {
    if (!this.archivoImportar || this.previsualizando) return;
    this.previsualizando = true;
    this.cdr.detectChanges();
    this.piService
      .importar(this.archivoImportar, { preview: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.previsualizando = false;
          this.vistaPrevia = res;
          this.pasoImportar = 'vista-previa';
          this.tabImport = 'resumen';
          this.erroresVisibles = 15;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.previsualizando = false;
          this.notification.error(
            'Error',
            err?.error?.message ?? 'No se pudo leer el archivo',
          );
          this.cdr.detectChanges();
        },
      });
  }

  confirmarImportar(): void {
    if (!this.archivoImportar || this.importando) return;
    this.importando = true;
    this.cdr.detectChanges();
    this.piService
      .importar(this.archivoImportar)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.importando = false;
          this.resultadoImportar = res;
          this.pasoImportar = 'resultado';
          this.tabImport = 'resumen';
          this.erroresVisibles = 15;
          const r = res.resumen;
          this.notification.success(
            'Importación completada',
            `${r.creadas} creadas · ${r.actualizadas} actualizadas · ${r.sinCambios} sin cambios` +
              (r.duplicadas ? ` · ${r.duplicadas} duplicadas` : ''),
          );
          this.cargar(true);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.importando = false;
          this.notification.error(
            'Error',
            err?.error?.message ?? 'No se pudo importar',
          );
          this.cdr.detectChanges();
        },
      });
  }

  cambiarArchivo(): void {
    this.pasoImportar = 'subir';
    this.vistaPrevia = null;
    this.resultadoImportar = null;
    this.archivoImportar = null;
    this.erroresVisibles = 15;
  }

  /* ── Helpers del reporte ── */
  reporte(): PiImportResp | null {
    return this.pasoImportar === 'resultado'
      ? this.resultadoImportar
      : this.vistaPrevia;
  }

  resumenReporte(): PiImportResumen {
    return (
      this.reporte()?.resumen ?? {
        filasArchivo: 0,
        creadas: 0,
        actualizadas: 0,
        sinCambios: 0,
        duplicadas: 0,
        conAvisos: 0,
        columnasIgnoradas: 0,
      }
    );
  }

  estadoFilaLabel(estado: PiImportEstado): string {
    switch (estado) {
      case 'crear':
        return 'Creada';
      case 'actualizar':
        return 'Actualizada';
      case 'sin-cambios':
        return 'Sin cambios';
      case 'duplicada':
        return 'Duplicada';
    }
  }

  cambiosAplanados(): {
    fila: number;
    nombre: string;
    campo: string;
    anterior: string | null;
    nuevo: string | null;
  }[] {
    return (this.reporte()?.filas ?? []).flatMap((f) =>
      f.cambios.map((c) => ({ fila: f.fila, nombre: f.nombre, ...c })),
    );
  }

  avisosPagina(): PiImportAviso[] {
    return (this.reporte()?.avisos ?? []).slice(0, this.erroresVisibles);
  }

  masErrores(): void {
    this.erroresVisibles += 50;
    this.cdr.detectChanges();
  }

  descargarExcelReporte(): void {
    if (!this.resultadoImportar?.logExcelBase64) return;
    const base64 = this.resultadoImportar.logExcelBase64;
    const binStr = window.atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_cambios_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
