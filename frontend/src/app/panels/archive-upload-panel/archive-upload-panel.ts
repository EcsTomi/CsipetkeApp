import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ArchiveService } from '@app/services/archive.service';
import { ArchiveStore } from '@app/stores/archive.store';

@Component({
    selector: 'archive-upload-panel',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './archive-upload-panel.html',
    styleUrl: './archive-upload-panel.css',
})
export class ArchiveUploadPanel {
    private archiveService = inject(ArchiveService);
    protected archiveStore = inject(ArchiveStore);

    protected dragOver = signal(false);
    protected error = signal<string | null>(null);
    protected uploading = signal(false);

    onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver.set(true); }
    onDragLeave() { this.dragOver.set(false); }

    onDrop(e: DragEvent) {
        e.preventDefault();
        this.dragOver.set(false);
        const files = e.dataTransfer?.files;
        if (files) this.uploadAll(Array.from(files));
    }

    onFilesSelected(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (files) this.uploadAll(Array.from(files));
        (e.target as HTMLInputElement).value = '';
    }

    private uploadAll(files: File[]) {
        this.error.set(null);
        this.uploading.set(true);
        let remaining = files.length;
        for (const file of files) {
            this.archiveService.upload(file).subscribe({
                next: () => { remaining--; if (remaining === 0) this.uploading.set(false); },
                error: (err) => {
                    remaining--;
                    this.error.set(err.error?.detail ?? `Hiba: ${file.name}`);
                    if (remaining === 0) this.uploading.set(false);
                },
            });
        }
    }
}