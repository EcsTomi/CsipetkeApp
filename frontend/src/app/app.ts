import { Component, computed, HostListener, inject, NgZone, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet, ActivatedRoute, NavigationEnd, NavigationError } from '@angular/router';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@services/auth.service';
import { filter, map } from 'rxjs';
import { WebsocketService } from './services/websocket.service';
import { MaintenanceService } from './services/maintenance.service';
import { UserStore } from './stores/user.store';
import { EventSettingsStore } from './stores/event-settings.store';
import { EventSettingsService } from './services/event-settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, MatIconModule, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  http = inject(HttpClient);
  auth = inject(AuthService);
  userStore = inject(UserStore);
  websocketService = inject(WebsocketService);
  maintenanceService = inject(MaintenanceService);
  eventSettingsService = inject(EventSettingsService);
  eventSettingsStore = inject(EventSettingsStore);

  protected _queueFull = signal(false);
  protected _isOffline = computed(() => this.maintenanceService.isOffline());
  protected _isFullyOffline = computed(() => this.maintenanceService.isFullyOffline());
  protected _justReconnected = computed(() => this.maintenanceService.justReconnected());

  public underMaintenance = computed(() => this.maintenanceService.underMaintenance())
  
  constructor(private router: Router, private activatedRoute: ActivatedRoute) {
    this.selfReload();
    this.websocketService.$msgNotify.subscribe((msg) => {
      if (msg.type === 'queue_full') {
        this._queueFull.set(msg.payload.is_full);
      }
    });
    
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationError) {
        const msg = String(event.error?.message ?? '');
        if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('ChunkLoadError')) {
          this.maintenanceService.checkForUptime();
        }
      }
    });
  }

  overlay = signal(false);

  isRoot = computed(() => this.title() === 'Csipetke' ? "root" : "");

  winnerClass = computed(() => 'winner-' + this.eventSettingsStore.winningClass());

  title = signal('Csipetke');

  ngOnInit() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => {
        let route = this.activatedRoute.firstChild;
        while (route?.firstChild) {
          route = route.firstChild;
        }
        return route?.snapshot.data['headerTitle'] || 'Alapértelmezett Cím';
      })
    ).subscribe(title => {
      this.title.set(title);
    });
  }

  logout() {
    this.overlay.set(false);
    this.auth.logout();
  }

  logoutFromAll() {
    this.overlay.set(false);
    this.auth.logoutFromAll();
  }

  profile() {
    this.overlay.set(true);
  }

  selfReload() {
    let currentMinute = new Date().getMinutes();
    let currentSecond = new Date().getSeconds();
    let nextRefresh = (10 - currentMinute%10)*60 + (60 - currentSecond);
    setTimeout(() => {
      this.refreshContent();
      this.selfReload();
    }, nextRefresh*1000);
  }

  refreshContent() {
    this.auth.getProfile();
    this.auth.$refresh.next(true);
  }
}
