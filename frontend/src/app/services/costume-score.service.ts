// costume-score.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { CostumeScore, CostumeScoreStore } from '@app/stores/costume-score.store';

export interface CostumeScoreInput {
    class_letter: string;
    headcount: number;
    notDressed: number;
    extraItems: number;
    ofDressed: boolean;
    note: string | null;
}

export interface RemoveScoreInput {
    remove_details: string | null;
}

@Injectable({ providedIn: 'root' })
export class CostumeScoreService {
    private http = inject(HttpClient);
    private store = inject(CostumeScoreStore);
    // A backend javítás után ide külön prefix kerüljön, ne /point
    private readonly apiUrl = `${environment.apiUrl}/costume`;

    getAll(): Observable<CostumeScore[]> {
        this.store.setLoading(true);
        return this.http.get<CostumeScore[]>(this.apiUrl).pipe(
            tap((items) => this.store.setItems(items)),
            catchError((error) => throwError(() => error)),
            finalize(() => this.store.setLoading(false))
        );
    }

    create(data: CostumeScoreInput): Observable<CostumeScore> {
        return this.http.post<CostumeScore>(this.apiUrl, data).pipe(
            tap((item) => this.store.addItem(item))
        );
    }

    edit(scoreId: number, data: CostumeScoreInput): Observable<CostumeScore> {
        return this.http.put<CostumeScore>(`${this.apiUrl}/${scoreId}/edit`, data).pipe(
            tap((item) => this.store.updateItem(item))
        );
    }

    remove(scoreId: number, data: RemoveScoreInput): Observable<CostumeScore> {
        return this.http.put<CostumeScore>(`${this.apiUrl}/${scoreId}/remove`, data).pipe(
            tap((item) => this.store.updateItem(item))
        );
    }
}