import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Task } from '@stores/task.store';
import { TaskStore } from '@app/stores/task.store';
import { Observable, tap, catchError, finalize } from 'rxjs';
import { throwError } from 'rxjs';
import { EntityVersion } from '@stores/task.store';
import { AuthService } from './auth.service';
import { WebsocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class TaskService {
    private auth = inject(AuthService);
    private websocketService = inject(WebsocketService);
    private http = inject(HttpClient);
    private store = inject(TaskStore);
    private readonly apiUrl = `${environment.apiUrl}/task`;
    private readonly CACHE_DURATION_MS = 15 * 60 * 1000; // 15 perc

    constructor() {
        this.getAll().subscribe();
        this.auth.$refresh.subscribe(() => this.getAll(true).subscribe());
        this.websocketService.$msgNotify.subscribe((msg) => {
            if(msg.type === 'task.create') {
                this.store.addItem(msg.payload);
            }
            if(msg.type === 'task.update') {
                this.store.updateItem(msg.payload['id'], msg.payload);
            }
            if(msg.type === 'task.delete') {
                this.store.removeItem(msg.payload['id']);
            }
            if(msg.type === 'task_submission.upload') {
                this.store.updateSubmission(msg.payload['task_id'], msg.payload['class_letter'], msg.payload);
            }
        });
    }

    /**
     * Összes Task lekérése
     */
    getAll(refresh: boolean = false): Observable<Task[]> {
        // Cache check
        if (this._isCacheValid() && !refresh) {
            return new Observable((observer) => {
                observer.next(this.store.items());
                observer.complete();
            });
        }

        this.store.setLoading(true);

        return this.http.get<Task[]>(this.apiUrl).pipe(
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
     * Task hozzáadása
     */
    create(data: Partial<Task>): Observable<Task> {
        return this.http.post<Task>(this.apiUrl, data).pipe(
            tap((item) => {
                this.store.setLoading(true);
                this.store.addItem(item);
                this.store.selectTask(item.id);
                this.store.setLoading(false);
            }),
            catchError((error) => {
                return throwError(() => error);
            })
        );
    }

    /**
     * Task frissítése
     */
    update(id: number, data: Partial<Task>): Observable<Task> {
        this.store.setLoading(true);

        return this.http.put<Task>(`${this.apiUrl}/${id}`, data).pipe(
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

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
            tap(() => {
                this.store.removeItem(id);
            })
        );
    }

    getTaskVersions(taskId: number): Observable<EntityVersion[]> {
        this.store.setVersionsLoading(true);
        return this.http.get<EntityVersion[]>(`${this.apiUrl}/${taskId}/versions`).pipe(
            tap((versions) => this.store.setVersions(versions)),
            catchError((error) => {
                this.store.setVersionsLoading(false);
                return throwError(() => error);
            })
        );
    }

    restoreTaskVersion(taskId: number, versionNumber: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/${taskId}/versions/${versionNumber}/restore`, {}).pipe(
            tap(() => {
                this.getAll(true).subscribe();
                this.getTaskVersions(taskId).subscribe();
            })
        );
    }

    getCriteriaVersions(taskId: number, criteriaId: number): Observable<EntityVersion[]> {
        this.store.setVersionsLoading(true);
        return this.http.get<EntityVersion[]>(`${this.apiUrl}/${taskId}/criteria/${criteriaId}/versions`).pipe(
            tap((versions) => this.store.setVersions(versions)),
            catchError((error) => {
                this.store.setVersionsLoading(false);
                return throwError(() => error);
            })
        );
    }

    restoreCriteriaVersion(taskId: number, criteriaId: number, versionNumber: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/${taskId}/criteria/${criteriaId}/versions/${versionNumber}/restore`, {}).pipe(
            tap(() => {
                this.getAll(true).subscribe();
                this.getCriteriaVersions(taskId, criteriaId).subscribe();
            })
        );
    }

    /**
     * Task kiválasztása
     */
    selectTask(id: number | null): void {
        this.getAll().subscribe();
        this.store.selectTask(id);
    }

    selectCriteria(id: number | null): void {
        this.getAll().subscribe();
        this.store.selectCriteria(id);
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