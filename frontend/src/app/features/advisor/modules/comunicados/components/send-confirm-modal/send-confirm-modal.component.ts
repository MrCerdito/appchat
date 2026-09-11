import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Destinatario } from '../../../../../../core/models/comunicado.model';

export interface SendProgressInfo {
  total: number;
  procesados: number;
  restantes: number;
  pct: number;
}

export interface SmtpCuotaInfo {
  configurado: boolean;
  proveedor: string;
  limiteDia: number;
  enviadosHoy: number;
  restante: number;
}

@Component({
  selector: 'app-send-confirm-modal',
  standalone: true,
  imports: [],
  templateUrl: './send-confirm-modal.html',
  styleUrl: './send-confirm-modal.scss',
})
export class SendConfirmModalComponent {
  @Input() asunto = '';
  @Input() destinatarios: Destinatario[] = [];
  @Input() saving = false;
  @Input() smtpCuota: SmtpCuotaInfo | null = null;
  @Input() superaLote = false;
  @Input() sendProgreso: SendProgressInfo | null = null;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  get quotaPct(): number {
    const q = this.smtpCuota;
    if (!q?.configurado || q.limiteDia <= 0) return 0;
    return Math.min(100, Math.round((q.enviadosHoy / q.limiteDia) * 100));
  }
}