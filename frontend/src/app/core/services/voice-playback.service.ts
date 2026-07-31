import { Injectable } from '@angular/core';

export interface VoicePausable {
  pause(): void;
}

@Injectable({ providedIn: 'root' })
export class VoicePlaybackService {
  private active: VoicePausable | null = null;

  play(player: VoicePausable): void {
    if (this.active && this.active !== player) {
      this.active.pause();
    }
    this.active = player;
  }

  release(player: VoicePausable): void {
    if (this.active === player) {
      this.active = null;
    }
  }
}
