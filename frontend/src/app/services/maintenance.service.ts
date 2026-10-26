import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';

@Injectable({ providedIn: 'root' })
export class MaintenanceService {
    private http = inject(HttpClient);

    constructor() {
        window.addEventListener('offline', () => this.checkForUptime());
        window.addEventListener('online', () => this.checkForUptime());
    }

    private _underMaintenance = signal(false);
    readonly underMaintenance = this._underMaintenance.asReadonly();

    public isOffline = signal(false);
    public isFullyOffline = signal(false);
    public justReconnected = signal(false);

    private reconnectedTimeout: ReturnType<typeof setTimeout> | null = null;

    markReconnected(): void {
        if (!this.isOffline()) return;
        this.isOffline.set(false);
        this.isFullyOffline.set(false);
        this.justReconnected.set(true);

        if (this.reconnectedTimeout) clearTimeout(this.reconnectedTimeout);
        this.reconnectedTimeout = setTimeout(() => {
            this.justReconnected.set(false);
        }, 2500); // kicsit hosszabb, mint a CSS-animáció 2.2s késleltetése, hogy a fade-out lefusson
    }

    private pollHandle: ReturnType<typeof setInterval> | null = null;
    private readonly POLL_INTERVAL_MS = 4000;
    private pollInProgress = false;

    reportDown(): void {
        if (this._underMaintenance()) return;
        this._underMaintenance.set(true);
        this.startPolling();
    }

    reportUp(): void {
        this.markReconnected();
        this.stopPolling();
        if (!this._underMaintenance()) return;
        this._underMaintenance.set(false);
        window.location.reload();
    }

    checkForUptime(): void {
        if (this._underMaintenance()) return;
        this.startPolling();
    }

    private startPolling(): void {
        this.stopPolling();
        const poll = () => {
            if (this.pollInProgress) return;
            this.pollInProgress = true;

            this.http.get(`${environment.apiUrl}/timing`).subscribe({
                next: () => {
                    this.pollInProgress = false;
                    if (this._underMaintenance() || this.isOffline() || this.isFullyOffline()) this.reportUp();
                },
                error: (err) => {
                    this.pollInProgress = false;
                    const status = err.status;
                    if (status === 502) {
                        this.reportDown();
                    } else {
                        this.isOffline.set(true);
                    }
                }
            });
        };

        poll();
        this.pollHandle = setInterval(poll, this.POLL_INTERVAL_MS);
    }

    private stopPolling(): void {
        if (this.pollHandle) {
            clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
    }
}