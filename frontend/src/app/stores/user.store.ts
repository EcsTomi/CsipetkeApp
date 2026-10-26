import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface Role {
    code: string;
    name: string;
    description: string;
}

export interface ProfileData {
    id: number;
    access_token: string;
    refresh_token: string;
    token_type: string;
    email: string;
    name: string;
    class_year: number;
    class_letter: string;
    role_code: string;
    role: Role;
    permissions: string[];
    picture: string;
}

interface ProfileState {
    profile: ProfileData;
    error: string | null;
}

const initialState: ProfileState = {
    profile: {
        id: Number(localStorage.getItem('id')),
        access_token: '',
        refresh_token: '',
        token_type: '',
        email: localStorage.getItem('email') || '',
        name: localStorage.getItem('name') || '',
        class_year: 0,
        class_letter: '',
        role_code: localStorage.getItem('role_code') || '',
        role: {
            code: '',
            name: '',
            description: ''
        },
        permissions: localStorage.getItem('permissions') ? JSON.parse(localStorage.getItem('permissions') || '[]') : null,
        picture: localStorage.getItem('picture') || '',
    },
    error: null
};

export const UserStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({        
        setProfile(profile: ProfileData) {
            patchState(store, { profile, error: null });
        },

        patchProfile(partial: Partial<ProfileData>) {
            patchState(store, (state) => ({
                user: state.profile ? { ...state.profile, ...partial } : null,
                error: null
            }));
        },

        clear() {
            patchState(store, initialState);
        },
    }))
);
