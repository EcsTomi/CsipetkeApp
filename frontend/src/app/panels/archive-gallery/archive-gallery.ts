import { CommonModule, NgOptimizedImage, IMAGE_LOADER } from '@angular/common';
import { Component, inject, computed, signal, OnInit, HostListener } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ArchiveService } from '@app/services/archive.service';
import { ArchiveStore, ArchivePhoto } from '@app/stores/archive.store';
import { archiveImageLoader } from '@app/utils/archive-image-loader';
import { ArchiveUploadPanel } from "../archive-upload-panel/archive-upload-panel";
import { AuthService } from '@app/services/auth.service';

@Component({
    selector: 'archive-gallery',
    standalone: true,
    imports: [CommonModule, MatIconModule, NgOptimizedImage, ArchiveUploadPanel],
    templateUrl: './archive-gallery.html',
    styleUrl: './archive-gallery.css',
    providers: [
        {
            provide: IMAGE_LOADER,
            useValue: archiveImageLoader,
        },
    ],
})
export class ArchiveGallery implements OnInit {
    protected auth = inject(AuthService);
    private archiveService = inject(ArchiveService);
    protected archiveStore = inject(ArchiveStore);
    protected isChanging = signal(false);
    protected photos = computed(() => this.archiveStore.items());
    protected isLoading = computed(() => this.archiveStore.isLoading());
    
    // Index-alapú Lightbox állapot
    protected selectedIndex = signal<number | null>(null);
    protected activePhoto = computed(() => {
        const idx = this.selectedIndex();
        const items = this.photos();
        return (idx !== null && items[idx]) ? items[idx] : null;
    });

    protected prevAvailable = computed(() => {
        const idx = this.selectedIndex();
        const items = this.photos();
        return (idx !== null && items[idx - 1]) ? items[idx - 1] : null;
    });
    protected nextAvailable = computed(() => {
        const idx = this.selectedIndex();
        const items = this.photos();
        return (idx !== null && items[idx + 1]) ? items[idx + 1] : null;
    });

    private changeIndex(newIndex: number): void {
        this.isChanging.set(true);
        this.selectedIndex.set(newIndex);
        // Következő microtask-ban kényszerítjük az NgOptimizedImage újraillesztését
        queueMicrotask(() => this.isChanging.set(false));
    }


    ngOnInit(): void {
        this.archiveService.load().subscribe();
    }

    open(index: number): void {
        this.selectedIndex.set(index);
    }

    close(): void {
        this.confirmDelete.set(0);
        this.selectedIndex.set(null);
    }

    protected confirmDelete = signal(0);

    removeConfirm(event?: Event): void {
        event?.stopPropagation();
        this.confirmDelete.set(this.confirmDelete() + 1);
    }

    remove(event?: Event): void {
        event?.stopPropagation();
        let currentItem = this.selectedIndex();
        if (currentItem === null) return;
        this.archiveService.remove(this.photos()[currentItem].id).subscribe();
        this.close();
        this.confirmDelete.set(0);
    }

    next(event?: Event): void {
        event?.stopPropagation(); // Ne csukja be a modalt kattintáskor
        const current = this.selectedIndex();
        this.confirmDelete.set(0);
        if (current === null) return;
        const total = this.photos().length;
        this.changeIndex((current + 1) % total);
    }

    prev(event?: Event): void {
        event?.stopPropagation();
        const current = this.selectedIndex();
        this.confirmDelete.set(0);
        if (current === null) return;
        const total = this.photos().length;
        this.changeIndex((current - 1 + total) % total);
    }

    @HostListener('window:keydown', ['$event'])
    handleKeydown(event: KeyboardEvent): void {
        if (this.selectedIndex() === null) return;

        if (event.key === 'ArrowRight') this.next();
        if (event.key === 'ArrowLeft') this.prev();
        if (event.key === 'Escape') this.close();
    }
}