import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  PerfilInstitucionalService,
  PiCampo,
  PiCategoria,
} from '../../../../core/services/perfil-institucional.service';
import { NotificationService } from '../../../../core/services/notification.service';

const TIPOS_LABEL: Record<string, string> = {
  texto: 'Texto',
  texto_largo: 'Texto largo',
  numero: 'Número',
  fecha: 'Fecha',
  booleano: 'Sí / No',
  lista: 'Lista',
  email: 'Correo',
  email_lista: 'Lista de correos',
  telefono: 'Teléfono',
  url: 'URL',
  archivo: 'Archivo',
  moneda: 'Moneda',
  porcentaje: 'Porcentaje',
};

@Component({
  selector: 'app-gestionar-campos',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './gestionar-campos.component.html',
  styleUrl: './gestionar-campos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GestionarCamposComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  campos: PiCampo[] = [];
  categorias: PiCategoria[] = [];
  loading = true;
  guardando = false;

  q = '';
  filtroTipo = '';
  filtroCategoria = '';

  mostrarModalCampo = false;
  campoEditando: PiCampo | null = null;
  form = this.formVacio();

  mostrarPanelCategorias = false;

  constructor(
    private piService: PerfilInstitucionalService,
    private notification: NotificationService,
    private location: Location,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargar(): void {
    this.loading = true;
    this.piService.listarCampos()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (campos) => {
          this.campos = [...campos].sort(
            (a, b) =>
              (a.categoria?.orden ?? 99) - (b.categoria?.orden ?? 99) ||
              a.orden - b.orden ||
              a.nombre.localeCompare(b.nombre),
          );
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.notification.error('Error', 'No se pudieron cargar los campos');
          this.cdr.detectChanges();
        },
      });

    this.piService.listarCategorias()
      .pipe(takeUntil(this.destroy$))
      .subscribe((cats) => {
        this.categorias = [...cats].sort((a, b) => a.orden - b.orden);
        this.cdr.detectChanges();
      });
  }

  get filtrados(): PiCampo[] {
    const q = this.q.trim().toLowerCase();
    return this.campos.filter((c) => {
      if (this.filtroTipo && c.tipo !== this.filtroTipo) return false;
      if (this.filtroCategoria && c.categoriaId !== this.filtroCategoria) return false;
      if (q && !c.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  tipoLabel(tipo: string): string {
    return TIPOS_LABEL[tipo] ?? tipo;
  }

  tipos(): string[] {
    return Object.keys(TIPOS_LABEL);
  }

  volver(): void {
    this.location.back();
  }

  /* ---------- Modal campo ---------- */
  private formVacio() {
    return {
      nombre: '',
      categoriaId: '',
      tipo: 'texto',
      opciones: [] as string[],
      requerido: false,
    };
  }

  abrirNuevo(): void {
    this.campoEditando = null;
    this.form = this.formVacio();
    if (this.categorias.length > 0) this.form.categoriaId = this.categorias[0].id;
    this.mostrarModalCampo = true;
    this.cdr.detectChanges();
  }

  abrirEditar(campo: PiCampo): void {
    this.campoEditando = campo;
    this.form = {
      nombre: campo.nombre,
      categoriaId: campo.categoriaId,
      tipo: campo.tipo,
      opciones: (campo.opciones ?? []).slice().sort((a, b) => a.orden - b.orden).map((o) => o.valor),
      requerido: campo.requerido,
    };
    this.mostrarModalCampo = true;
    this.cdr.detectChanges();
  }

  agregarOpcion(): void {
    this.form.opciones.push('');
  }

  quitarOpcion(i: number): void {
    this.form.opciones.splice(i, 1);
  }

  subirOpcion(i: number): void {
    if (i <= 0) return;
    [this.form.opciones[i - 1], this.form.opciones[i]] = [this.form.opciones[i], this.form.opciones[i - 1]];
  }

  guardarCampo(): void {
    const nombre = this.form.nombre.trim();
    if (!nombre || !this.form.categoriaId) {
      this.notification.error('Datos incompletos', 'Nombre y categoría son obligatorios');
      return;
    }
    if (this.form.tipo === 'lista') {
      const ops = this.form.opciones.map((v) => v.trim()).filter(Boolean);
      if (ops.length === 0) {
        this.notification.error('Datos incompletos', 'Agrega al menos una opción para el tipo Lista');
        return;
      }
    }

    const dto = {
      nombre,
      categoriaId: this.form.categoriaId,
      tipo: this.form.tipo,
      opciones:
        this.form.tipo === 'lista'
          ? this.form.opciones.map((v) => v.trim()).filter(Boolean).map((valor, orden) => ({ valor, orden }))
          : undefined,
      requerido: this.form.requerido,
      mostrarListado: false,
      mostrarPerfil: true,
      buscar: false,
      filtrable: false,
      activo: true,
    };

    this.guardando = true;
    const req = this.campoEditando
      ? this.piService.actualizarCampo(this.campoEditando.id, dto)
      : this.piService.crearCampo(dto);

    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.guardando = false;
        this.mostrarModalCampo = false;
        this.notification.success(this.campoEditando ? 'Campo actualizado' : 'Campo creado', nombre);
        this.cargar();
      },
      error: (err: any) => {
        this.guardando = false;
        this.notification.error('Error', err?.error?.message ?? 'No se pudo guardar el campo');
        this.cdr.detectChanges();
      },
    });
  }

  duplicar(campo: PiCampo): void {
    this.piService.duplicarCampo(campo.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Campo duplicado', campo.nombre);
          this.cargar();
        },
        error: () => this.notification.error('Error', 'No se pudo duplicar el campo'),
      });
  }

  alternarActivo(campo: PiCampo): void {
    this.piService.actualizarCampo(campo.id, { activo: !campo.activo })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.cargar(),
        error: () => this.notification.error('Error', 'No se pudo cambiar el estado'),
      });
  }

  eliminar(campo: PiCampo): void {
    if (!confirm(`¿Eliminar el campo "${campo.nombre}"? Se borrará también su información guardada en todas las instituciones.`)) {
      return;
    }
    this.piService.eliminarCampo(campo.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Campo eliminado', campo.nombre);
          this.cargar();
        },
        error: (err: any) =>
          this.notification.error('Error', err?.error?.message ?? 'No se pudo eliminar el campo'),
      });
  }

  /* ---------- Categorías ---------- */
  toggleCategorias(): void {
    this.mostrarPanelCategorias = !this.mostrarPanelCategorias;
    this.cdr.detectChanges();
  }

  crearCategoria(input: HTMLInputElement): void {
    const nombre = input.value.trim();
    if (!nombre) return;
    input.value = '';
    this.piService.crearCategoria(nombre)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Categoría creada', nombre);
          this.piService.listarCategorias().subscribe((cats) => {
            this.categorias = [...cats].sort((a, b) => a.orden - b.orden);
            this.cdr.detectChanges();
          });
        },
        error: (err: any) =>
          this.notification.error('Error', err?.error?.message ?? 'No se pudo crear la categoría'),
      });
  }

  renombrarCategoria(cat: PiCategoria, input: HTMLInputElement): void {
    const nombre = input.value.trim();
    if (!nombre || nombre === cat.nombre) return;
    this.piService.actualizarCategoria(cat.id, { nombre })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          cat.nombre = nombre;
          this.notification.success('Categoría renombrada', nombre);
          this.cdr.detectChanges();
        },
        error: () => this.notification.error('Error', 'No se pudo renombrar'),
      });
  }

  alternarCategoria(cat: PiCategoria): void {
    this.piService.actualizarCategoria(cat.id, { activa: !cat.activa })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          cat.activa = !cat.activa;
          this.cdr.detectChanges();
        },
        error: () => this.notification.error('Error', 'No se pudo cambiar el estado'),
      });
  }

  eliminarCategoria(cat: PiCategoria): void {
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"? Solo es posible si no tiene campos.`)) return;
    this.piService.eliminarCategoria(cat.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Categoría eliminada', cat.nombre);
          this.categorias = this.categorias.filter((c) => c.id !== cat.id);
          this.cdr.detectChanges();
        },
        error: (err: any) =>
          this.notification.error('Error', err?.error?.message ?? 'No se pudo eliminar la categoría'),
      });
  }

  onDropCategoria(event: CdkDragDrop<PiCategoria[]>): void {
    moveItemInArray(this.categorias, event.previousIndex, event.currentIndex);
    const items = this.categorias.map((c, i) => ({ id: c.id, orden: i }));
    this.piService.reordenarCategorias(items)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Orden actualizado', '');
          this.cdr.detectChanges();
        },
        error: () => {
          this.notification.error('Error', 'No se pudo guardar el orden');
          this.cargar();
        },
      });
  }
}
