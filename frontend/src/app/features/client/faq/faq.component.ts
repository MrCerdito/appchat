import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FaqService, Faq } from '../../../core/services/faq.service';
import { trackByIndex } from '../../../shared/utils/track-by';
import { formatFaqText } from '../../../shared/utils/faq-format';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;

  @Output() iniciarChat = new EventEmitter<void>();

  faqs: Faq[] = [];
  categorias: string[] = [];
  filtroTexto = '';
  categoriaActiva = '';
  faqExpandida: number | null = null;
  cargando = true;

  private destroy$ = new Subject<void>();

  constructor(
    private faqService: FaqService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.faqService.getAll().pipe(takeUntil(this.destroy$)).subscribe({
      next: (faqs) => {
        this.faqs = faqs.filter(f => f.activo);
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
    this.faqService.getCategorias().pipe(takeUntil(this.destroy$)).subscribe({
      next: (cats) => {
        this.categorias = (cats || [])
          .map(c => c?.trim())
          .filter((c): c is string => !!c);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get faqsFiltradas(): Faq[] {
    let lista = this.faqs;
    if (this.categoriaActiva) {
      lista = lista.filter(f => f.categoria === this.categoriaActiva);
    }
    if (this.filtroTexto.trim()) {
      const q = this.filtroTexto.trim().toLowerCase();
      lista = lista.filter(f =>
        f.pregunta.toLowerCase().includes(q) ||
        f.respuesta.toLowerCase().includes(q) ||
        (f.keywords && f.keywords.some(k => k.toLowerCase().includes(q)))
      );
    }
    return lista;
  }

  toggleFaq(id: number): void {
    this.faqExpandida = this.faqExpandida === id ? null : id;
  }

  selectCategoria(cat: string): void {
    this.categoriaActiva = this.categoriaActiva === cat ? '' : cat;
  }

  formatearRespuesta(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(formatFaqText(text));
  }

  irAlChat(): void {
    this.iniciarChat.emit();
  }
}
