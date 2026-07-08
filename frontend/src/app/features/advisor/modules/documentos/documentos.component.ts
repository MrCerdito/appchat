import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentosService, DocumentoItem } from '../../../../core/services/documentos.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

@Component({
  selector   : 'app-documentos',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './documentos.component.html',
  styleUrl   : './documentos.component.scss',
})
export class DocumentosComponent implements OnInit {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  documentos   : DocumentoItem[] = [];
  loading      = true;
  uploading    = false;
  showForm     = false;
  editMode     = false;
  submitted    = false;
  uploadResult : { ok: boolean; chunks: number; nombre: string } | null = null;
  uploadError  = '';

  archivoSeleccionado: File | null = null;
  archivoNombre       = '';

  form = {
    nombre         : '',
    descripcion    : '',
    categoria      : 'general',
    colegio        : '',
    rolesPermitidos: ['admin', 'docente', 'estudiante', 'padre'] as string[],
  };

  // Documento en edición
  docEnEdicion: DocumentoItem | null = null;
  docAEliminar: DocumentoItem | null = null;

  // Test RAG
  testQuery    = '';
  testResultado: any = null;
  testCargando = false;

  readonly categorias = [
    { value: 'general',    label: 'General' },
    { value: 'matricula',  label: 'Matrícula' },
    { value: 'pagos',      label: 'Pagos' },
    { value: 'soporte',    label: 'Soporte técnico' },
    { value: 'reglamento', label: 'Reglamento' },
    { value: 'academico',  label: 'Académico' },
  ];

  readonly rolesDisponibles = [
    { value: 'admin',      label: 'Administrador' },
    { value: 'docente',    label: 'Docente' },
    { value: 'estudiante', label: 'Estudiante' },
    { value: 'padre',      label: 'Padre/Madre' },
  ];

  constructor(
    private docService: DocumentosService,
    private notification: NotificationService,
    private cdr       : ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.cargarDocumentos(); }

  cargarDocumentos(): void {
    this.loading = true;
    this.docService.listar().subscribe({
      next : (docs) => { this.documentos = docs; this.loading = false; this.cdr.detectChanges(); },
      error: ()     => { this.loading = false; this.notification.error('Error', 'No se pudieron cargar los documentos.'); this.cdr.detectChanges(); },
    });
  }

  // ── Archivo ───────────────────────────────────────────────────────────────
  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.archivoSeleccionado = input.files[0];
      this.archivoNombre       = input.files[0].name;
      if (!this.form.nombre) {
        this.form.nombre = input.files[0].name.replace('.pdf', '');
      }
    }
  }

  // ── Subir nuevo ───────────────────────────────────────────────────────────
  subirDocumento(): void {
    this.submitted   = true;
    this.uploadError = '';
    if (!this.form.nombre.trim() || !this.archivoSeleccionado) return;

    const formData = new FormData();
    formData.append('file',            this.archivoSeleccionado);
    formData.append('nombre',          this.form.nombre.trim());
    formData.append('descripcion',     this.form.descripcion.trim());
    formData.append('categoria',       this.form.categoria);
    formData.append('rolesPermitidos', this.form.rolesPermitidos.join(','));
    if (this.form.colegio.trim()) formData.append('colegio', this.form.colegio.trim());

    this.uploading = true;
    this.docService.subir(formData).subscribe({
      next: (res) => {
        this.uploading    = false;
        this.uploadResult = res;
        this.showForm     = false;
        this.resetForm();
        this.cargarDocumentos();
        this.notification.success('Documento subido', `${res.nombre} se subió correctamente.`);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.uploading   = false;
        this.uploadError = err.error?.message ?? 'Error al subir el documento';
        this.notification.error('Error al subir', this.uploadError);
        this.cdr.detectChanges();
      },
    });
  }

  // ── Editar ────────────────────────────────────────────────────────────────
  abrirEdicion(doc: DocumentoItem): void {
    this.docEnEdicion = doc;
    this.editMode     = true;
    this.showForm     = true;
    this.uploadError  = '';

    // roles_permitidos viene como string "admin,docente" — parsear a array
    const roles = typeof doc.roles_permitidos === 'string' && doc.roles_permitidos
      ? doc.roles_permitidos.split(',').map((r: string) => r.trim()).filter(Boolean)
      : ['admin', 'docente', 'estudiante', 'padre'];

    this.form = {
      nombre         : doc.nombre,
      descripcion    : doc.descripcion ?? '',
      categoria      : doc.categoria ?? 'general',
      colegio        : doc.colegio ?? '',
      rolesPermitidos: roles,
    };
    this.cdr.detectChanges();
  }

  guardarEdicion(): void {
    if (!this.docEnEdicion) return;
    this.uploading = true;

    this.docService.actualizarRoles(
      this.docEnEdicion.nombre,
      {
        descripcion    : this.form.descripcion.trim(),
        categoria      : this.form.categoria,
        colegio        : this.form.colegio.trim() || null,
        rolesPermitidos: this.form.rolesPermitidos.join(','),
      }
    ).subscribe({
      next: () => {
        this.uploading = false;
        this.showForm  = false;
        this.editMode  = false;
        this.resetForm();
        this.cargarDocumentos();
        this.notification.success('Cambios guardados', 'El documento se actualizó correctamente.');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.uploading   = false;
        this.uploadError = err.error?.message ?? 'Error al guardar cambios';
        this.notification.error('Error al guardar', this.uploadError);
        this.cdr.detectChanges();
      },
    });
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────
  confirmarEliminar(doc: DocumentoItem): void { this.docAEliminar = doc; }

  eliminar(): void {
    if (!this.docAEliminar) return;
    const nombre = this.docAEliminar.nombre;
    this.docAEliminar = null;
    this.docService.eliminar(nombre).subscribe({
      next: () => { this.documentos = this.documentos.filter(d => d.nombre !== nombre); this.notification.success('Documento eliminado', ''); this.cdr.detectChanges(); },
    });
  }

  // ── Roles ─────────────────────────────────────────────────────────────────
  toggleRol(rol: string): void {
    const idx = this.form.rolesPermitidos.indexOf(rol);
    if (idx === -1) this.form.rolesPermitidos.push(rol);
    else this.form.rolesPermitidos.splice(idx, 1);
  }

  tieneRol(rol: string): boolean { return this.form.rolesPermitidos.includes(rol); }

  getRolesArray(roles: string | null): string[] {
    if (!roles || (typeof roles === 'string' && !roles.trim())) {
      return ['admin', 'docente', 'estudiante', 'padre'];
    }
    if (typeof roles === 'string') {
      return roles.split(',').map((r: string) => r.trim()).filter(Boolean);
    }
    return ['admin', 'docente', 'estudiante', 'padre'];
  }

  getRolLabel(value: string): string {
    return this.rolesDisponibles.find(r => r.value === value)?.label ?? value;
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  abrirPdf(url: string): void { window.open(url, '_blank'); }

  // ── Test RAG ──────────────────────────────────────────────────────────────
  testBusqueda(): void {
    if (!this.testQuery.trim()) return;
    this.testCargando  = true;
    this.testResultado = null;
    this.docService.buscar(this.testQuery).subscribe({
      next : (res) => { this.testResultado = res; this.testCargando = false; this.cdr.detectChanges(); },
      error: ()    => { this.testCargando = false; this.cdr.detectChanges(); },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getCategoriaLabel(value: string): string {
    return this.categorias.find(c => c.value === value)?.label ?? value;
  }

  resetForm(): void {
    this.form = { nombre: '', descripcion: '', categoria: 'general', colegio: '', rolesPermitidos: ['admin','docente','estudiante','padre'] };
    this.archivoSeleccionado = null;
    this.archivoNombre       = '';
    this.submitted           = false;
    this.uploadError         = '';
    this.editMode            = false;
    this.docEnEdicion        = null;
  }
}