import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { PointStore, Point, Summary } from '@stores/point.store';
import { Observable, tap, catchError, finalize } from 'rxjs';
import { throwError } from 'rxjs';
import { EntityVersion } from '@stores/task.store';
import { AuthService } from './auth.service';
import { WebsocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class PointService {
    private auth = inject(AuthService);
    private http = inject(HttpClient);
    private store = inject(PointStore);
    private websocketService = inject(WebsocketService);

    private readonly apiUrl = `${environment.apiUrl}/point`;
    private readonly CACHE_DURATION_MS = 15 * 60 * 1000; // 15 perc

    constructor() {
        this.getAll().subscribe();
        this.getSummary().subscribe();
        this.auth.$refresh.subscribe(() => {
            this.getAll(true).subscribe();
            this.getSummary().subscribe();
        });
        this.websocketService.$msgNotify.subscribe((msg) => {
            if (msg.type === 'point.create') {
                let newPoint = msg.payload;
                this.store.addItem(msg.payload);
            }
            if (msg.type === 'point.amount') {
                this.store.updateAmount(msg.payload['id'], msg.payload['amount']);
            }
            if (msg.type === 'point.update') {
                this.store.updateItem(msg.payload['id'], msg.payload);
            }
            if (msg.type === 'point.upsert') {
                if (this.store.items().find((p) => p.id === msg.payload['id'])) {
                    this.store.updateAmount(msg.payload['id'], msg.payload['amount']);
                } else {
                    this.store.addItem(msg.payload);
                }
            }
            if (msg.type === 'point.remove') {
                this.store.removeItem(msg.payload['id']);
            }
            if (msg.type === 'point.summary') {
                this.store.setSummaries(msg.payload['summaries']);
            }
            if (msg.type === 'event_settings.publish_points') {
                this.getAll(true).subscribe();
                this.getSummary(true).subscribe();
            }
        })
    }

    /**
     * Összes Point lekérése
     */
    getAll(refresh: boolean = false): Observable<Point[]> {
        // Cache check
        if (this._isCacheValid() && !refresh) {
            return new Observable((observer) => {
                observer.next(this.store.items());
                observer.complete();
            });
        }

        this.store.setLoading(true);

        return this.http.get<Point[]>(this.apiUrl).pipe(
            tap((items) => {
                this.store.setItems(items);
            }),
            catchError((error) => {
                return throwError(() => error);
            }),
            finalize(() => {
                this.store.setLoading(false);
            })
        );
    }

    /**
     * Point hozzáadása
     */
    create(data: Partial<Point>): Observable<Point> {
        return this.http.post<Point>(this.apiUrl, data).pipe(
            tap((item) => {
                this.store.setLoading(true);
                this.store.addItem(item);
                this.store.selectPoint(item.id);
                this.store.setLoading(false);
            }),
            catchError((error) => {
                return throwError(() => error);
            })
        );
    }

    /**
     * Pont visszavonása (soft delete)
     */
    removePoint(id: number, removeDetails: string): Observable<Point> {
        return this.http.put<Point>(`${this.apiUrl}/${id}/remove`, { remove_details: removeDetails }).pipe(
            tap((item) => {
                this.store.markRemoved(id, item);
            }),
            catchError((error) => {
                return throwError(() => error);
            })
        );
    }

    /**
     * Összesítés lekérdezése
     */
    getSummary(refresh: boolean = false): Observable<Summary[]> {
        //Cache check
        if (this._isCacheValid() && !refresh) {
            return new Observable((observer) => {
                observer.next(this.store.summaries());
                observer.complete();
            });
        }
        
        this.store.setSummariesLoading(true);
        return this.http.get<Summary[]>(`${this.apiUrl}/summary`).pipe(
            tap((summaries) => this.store.setSummaries(summaries)),
            catchError((error) => {
                this.store.setSummariesLoading(false);
                return throwError(() => error);
            })
        );
    }

    /**
     * Point kiválasztása
     */
    selectPoint(id: number | null): void {
        this.getAll().subscribe();
        this.store.selectPoint(id);
    }

    correctPlacements(taskId: number, entries: { class_letter: string; placement: string }[]): Observable<any[]> {
        return this.http.put<any[]>(`${this.apiUrl}/correct`, { task_id: taskId, entries });
    }


    // ============================================================
    // PRIVÁT HELPERS
    // ============================================================

    private _isCacheValid(): boolean {
        const lastUpdated = this.store.lastUpdated();
        if (!lastUpdated) return false;

        const cacheAge = Date.now() - lastUpdated;
        return cacheAge < this.CACHE_DURATION_MS;
    }
}