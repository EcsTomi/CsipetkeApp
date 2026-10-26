import { Injectable, effect, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable, tap } from 'rxjs';
import { JuryScoreStore, JurorScoreEntry } from '@app/stores/jury-score.store';
import { WebsocketService } from './websocket.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class JuryScoreService {
    private http = inject(HttpClient);
    private store = inject(JuryScoreStore);
    private auth = inject(AuthService);
    private websocketService = inject(WebsocketService);
    private readonly apiUrl = `${environment.apiUrl}/jury`;
    private _timeout: any = null;
    constructor() {
        this.auth.$refresh.subscribe(() => {
            this.getMyScores().subscribe();
            this.getWindow().subscribe();
        })
        this.websocketService.$msgNotify.subscribe((msg) => {
            if (msg.type === 'event_settings.set_jury_window') {
                this.store.setWindow(msg.payload['is_open'] === true, msg.payload['jury_window_start'], msg.payload['jury_window_end']);
                this.setInvalidationTimeout();
            }
        });
        this.setInvalidationTimeout();
    }

    setInvalidationTimeout() {
        if (this.store.windowEnd() && this.store.windowIsOpen() && new Date(this.store.windowEnd()!).getTime() > new Date().getTime()) {
            if (this._timeout) {
                clearTimeout(this._timeout);
            }
            this._timeout = setTimeout(() => {
                this.store.setWindow(false, null, null);
            }, (new Date(this.store.windowEnd()!).getTime() - new Date().getTime()));
        }
    }

    getMyScores(): Observable<JurorScoreEntry[]> {
        return this.http.get<JurorScoreEntry[]>(`${this.apiUrl}/score`).pipe(
            tap((entries) => this.store.setMyScores(entries))
        );
    }

    setScore(programItemId: number, score: number): Observable<JurorScoreEntry> {
        // optimista frissítés -- azonnal a helyi store-ba írjuk, mielőtt a válasz megjön
        this.store.setScore(programItemId, score);
        return this.http.put<JurorScoreEntry>(`${this.apiUrl}/score`, {
            program_item_id: programItemId,
            score,
        });
    }

    getWindow(): Observable<{ is_open: boolean; window_start: string | null; window_end: string | null }> {
        return this.http.get<any>(`${this.apiUrl}/window`).pipe(
            tap((w) => {
                this.store.setWindow(w.is_open, w.window_start, w.window_end);
                this.setInvalidationTimeout();
            })
        );
    }
}