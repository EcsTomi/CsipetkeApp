import { CommonModule } from '@angular/common';
import { Component, inject, input, signal, computed, effect, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { VoteService } from '@app/services/vote.service';
import { VoteStore } from '@app/stores/vote.store';
@Component({
    selector: 'vote-img-upload-panel',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './vote-img-upload-panel.html',
    styleUrl: './vote-img-upload-panel.css',
})
export class VoteImgUploadPanel {
    private voteService = inject(VoteService);
    private voteStore = inject(VoteStore);

    voteId = input.required<number>();
    optionId = input.required<number>();

    protected accept = 'image/*';
    protected dragOver = signal(false);
    protected uploading = signal(false);
    protected error = signal<string | null>(null);
    protected image = computed(() => this.voteStore.selectedVote()?.options.find((o) => o.id === this.optionId())?.image_path);

    constructor() {
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

        this.voteService.uploadOptionImg(this.voteId(), this.optionId(), file).subscribe({
            next: (event) => {
                this.uploading.set(false);
            },
            error: (err) => {
                this.uploading.set(false);
                this.error.set(err.error?.detail ?? 'Egy csipetnyi hiba lépett fel.');
            },
        });
    }

    protected getOptionImageUrl(): string | null {
        return this.voteService.getOptionImageUrl(this.voteId(), this.optionId());
    }
}