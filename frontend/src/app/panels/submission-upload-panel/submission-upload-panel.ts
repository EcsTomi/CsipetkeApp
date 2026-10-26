import { CommonModule } from '@angular/common';
import { Component, inject, input, signal, computed, effect, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SubmissionService, Submission } from '@services/submission.service';
import { FileUpload, Task, TaskStore } from '@app/stores/task.store';
import { TaskService } from '@app/services/task.service';

const ACCEPT_MAP: Record<string, string> = {
    file_upload_vid: 'video/*,audio/*',
    file_upload_doc: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
    file_upload_img: 'image/*',
    file_upload_any: '*',
};

@Component({
    selector: 'submission-upload-panel',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './submission-upload-panel.html',
    styleUrl: './submission-upload-panel.css',
})
export class TaskSubmissionUpload {
    private submissionService = inject(SubmissionService);
    private taskStore = inject(TaskStore);

    taskId = input.required<number>();
    fileUploadType = input.required<FileUpload>();
    canUpload = input.required<boolean>();

    protected accept = computed(() => ACCEPT_MAP[this.fileUploadType()] ?? '*');
    protected dragOver = signal(false);
    protected uploading = signal(false);
    protected error = signal<string | null>(null);
    protected submission = signal<Submission | null>(null);
    protected task = computed(() => this.taskStore.selectedTask());
    protected canBeSubmittedFrom = computed(() => !this.task()?.available_from || new Date(this.task()?.available_from!) < new Date());
    protected canBeSubmittedTo = computed(() => !this.task()?.deadline || new Date(this.task()?.deadline!) > new Date());

    protected isLateUploaded = computed(() => {
        if (!this.submission()) return false;
        return new Date(this.submission()!.uploaded_at) > new Date(this.task()?.deadline!);
    });

    constructor() {
        effect(() => {
            const id = this.taskId();
            this.submissionService.getMySubmission(id).subscribe((s) => this.submission.set(s));
        });
    }

    onDragOver(e: DragEvent) {
        e.preventDefault();
        this.dragOver.set(true);
    }

    onDragLeave() {
        this.dragOver.set(false);
    }

    onDrop(e: DragEvent) {
        e.preventDefault();
        this.dragOver.set(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) this.startUpload(file);
    }

    onFileSelected(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.startUpload(file);
    }

    private startUpload(file: File) {
        this.error.set(null);
        this.uploading.set(true);

        this.submissionService.upload(this.taskId(), file).subscribe({
            next: (submission) => {
                this.submission.set(submission);
                this.uploading.set(false);
            },
            error: (err) => {
                this.uploading.set(false);
                this.error.set(err.error?.detail ?? 'Egy csipetnyi hiba lépett fel.');
            },
        });
    }

    formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    protected isDownloading = signal(false);

    downloadSubmission() {
        this.isDownloading.set(true);
        this.submissionService.downloadMySubmission(this.taskId()).subscribe(
            (blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.submission()?.original_filename ?? '';
                a.click();
                URL.revokeObjectURL(url);
                this.isDownloading.set(false);
            }
        );
    }
}