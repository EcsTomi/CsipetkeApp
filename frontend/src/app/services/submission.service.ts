// task-submission.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable } from 'rxjs';

export interface Submission {
    id: number;
    task_id: number;
    user_id: number;
    class_letter: string;
    original_filename: string;
    content_type: string;
    size_bytes: number;
    uploaded_at: string;
    user: { id: number; name: string; picture: string };
}

@Injectable({ providedIn: 'root' })
export class SubmissionService {
    private http = inject(HttpClient);
    private readonly apiUrl = `${environment.apiUrl}/task`;

    getMySubmission(taskId: number): Observable<Submission | null> {
        return this.http.get<Submission | null>(`${this.apiUrl}/${taskId}/submission/me`);
    }

    upload(taskId: number, file: File): Observable<Submission> {
        const formData = new FormData();
        formData.append('file', file);

        return this.http.put<Submission>(`${this.apiUrl}/${taskId}/submission`, formData);
    }

    downloadUrl(taskId: number): string {
        return `${this.apiUrl}/${taskId}/submission/me/download`;
    }

    downloadUrlFor(taskId: number, classLetter: string): string {
        return `${this.apiUrl}/${taskId}/submission/${classLetter}/download`;
    }

    downloadSubmission(taskId: number, classLetter: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/${taskId}/submission/${classLetter}/download`, { responseType: 'blob' });
    }
    downloadMySubmission(taskId: number): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/${taskId}/submission/me/download`, { responseType: 'blob' });
    }
}