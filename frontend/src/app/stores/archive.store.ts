import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';
import { UserPublic } from '@stores/point.store';

export interface ArchivePhoto {
    id: number;
    stored_hash: string;
    original_filename: string;
    width: number;
    height: number;
    caption: string | null;
    uploaded_at: string;
    uploaded_by: UserPublic;
}

interface ArchiveState {
    items: ArchivePhoto[];
    isLoading: boolean;
    uploading: boolean;
}

const initialState: ArchiveState = { items: [], isLoading: false, uploading: false };

export const ArchiveStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: ArchivePhoto[]) {
            patchState(store, { items: [...items].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)) });
        },
        addItem(item: ArchivePhoto) {
            if (store.items().some((i) => i.id === item.id)) return;
            patchState(store, { items: [item, ...store.items()] });
        },
        removeItem(id: number) {
            patchState(store, { items: store.items().filter((i) => i.id !== id) });
        },
        setLoading(isLoading: boolean) { patchState(store, { isLoading }); },
        setUploading(uploading: boolean) { patchState(store, { uploading }); },
    })),
    withComputed((store) => ({
        count: computed(() => store.items().length),
    }))
);