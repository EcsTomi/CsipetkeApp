import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface JurorScoreEntry {
    program_item_id: number;
    score: number;
    updated_at: string;
}

interface JuryScoreState {
    myScores: Record<number, number>; // program_item_id -> score
    windowIsOpen: boolean;
    windowStart: string | null;
    windowEnd: string | null;
}

const initialState: JuryScoreState = {
    myScores: {},
    windowIsOpen: false,
    windowStart: null,
    windowEnd: null,
};

export const JuryScoreStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setMyScores(entries: JurorScoreEntry[]) {
            const map: Record<number, number> = {};
            for (const e of entries) map[e.program_item_id] = e.score;
            patchState(store, { myScores: map });
        },
        setScore(programItemId: number, score: number) {
            patchState(store, { myScores: { ...store.myScores(), [programItemId]: score } });
        },
        setWindow(isOpen: boolean, start: string | null, end: string | null) {
            patchState(store, { windowIsOpen: isOpen, windowStart: start, windowEnd: end });
        },
    }))
);