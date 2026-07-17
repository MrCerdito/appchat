import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { ToastContainerComponent } from '../../../shared/components/toast-container.component';
import { filter, Subscription } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LayoutService } from '../../../core/services/layout.service';
import { User } from '../../../core/models/user.model';
import { trackByIndex, trackById } from '../../../shared/utils/track-by';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, ToastContainerComponent],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  currentAdmin: User | null = null;
  menuOpen = false;
  sidebarOpen = false;
  sidebarCollapsed = false;
  appearanceOpen = false;

  private routerSub?: Subscription;
  private layoutSub?: Subscription;

  constructor(
    private auth: AuthService,
    private socket: SocketService,
    protected themeService: ThemeService,
    private router: Router,
    private layoutService: LayoutService,
  ) {}

  ngOnInit(): void {
    this.currentAdmin = this.auth.getUser();
    this.socket.connect(this.auth.getToken() ?? undefined);
    this.syncSidebarMode();
    this.routerSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe({
        next: () => this.syncSidebarMode(),
        error: (err) => console.error('HTTP Error:', err),
      });
    this.layoutSub = this.layoutService.sidebarForcedVisible$.subscribe({
      next: () => {
        this.syncSidebarMode();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.layoutSub?.unsubscribe();
  }

  get isOperacionesRoute(): boolean {
    return this.router.url.includes('/admin/operaciones');
  }

  openSidebar(): void {
    this.sidebarCollapsed = false;
    this.sidebarOpen = true;
  }

  collapseSidebar(): void {
    if (this.isOperacionesRoute) {
      this.sidebarCollapsed = true;
    }
    this.sidebarOpen = false;
  }

  closeSidebarOnMobile(): void {
    if (window.innerWidth <= 768) {
      this.sidebarOpen = false;
    }
    if (this.isOperacionesRoute) {
      this.sidebarCollapsed = true;
    }
  }

  logout(): void {
    this.socket.disconnect();
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private syncSidebarMode(): void {
    if (this.layoutService.sidebarForcedVisible) {
      this.sidebarCollapsed = false;
    } else {
      this.sidebarCollapsed = this.isOperacionesRoute;
    }
    this.sidebarOpen = false;
  }
}
