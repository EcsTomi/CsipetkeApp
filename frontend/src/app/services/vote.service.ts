import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Vote, VoteHistory, VoteOption, VoteStore } from '@stores/vote.store';
import { Observable, tap, catchError, finalize, map, of } from 'rxjs';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { WebsocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class VoteService {
    private auth = inject(AuthService);
    private http = inject(HttpClient);
    private store = inject(VoteStore);
    private websocketService = inject(WebsocketService);
    public optionImageUrls = signal<Record<number, string | null>>({});
    private pendingImageLoads = new Set<string>();
    private readonly apiUrl = `${environment.apiUrl}/vote`;
    private readonly CACHE_DURATION_MS = 15 * 60 * 1000; // 15 perc

    constructor() {
        this.getAll().subscribe();
        this.auth.$refresh.subscribe(() => this.getAll(true).subscribe());
        this.websocketService.$msgNotify.subscribe((msg) => {
            if (msg.type === 'vote.create') {
                this.store.addItem(msg.payload);
            }
            if (msg.type === 'vote.update') {
                this.store.updateItem(msg.payload['id'], msg.payload);
            }
            if (msg.type === 'vote.delete') {
                this.store.removeItem(msg.payload['id']);
            }
            if (msg.type === 'vote_option.create') {
                this.store.addOption(msg.payload['vote_id'], msg.payload);
            }
            if (msg.type === 'vote_option.update') {
                this.store.updateOption(msg.payload['vote_id'], msg.payload['id'], msg.payload);
            }
            if (msg.type === 'vote_option.delete') {
                this.store.removeOption(msg.payload['vote_id'], msg.payload['id']);
            }
            if (msg.type === 'vote_option.set_image') {
                this.optionImageUrls.set([]);
            }
            if (msg.type === 'vote_results') {
                this.store.setResultsForVote(msg.payload['vote_id'], msg.payload['results']);
                this.store.addHistoryFromResults(msg.payload['results']);
            }
        })
    }

    /**
     * Összes Vote lekérése
     */
    getAll(refresh: boolean = false): Observable<Vote[]> {
        // Cache check
        if (this._isCacheValid() && !refresh) {
            return new Observable((observer) => {
                observer.next(this.store.items());
                observer.complete();
            });
        }

        this.store.setLoading(true);

        return this.http.get<Vote[]>(this.apiUrl).pipe(
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
     * Vote hozzáadása
     */
    create(data: Partial<Vote>): Observable<Vote> {
        return this.http.post<Vote>(this.apiUrl, data).pipe(
            tap((item) => {
                this.store.setLoading(true);
                this.store.addItem(item);
                this.store.selectVote(item.id);
                this.store.setLoading(false);
            }),
            catchError((error) => {
                return throwError(() => error);
            })
        );
    }

    /**
     * Vote frissítése
     */
    update(id: number, data: Partial<Vote>): Observable<Vote> {
        this.store.setLoading(true);

        return this.http.put<Vote>(`${this.apiUrl}/${id}`, data).pipe(
            tap((item) => {
                this.store.updateItem(id, item);
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
     * Vote törlése
     */
    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
            tap(() => {
                this.store.setLoading(true);
                this.store.removeItem(id);
                this.store.setLoading(false);
            })
        );
    }

    createOption(taskId: number, data: Partial<VoteOption>): Observable<VoteOption> {
        return this.http.post<VoteOption>(`${this.apiUrl}/${taskId}/option`, data).pipe(
            tap((item) => {
                this.store.setLoading(true);
                this.store.addOption(taskId, item as VoteOption);
                this.store.selectOption(item.id);
                this.store.setLoading(false);
            })
        );
    }

    updateOption(taskId: number, optionId: number, data: Partial<VoteOption>): Observable<VoteOption> {
        return this.http.put<VoteOption>(`${this.apiUrl}/${taskId}/option/${optionId}`, data).pipe(
            tap((item) => {
                this.store.setLoading(true);
                this.store.updateOption(taskId, optionId, item as VoteOption);
                this.store.setLoading(false);
            })
        );
    }

    removeOption(taskId: number, optionId: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${taskId}/option/${optionId}`).pipe(
            tap(() => {
                this.store.setLoading(true);
                this.store.removeOption(taskId, optionId);
                this.store.setLoading(false);
            })
        );
    }

    uploadOptionImg(taskId: number, optionId: number, file: File): Observable<VoteOption> {
        const formData = new FormData();
        formData.append('file', file);

        return this.http.put<VoteOption>(`${this.apiUrl}/${taskId}/option/${optionId}/image`, formData).pipe(
            tap((item) => {
                this.store.setLoading(true);
                this.store.updateOption(taskId, optionId, item as VoteOption);
                this.store.setLoading(false);
                this.optionImageUrls.set([]);
            })
        );
    }

    getOptionImageUrl(voteId: number | null | undefined, optionId: number | null | undefined): string | null {
        if (!voteId || !optionId) return null;

        // 1. Megnézzük a Signal alapú cache-ben
        const cachedUrl = this.optionImageUrls()[optionId];
        if (cachedUrl || cachedUrl === null) return cachedUrl;

        // 2. Ha nincs ott és még nem töltődik, elindítjuk a betöltést asynchronous módon
        const loadKey = `${voteId}:${optionId}`;
        if (!this.pendingImageLoads.has(loadKey)) {
        this.pendingImageLoads.add(loadKey);
        
        this.loadOptionImage(voteId, optionId).subscribe({
            next: (imageUrl) => {
            if (imageUrl) {
                this.optionImageUrls.update((urls) => ({ ...urls, [optionId]: imageUrl }));
            } else {
                this.optionImageUrls.update((urls) => ({ ...urls, [optionId]: null }));
            }
            this.pendingImageLoads.delete(loadKey);
            },
            error: () => {
                this.optionImageUrls.update((urls) => ({ ...urls, [optionId]: null }));
                this.pendingImageLoads.delete(loadKey);
            }
        });
        }

        return null;
    }

    loadOptionImage(voteId: number | null | undefined, optionId: number | null | undefined): Observable<string | null> {
        if (!voteId || !optionId) return of(null);

        const cachedUrl = this.optionImageUrls()[optionId];
        if (cachedUrl) return of(cachedUrl);

        const url = `${this.apiUrl}/${voteId}/option/${optionId}/image`;
        return this.http.get(url, { responseType: 'blob' }).pipe(
        map((blob) => URL.createObjectURL(blob)),
        catchError(() => throwError(() => new Error('Failed to load option image')))
        );
    }

    voteOn(voteId: number, optionId: number): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/${voteId}/vote/${optionId}`, null).pipe(
            tap((item) => {
                this.store.setLoadingResults(true);
                this.store.setAllocaionForVote(voteId, optionId);
                this.store.setResults(item);
                this.getHistory(voteId).subscribe();
                this.store.setLoadingResults(false);
            })
        );
    }

    getResults(voteId: number): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/${voteId}/results`).pipe(
            tap((item) => {
                this.store.setLoadingResults(true);
                this.store.setResults(item);
                this.store.setLoadingResults(false);
            })
        );
    }

    getHistory(voteId: number): Observable<VoteHistory[]> {
        return this.http.get<any>(`${this.apiUrl}/${voteId}/history`).pipe(
            tap((item) => {
                this.store.setLoadingResults(true);
                this.store.setHistory(item);
                this.store.setLoadingResults(false);
            })
        );
    }

    /**
     * Task kiválasztása
     */
    selectVote(id: number | null): void {
        this.getAll().subscribe();
        this.store.selectVote(id);
    }

    selectOption(id: number | null): void {
        this.getAll().subscribe();
        this.store.selectOption(id);
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