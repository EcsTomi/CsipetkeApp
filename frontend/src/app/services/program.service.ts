import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { ProgramStore, ProgramItem } from '@app/stores/program.store';
import { WebsocketService } from './websocket.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ProgramService {
    private http = inject(HttpClient);
    private store = inject(ProgramStore);
    private auth = inject(AuthService);
    private websocketService = inject(WebsocketService);
    private readonly apiUrl = `${environment.apiUrl}/program-item`;

    constructor() {
        this.auth.$refresh.subscribe(() => {
            this.getAll().subscribe();
        });
        this.websocketService.$msgNotify.subscribe((msg) => {
            if (msg.type === 'program_item.set_current') {
                const id = msg.payload['current'];
                if (!id) return;
                if(this.auth.isPermitted('program.view_all')) {
                    const item = this.store.items().find((item) => item.id === id);
                }
            }
            if (msg.type === 'program_item.create') {
                this.store.addItem(msg.payload);
            }
            if (msg.type === 'program_item.modify') {
                this.store.updateItem(msg.payload['id'], msg.payload);
            }
            if (msg.type === 'program_item.delete') {
                this.store.removeItem(msg.payload['id']);
            }
            if (msg.type === 'program_item.reorder') {
                this.store.reorderOnly(msg.payload);
            }
        });
    }

    getAll(): Observable<ProgramItem[]> {
        this.store.setLoading(true);
        return this.http.get<ProgramItem[]>(this.apiUrl).pipe(
            tap((items) => {
                this.store.setItems(items);
                this.store.setLoading(false);
            }),
            catchError((err) => {
                this.store.setLoading(false);
                return throwError(() => err);
            })
        );
    }

    create(data: Partial<ProgramItem>): Observable<ProgramItem> {
        return this.http.post<ProgramItem>(this.apiUrl, data);
    }

    update(id: number, data: Partial<ProgramItem>): Observable<ProgramItem> {
        return this.http.put<ProgramItem>(`${this.apiUrl}/${id}`, data);
    }

    bulkGenerate(taskId: number): Observable<ProgramItem[]> {
        return this.http.post<ProgramItem[]>(`${this.apiUrl}/bulk-generate`, { task_id: taskId });
    }

    reorder(items: { id: number; order_index: number }[]): Observable<ProgramItem[]> {
        return this.http.put<ProgramItem[]>(`${this.apiUrl}/reorder`, { items }).pipe(
            tap((items) => this.store.setItems(items))
        );
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }
}