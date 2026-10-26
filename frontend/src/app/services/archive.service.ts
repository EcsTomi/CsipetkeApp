import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize } from 'rxjs';
import { environment } from '@env/environments';
import { ArchiveStore, ArchivePhoto } from '@app/stores/archive.store';

@Injectable({ providedIn: 'root' })
export class ArchiveService {
    private http = inject(HttpClient);
    private store = inject(ArchiveStore);
    private readonly apiUrl = `${environment.apiUrl}/archive`;

    load(): Observable<ArchivePhoto[]> {
        this.store.setLoading(true);
        return this.http.get<ArchivePhoto[]>(this.apiUrl).pipe(
            tap((items) => this.store.setItems(items)),
            finalize(() => this.store.setLoading(false))
        );
    }

    upload(file: File, caption?: string): Observable<ArchivePhoto> {
        const form = new FormData();
        form.append('file', file);
        if (caption) form.append('caption', caption);

        this.store.setUploading(true);
        return this.http.put<ArchivePhoto>(this.apiUrl, form).pipe(
            tap((item) => this.store.addItem(item)),
            finalize(() => this.store.setUploading(false))
        );
    }

    remove(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(tap(() => this.store.removeItem(id)));
    }
}