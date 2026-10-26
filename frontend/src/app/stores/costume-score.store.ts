// costume-score.store.ts
import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';
import { UserPublic } from '@stores/point.store';

export interface CostumeScore {
    id: number;
    class_letter: string;
    headcount: number;
    notDressed: number;
    extraItems: number;
    ofDressed: boolean;
    note: string | null;

    created_at: string;
    created_by: UserPublic | null;
    modified_at: string | null;
    modified_by: UserPublic | null;

    is_removed: boolean;
    remove_details: string | null;
    removed_at: string | null;
    removed_by: UserPublic | null;

    calculatedSum: number;
}

interface CostumeScoreState {
    items: CostumeScore[];
    isLoading: boolean;
}

const initialState: CostumeScoreState = {
    items: [],
    isLoading: false,
};

export const CostumeScoreStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: CostumeScore[]) {
            patchState(store, { items });
        },
        addItem(item: CostumeScore) {
            patchState(store, { items: [item, ...store.items()] });
        },
        updateItem(item: CostumeScore) {
            patchState(store, { items: store.items().map((i) => (i.id === item.id ? item : i)) });
        },
        setLoading(isLoading: boolean) {
            patchState(store, { isLoading });
        },
    })),
    withComputed((store) => ({
        // Csak az aktív (nem visszavont) pontozásokat számoljuk bele az összegzésbe
        activeItems: computed(() => store.items().filter((i) => !i.is_removed)),
    })),
    withComputed((store) => ({
        totalsByClass: computed(() => {
            const totals: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
            for (const item of store.activeItems()) {
                totals[item.class_letter] = (totals[item.class_letter] ?? 0) + item.calculatedSum;
            }
            return totals;
        }),
    }))
);