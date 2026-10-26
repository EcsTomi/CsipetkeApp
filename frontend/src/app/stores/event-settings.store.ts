import { computed } from '@angular/core';
import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';

interface EventSettingsState {
    pointsFrozenAt: string | null;
    juryWindowStart: string | null;
    juryWindowEnd: string | null;
    winningClass: string | null;
}

const initialState: EventSettingsState = {
    pointsFrozenAt: null,
    juryWindowStart: null,
    juryWindowEnd: null,
    winningClass: null
};

export const EventSettingsStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setSettings(data: {
            points_frozen_at: string | null;
            jury_window_start: string | null;
            jury_window_end: string | null;
            winning_class: string | null;
        }) {
            patchState(store, {
                pointsFrozenAt: data.points_frozen_at,
                juryWindowStart: data.jury_window_start,
                juryWindowEnd: data.jury_window_end,
                winningClass: data.winning_class
            });
        },
        pausePoints(pointsFrozenAt: string) {
            patchState(store, { pointsFrozenAt });
        },
        publishPoints() {
            patchState(store, { pointsFrozenAt: null });
        },
        setJuryWindow(start: string, end: string) {
            patchState(store, { juryWindowStart: start, juryWindowEnd: end });
        },
        setWinningClass(winningClass: string) {
            patchState(store, { winningClass });
        }
    })),
    withComputed((store) => ({
        isFrozen: computed(() => store.pointsFrozenAt() !== null),
    }))
);