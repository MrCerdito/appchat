import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LayoutService } from '../../core/services/layout.service';
import { SocketService } from '../../core/services/socket.service';
import { SoundService } from '../../core/services/sound.service';
import { NotificationService } from '../../core/services/notification.service';
import { User } from '../../core/models/user.model';
import { ToastContainerComponent } from '../../shared/components/toast-container.component';
import { NotificationBellComponent } from '../../shared/components/notification-bell.component';

@Component({
  selector: 'app-developer-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, ToastContainerComponent, NotificationBellComponent],
  templateUrl: './developer-shell.html',
  styleUrl: './developer-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeveloperShellComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  menuOpen = false;
  sidebarOpen = false;
  forceSidebarHidden = false;
  smallScreen = window.matchMedia('(max-width: 1268px)').matches;

  private readonly smallScreenBreakpoint = window.matchMedia('(max-width: 1268px)');
  private destroy$ = new Subject<void>();

  get showHamburger(): boolean {
    return this.smallScreen || this.forceSidebarHidden;
  }

  constructor(
    private auth: AuthService,
    protected themeService: ThemeService,
    private router: Router,
    private layoutService: LayoutService,
    private socket: SocketService,
    private sound: SoundService,
    private notifications: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auth.user$.subscribe({
      next: (user) => {
        this.currentUser = user;
        this.cdr.markForCheck();
      },
    });
    this.socket.connect(this.auth.getToken() ?? undefined);
    this.sound.init();
    this.registerTicketListeners();
    this.layoutService.sidebarForcedCollapsed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(collapsed => {
        this.forceSidebarHidden = collapsed;
        this.cdr.markForCheck();
      });
    this.smallScreenBreakpoint.addEventListener('change', this.onSmallScreenBreakpoint);
  }

  ngOnDestroy(): void {
    this.smallScreenBreakpoint.removeEventListener('change', this.onSmallScreenBreakpoint);
    this.destroy$.next();
    this.destroy$.complete();
    this.socket.disconnect();
  }

  private onSmallScreenBreakpoint = (e: MediaQueryListEvent): void => {
    this.smallScreen = e.matches;
    if (!this.smallScreen) this.sidebarOpen = false;
    this.cdr.markForCheck();
  };

  private registerTicketListeners(): void {
    this.socket.on<any>('ticket:created')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playTicketNotification();
        this.sound.notify(
          'TICKET CREADO',
          data?.titulo || 'Se creo un nuevo ticket',
          `ticket-created-${data?.id}`,
        );
      });

    this.socket.on<any>('ticket:updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playTicketNotification();
        this.sound.notify(
          'TICKET ACTUALIZADO',
          data?.titulo || 'Un ticket fue actualizado',
          `ticket-updated-${data?.id}`,
        );
      });

    this.socket.on<any>('ticket:deleted')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.sound.playTicketNotification();
        this.sound.notify(
          'TICKET ELIMINADO',
          data?.titulo || 'Un ticket fue eliminado',
          `ticket-deleted-${data?.id}`,
        );
      });
  }

  openSidebar(): void {
    this.sidebarOpen = true;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  closeSidebarOnMobile(): void {
    if (this.smallScreen || this.forceSidebarHidden) {
      this.sidebarOpen = false;
    }
  }

  logout(): void {
    this.socket.disconnect();
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
