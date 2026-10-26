import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';

export type ScoringType = 'none' | 'jury' | 'organizer';

export interface ProgramTask {
    id: number;
    name: string;
    details: string;
    scoring_type: ScoringType;
    max_points: number | null;
    placement_points: Record<string, number> | null;
}

export interface ProgramItem {
    id: number;
    order_index: number;
    task_id: number | null;
    class_letter: 'a' | 'b' | 'c' | 'd' | null;
    custom_label: string | null;
    custom_description: string | null;
    task: ProgramTask | null;
}

interface ProgramState {
    items: ProgramItem[];
    isLoading: boolean;
}

const initialState: ProgramState = {
    items: [],
    isLoading: false,
};

export const ProgramStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: ProgramItem[]) {
            patchState(store, { items: [...items].sort((a, b) => a.order_index - b.order_index) });
        },
        addItem(item: ProgramItem) {
            patchState(store, {
                items: [...store.items(), item].sort((a, b) => a.order_index - b.order_index),
            });
        },
        updateItem(id: number, item: ProgramItem) {
            patchState(store, {
                items: store.items().map((i) => (i.id === id ? item : i)).sort((a, b) => a.order_index - b.order_index),
            });
        },
        removeItem(id: number) {
            patchState(store, {
                items: store.items().filter((i) => i.id !== id),
            });
        },
        reorderOnly(itemsIn: ProgramItem[]) {
            // Reorder according to itemsIn, only modify order_index
            const updatedItems = store.items().map((i) => {
                const itemIn = itemsIn.find((item) => item.id === i.id);
                if (!itemIn) return i;
                return { ...i, order_index: itemIn.order_index };
            });
            patchState(store, {
                items: updatedItems.sort((a, b) => a.order_index - b.order_index),
            });
        },
        setLoading(isLoading: boolean) {
            patchState(store, { isLoading });
        },
        reorderLocal(items: ProgramItem[]) {
            patchState(store, { items });
        },
    }))
);