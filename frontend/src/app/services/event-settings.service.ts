import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable, tap } from 'rxjs';
import { EventSettingsStore } from '@app/stores/event-settings.store';
import { WebsocketService } from './websocket.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class EventSettingsService {
    private http = inject(HttpClient);
    private store = inject(EventSettingsStore);
    private auth = inject(AuthService);
    private websocketService = inject(WebsocketService);
    private readonly apiUrl = `${environment.apiUrl}/event-settings`;

    constructor() {
        this.getSettings().subscribe();
        this.auth.$refresh.subscribe(() => {
            this.getSettings().subscribe();
        })
        this.websocketService.$msgNotify.subscribe((msg) => {
            if (msg.type === 'event_settings.pause_points') {
                this.store.pausePoints(msg.payload['points_frozen_at']);
            }
            if (msg.type === 'event_settings.publish_points') {
                this.store.publishPoints();
            }
            if (msg.type === 'event_settings.set_jury_window') {
                this.store.setJuryWindow(msg.payload['jury_window_start'], msg.payload['jury_window_end']);
            }
            if (msg.type === 'event_settings.set_winner') {
                this.store.setWinningClass(msg.payload['winner']);
            }
        })
    }

    getSettings(): Observable<any> {
        return this.http.get<any>(this.apiUrl).pipe(
            tap((data) => this.store.setSettings(data))
        );
    }

    pausePoints(): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/points/pause`, {}).pipe(
            tap((data) => this.store.setSettings(data))
        );
    }

    publishPoints(): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/points/publish`, {}).pipe(
            tap((data) => this.store.setSettings(data))
        );
    }

    setJuryWindow(start: string, end: string): Observable<any> {
        const params = new URLSearchParams({ start, end });
        return this.http.put<any>(`${this.apiUrl}/jury/window?${params.toString()}`, {}).pipe(
            tap(() => this.getSettings().subscribe())
        );
    }

    setWinningClass(winningClass: string): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/winner/${winningClass}`, {}).pipe(
            tap(() => this.getSettings().subscribe())
        );
    }
}