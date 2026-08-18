import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Destinatario } from '../../../../../../core/models/comunicado.model';

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
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
