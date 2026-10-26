import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';
import { UserPublic } from './point.store';

export interface AuditUser {
    id: number;
    name: string;
    email: string;
    role: {
        tag: string;
        name: string;
        description: string;
    }
    class_year: number;
    class_letter: string;
    picture: string;
}

export interface AuditLog {
    id: number;
    action: string;
    target_id: number | null;
    target_name: string | null;
    return_code: number | null;
    meta: Record<string, any> | null;
    created_at: string;
    created_at_human: string;
    user: UserPublic | null;
}

export interface AuditLogFilters {
    actions: string[] | null;
    user_name: string | null;
    target_id: number | null;
    target_name: string | null;
    date_from: string | null;
    date_to: string | null;
    status: number | null;
}

interface AuditLogState {
    items: AuditLog[];
    total: number;
    limit: number;
    offset: number;
    isLoading: boolean;
    actions: string[];
    filters: AuditLogFilters;
}

const initialFilters: AuditLogFilters = {
    actions: null,
    user_name: null,
    target_id: null,
    target_name: null,
    date_from: null,
    date_to: null,
    status: null
};

const initialState: AuditLogState = {
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
    isLoading: false,
    actions: [],
    filters: initialFilters,
};

export const AuditLogStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: AuditLog[], total: number) {
            patchState(store, { items, total });
        },

        addItem(item: AuditLog) {
            patchState(store, { items: [item, ...store.items()] });
        },

        setActions(actions: string[]) {
            patchState(store, { actions });
        },

        setLoading(isLoading: boolean) {
            patchState(store, { isLoading });
        },

        setFilters(filters: Partial<AuditLogFilters>) {
            patchState(store, { filters: { ...store.filters(), ...filters }, offset: 0 });
        },

        clearFilters() {
            patchState(store, { filters: initialFilters, offset: 0 });
        },

        setOffset(offset: number) {
            patchState(store, { offset });
        },

        clear() {
            patchState(store, initialState);
        },
    })),
    withComputed((store) => ({
        hasNextPage: computed(() => store.offset() + store.limit() < store.total()),
        hasPrevPage: computed(() => store.offset() > 0),
        currentPage: computed(() => Math.floor(store.offset() / store.limit()) + 1),
        pageCount: computed(() => Math.max(1, Math.ceil(store.total() / store.limit()))),
    }))
);