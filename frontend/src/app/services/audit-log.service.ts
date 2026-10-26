import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { AuditLogStore, AuditLog } from '@app/stores/audit-log.store';
import { WebsocketService } from './websocket.service';
import { AuthService } from './auth.service';

interface AuditLogListResponse {
    items: AuditLog[];
    total: number;
    limit: number;
    offset: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
    private http = inject(HttpClient);
    private store = inject(AuditLogStore);
    private auth = inject(AuthService);
    private websocketService = inject(WebsocketService);
    private readonly apiUrl = `${environment.apiUrl}/audit-log`;

    constructor() {
        this.auth.$refresh.subscribe(() => {
            this.load().subscribe();
        })
        this.websocketService.$msgNotify.subscribe((msg) => {
            if (msg.type === 'audit_log.log') {
                let auditLog = msg.payload as AuditLog;
                // Modify to local time
                auditLog.created_at = auditLog.created_at + 'Z';
                this.store.addItem(auditLog);
            }
        });
    }

    load(): Observable<AuditLogListResponse> {
        this.store.setLoading(true);

        const f = this.store.filters();
        let params = new HttpParams()
            .set('limit', this.store.limit())
            .set('offset', this.store.offset());

        if (f.actions?.length) {
            for (const a of f.actions) {
                params = params.append('action', a);
            }
        }
        if (f.user_name != null) params = params.set('user_name', f.user_name);
        if (f.target_id != null) params = params.set('target_id', f.target_id);
        if (f.target_name != null) params = params.set('target_name', f.target_name);
        if (f.date_from) params = params.set('date_from', f.date_from);
        if (f.date_to) params = params.set('date_to', f.date_to);
        if (f.status != null && f.status > 0) params = params.set('status', f.status);

        return this.http.get<AuditLogListResponse>(this.apiUrl, { params }).pipe(
            tap((res) => this.store.setItems(res.items, res.total)),
            catchError((error) => throwError(() => error)),
            finalize(() => this.store.setLoading(false))
        );
    }

    loadActions(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/actions`).pipe(
            tap((actions) => this.store.setActions(actions)),
            catchError((error) => throwError(() => error))
        );
    }

    nextPage(): void {
        if (this.store.hasNextPage()) {
            this.store.setOffset(this.store.offset() + this.store.limit());
            this.load().subscribe();
        }
    }

    prevPage(): void {
        if (this.store.hasPrevPage()) {
            this.store.setOffset(Math.max(0, this.store.offset() - this.store.limit()));
            this.load().subscribe();
        }
    }
}