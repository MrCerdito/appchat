import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Pencil, Trash2, Send, Megaphone, Eye, BarChart3 } from 'lucide-angular';
import { MailEditorComponent } from '../configuracion/components/mail-editor/mail-editor.component';
import {
  ChangelogService,
  Changelog,
  ChangelogCategoria,
} from '../../../../core/services/changelog.service';
import { NotificationService } from '../../../../core/services/notification.service';

interface ChangelogCategoriaLabel {
  label: string;
  color: string;
}

@Component({
  selector: 'app-changelog-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MailEditorComponent],
  templateUrl: './changelog-admin.component.html',
  styleUrl: './changelog-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogAdminComponent implements OnInit {
  readonly icons = { Plus, Pencil, Trash2, Send, Megaphone, Eye, BarChart3 };

  list: Changelog[] = [];
  loading = false;
  saving = false;
  deleting = false;
  showForm = false;
  editingId: string | null = null;

  form = {
    titulo: '',
    categoria: 'mejora' as ChangelogCategoria,
    version: '',
    fechaPublicacion: '',
    cuerpo: '',
    design: null as unknown[] | null,
  };

  filter: 'todos' | 'publicados' | 'borradores' = 'todos';

  constructor(
    private readonly service: ChangelogService,
    private readonly notify: NotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get filtered(): Changelog[] {
    if (this.filter === 'publicados') return this.list.filter((c) => c.publicado);
    if (this.filter === 'borradores') return this.list.filter((c) => !c.publicado);
    return this.list;
  }

  get publicadosCount(): number {
    return this.list.filter((c) => c.publicado).length;
  }

  get borradoresCount(): number {
    return this.list.filter((c) => !c.publicado).length;
  }

  categoriaMeta(cat: string): ChangelogCategoriaLabel {
    const map: Record<string, ChangelogCategoriaLabel> = {
      nuevo: { label: 'Novedad', color: '#2563eb' },
      mejora: { label: 'Mejora', color: '#059669' },
      correccion: { label: 'Corrección', color: '#d97706' },
    };
    return map[cat] || { label: 'Mejora', color: '#059669' };
  }

  formatFecha(iso?: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    const bogota = new Date(d.getTime() - 5 * 3600000);
    const dd = String(bogota.getUTCDate()).padStart(2, '0');
    const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = bogota.getUTCFullYear();
    const hh = String(bogota.getUTCHours()).padStart(2, '0');
    const mi = String(bogota.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  estado(item: Changelog): { label: string; cls: string } {
    if (!item.publicado) return { label: 'Borrador', cls: 'draft' };
    if (item.publicadoEl && new Date(item.publicadoEl).getTime() > Date.now()) {
      return { label: 'Programado', cls: 'scheduled' };
    }
    return { label: 'Publicado', cls: 'published' };
  }

  metaFecha(item: Changelog): string {
    const est = this.estado(item);
    if (est.label === 'Borrador') return `Creado ${this.formatFecha(item.createdAt)}`;
    if (est.label === 'Programado') return `Publicará ${this.formatFecha(item.publicadoEl)}`;
    return `Publicado ${this.formatFecha(item.publicadoEl)}`;
  }

  get publishBtnLabel(): string {
    if (!this.form.fechaPublicacion) return 'Publicar ahora';
    const fecha = new Date(this.form.fechaPublicacion).getTime();
    return fecha > Date.now() ? 'Programar publicación' : 'Publicar novedad';
  }

  get nowDatetimeLocal(): string {
    return this.toDateTimeLocal(new Date());
  }

  private toDateTimeLocal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  cargar(): void {
    this.loading = true;
    this.service.listarAdmin().subscribe({
      next: (list) => {
        this.list = list;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.notify.error('Error', 'No se pudo cargar el historial de novedades.');
        this.cdr.markForCheck();
      },
    });
  }

  nueva(): void {
    this.editingId = null;
    this.form = {
      titulo: '',
      categoria: 'mejora',
      version: '',
      fechaPublicacion: this.toDateTimeLocal(new Date()),
      cuerpo: '',
      design: null,
    };
    this.showForm = true;
  }

  editar(item: Changelog): void {
    this.editingId = item.id;
    this.form = {
      titulo: item.titulo,
      categoria: item.categoria,
      version: item.version ?? '',
      fechaPublicacion: item.publicadoEl ? this.toDateTimeLocal(new Date(item.publicadoEl)) : this.toDateTimeLocal(new Date()),
      cuerpo: item.cuerpo,
      design: item.design,
    };
    this.showForm = true;
  }

  cancelar(): void {
    this.showForm = false;
    this.editingId = null;
  }

  onCuerpo(v: string): void {
    this.form.cuerpo = v;
  }

  onDesign(v: unknown[] | null): void {
    this.form.design = v;
  }

  guardar(publicar: boolean): void {
    if (!this.form.titulo.trim()) {
      this.notify.error('Título obligatorio', 'Escribe un título para la novedad.');
      return;
    }
    if (!this.form.cuerpo.trim()) {
      this.notify.error('Contenido vacío', 'Agrega bloques de contenido antes de guardar.');
      return;
    }
    if (publicar && !this.form.fechaPublicacion) {
      this.notify.error('Fecha requerida', 'Selecciona la fecha y hora de publicación.');
      return;
    }

    this.saving = true;
    const dto = {
      titulo: this.form.titulo.trim(),
      categoria: this.form.categoria,
      version: this.form.version.trim() || null,
      cuerpo: this.form.cuerpo,
      design: this.form.design,
      publicar,
      publicadoEl: publicar ? new Date(this.form.fechaPublicacion).toISOString() : null,
    };

    const op = this.editingId
      ? this.service.editar(this.editingId, dto)
      : this.service.crear(dto);

    op.subscribe({
      next: (saved) => {
        this.saving = false;
        this.notify.success(
          publicar ? 'Novedad publicada' : 'Borrador guardado',
          `«${saved.titulo}» se guardó correctamente.`,
        );
        this.showForm = false;
        this.editingId = null;
        this.cargar();
      },
      error: () => {
        this.saving = false;
        this.notify.error('Error al guardar', 'Verifica los campos e intenta de nuevo.');
        this.cdr.markForCheck();
      },
    });
  }

  eliminar(item: Changelog): void {
    if (!confirm(`¿Eliminar la novedad «${item.titulo}»? Esta acción no se puede deshacer.`)) return;
    this.deleting = true;
    this.service.eliminar(item.id).subscribe({
      next: () => {
        this.deleting = false;
        this.notify.info('Novedad eliminada', item.titulo);
        if (this.editingId === item.id) {
          this.showForm = false;
          this.editingId = null;
        }
        this.cargar();
      },
      error: () => {
        this.deleting = false;
        this.notify.error('Error', 'No se pudo eliminar la novedad.');
        this.cdr.markForCheck();
      },
    });
  }
}