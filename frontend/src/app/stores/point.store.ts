import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';

export interface UserPublic {
    id: number;
    name: string;
    role: {
        tag: string;
        name: string;
        description: string;
    }
    class_year: number;
    class_letter: string;
    picture: string;
}

export type PointSource = 'manual' | 'organizer' | 'jury_auto';

export interface Point {
    id : number
    class_letter : string
    amount : number
    task_id : number | null
    source : PointSource
    criteria_id : number | null
    details : string | null
    created_at : Date
    created_by : UserPublic | null
    visible_from : Date
    is_visible : boolean | null
    is_removed : boolean
    remove_details : string | null
    removed_at : Date | null
    removed_by : UserPublic | null
}

export interface Summary {
    class_letter: string;
    public_amount: number;
    hidden_amount: number | null;
}

interface PointState {
    items: Point[];
    summaries: Summary[];
    lastUpdated: number;
    selectedPointId: number | null;
    isLoading: boolean;
    summariesLoading: boolean;
}

const initialState: PointState = {
    items: [],
    summaries: [],
    lastUpdated: 0,
    selectedPointId: null,
    isLoading: false,
    summariesLoading: false
};

export const PointStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: Point[]) {
            patchState(store, {
                items,
                lastUpdated: Date.now(),
            });
        },

        addItem(item: Point) {
            patchState(store, { items: [...store.items(), item] });
        },

        updateItem(id: number, item: Point) {
            const items = store.items().map((i) => (i.id === id ? item : i));
            patchState(store, { items });
        },

        updateAmount(id: number, amount: number) {
            const items = store.items().map((i) => (i.id === id ? { ...i, amount } : i));
            patchState(store, { items });
        },

        removeItem(id: number) {
            const items = store.items().filter((i) => i.id !== id);
            patchState(store, { items });
        },

        markRemoved(id: number, item: Point) {
            const items = store.items().map((i) => (i.id === id ? item : i));
            patchState(store, { items });
        },

        selectPoint(id: number | null) {
            patchState(store, { selectedPointId: id });
        },

        clear() {
            patchState(store, initialState);
        },

        setLoading(isLoading: boolean) {
            patchState(store, { isLoading });
        },

        setSummaries(summaries: Summary[]) {
            patchState(store, { summaries, summariesLoading: false });
        },

        setSummariesLoading(summariesLoading: boolean) {
            patchState(store, { summariesLoading });
        },

        clearSummaries() {
            patchState(store, { summaries: [], summariesLoading: false });
        },
    })),
    withComputed((store) => ({
        selectedPoint: computed(() => {
            const id = store.selectedPointId();
            return store.items().find((item) => item.id === id) || null;
        }),
        visibleCount: computed(() => store.items().filter((item) => item.is_visible).length),
        isEmpty: computed(() => store.items().length === 0),
        count: computed(() => store.items().length),
    }))
);