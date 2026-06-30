import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FaqService, Faq } from '../../../core/services/faq.service';
import { trackByIndex } from '../../../shared/utils/track-by';
import { formatFaqText } from '../../../shared/utils/faq-format';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
})
export class FaqComponent implements OnInit {
  protected readonly trackByIndex = trackByIndex;

  @Output() iniciarChat = new EventEmitter<void>();

  faqs: Faq[] = [];
  categorias: string[] = [];
  filtroTexto = '';
  categoriaActiva = '';
  faqExpandida: number | null = null;
  cargando = true;

  constructor(
    private faqService: FaqService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.faqService.getAll().subscribe(faqs => {
      this.faqs = faqs.filter(f => f.activo);
      this.cargando = false;
      this.cdr.detectChanges();
    });
    this.faqService.getCategorias().subscribe(cats => {
      this.categorias = cats;
      this.cdr.detectChanges();
    });
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
