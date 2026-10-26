import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';
import { UserPublic } from '@stores/point.store';

export interface VoteOptionSummary {
    option_id: number
    total: number
}

export interface VoteOption {
    id: number
    name: string
    image_path: string
}

export interface Result {
    option_id: number
    total: number
}

export interface VoteHistoryPoint {
    created_at: Date
    total: number
}

export interface VoteHistory {
    option_id: number
    points: VoteHistoryPoint[]
}

export interface Vote {
    id: number
    name: string

    visible_from: Date
    visible_from_human: string
    available_from: Date
    available_from_human: string
    deadline: Date | null
    deadline_human: string

    is_open: boolean

    options: VoteOption[]

    history: VoteHistory[]

    my_allocation: number | null

    modified_at: Date
    modified_by: UserPublic
    is_deleted: boolean
}

interface VoteState {
    items: Vote[];
    results: Result[]
    history: VoteHistory[]
    lastUpdated: number;
    lastUpdatedResults: number;
    selectedVoteId: number | null;
    selectedOptionId: number | null;
    isLoading: boolean;
    isLoadingResults: boolean;
}

const initialState: VoteState = {
    items: [],
    results: [],
    history: [],
    lastUpdated: 0,
    lastUpdatedResults: 0,
    selectedVoteId: null,
    selectedOptionId: null,
    isLoading: false,
    isLoadingResults: false
};

export const VoteStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: Vote[]) {
            patchState(store, {
                items,
                lastUpdated: Date.now(),
            });
        },

        addItem(item: Vote) {
            patchState(store, { items: [...store.items(), item] });
        },

        updateItem(id: number, item: Vote) {
            const items = store.items().map((i) => (i.id === id ? item : i));
            patchState(store, { items });
        },

        removeItem(id: number) {
            const items = store.items().filter((i) => i.id !== id);
            patchState(store, { items });
        },

        selectVote(id: number | null) {
            patchState(store, { selectedVoteId: id });
        },

        addOption(voteId: number, option: VoteOption) {
            const items = store.items().map((i) => (i.id === voteId ? { ...i, options: [...i.options, option] } : i));
            patchState(store, { items });
        },

        updateOption(voteId: number, id: number, option: VoteOption) {
            const items = store.items().map((i) => (i.id === voteId ? { ...i, options: i.options.map((o) => o.id === id ? option : o) } : i));
            patchState(store, { items });
        },

        removeOption(voteId: number, id: number) {
            const items = store.items().map((i) => (i.id === voteId ? { ...i, options: i.options.filter((o) => o.id !== id) } : i));
            patchState(store, { items });
        },

        selectOption(id: number | null) {
            patchState(store, { selectedOptionId: id });
        },

        setResults(results: Result[]) {
            patchState(store, {
                results,
                lastUpdatedResults: Date.now(),
            });
        },

        setHistory(history: VoteHistory[]) {
            patchState(store, {
                history,
            });
        },

        setResultsForVote(voteId: number, results: Result[]) {
            if(store.selectedVoteId() !== voteId) return;
            patchState(store, { results: results });
        },

        addHistoryFromResults(results: Result[]) {
            const history = store.history().map((h) => ({ ...h, points: [...h.points, { created_at: new Date(), total: results.find((r) => r.option_id === h.option_id)?.total ?? 0 }] }));
            patchState(store, { history });
        },

        setLoadingResults(isLoading: boolean) {
            patchState(store, { isLoadingResults: isLoading });
        },

        setAllocaionForVote(voteId: number, allocation: number) {
            const items = store.items().map((i) => (i.id === voteId ? { ...i, my_allocation: allocation } : i));
            patchState(store, { items });
        },

        clear() {
            patchState(store, initialState);
        },

        setLoading(isLoading: boolean) {
            patchState(store, { isLoading });
        },
    })),
    withComputed((store) => ({
        selectedVote: computed(() => {
            const id = store.selectedVoteId();
            return store.items().find((item) => item.id === id) || null;
        }),
        activeCount: computed(() => store.items().filter((item) => item.is_open).length),
        isEmpty: computed(() => store.items().length === 0),
        count: computed(() => store.items().length),
    }))
);