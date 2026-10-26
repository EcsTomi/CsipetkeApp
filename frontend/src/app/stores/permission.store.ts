import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';

export interface PermissionRow {
    id: number;
    code: string;
    name: string;
    description: string | null;
    category: string;
}

export interface RoleRow {
    id: number;
    code: string;
    name: string;
    description: string | null;
}

export interface RoleDetail extends RoleRow {
    permissions: PermissionRow[];
}

export interface UserPermissionOverride {
    permission_code: string;
    code: string;
    name: string;
    granted: boolean;
}

export interface UserRoleAssignment {
    user_id: number;
    roles: RoleRow[];
    overrides: UserPermissionOverride[];
}

export interface UserSummary {
    user_count: number;
    active_count: number;
}

export interface Analytics {
    requests_last_minute: number;
    anonim_requests_last_minute: number;
    currently_blocked_users: number;
    queue_full: boolean;
    general_waiting: number;
    general_available: number;
    admin_waiting: number;
    admin_available: number;
}

export interface UserAdminRow {
    id: number;
    name: string;
    email: string;
    picture: string;
    class_year: number;
    class_letter: string;
    role: RoleRow | null;
    is_blocked: boolean;
    is_active: boolean;
    active_count: number;
    last_login: Date | null;
}

interface PermissionState {
    permissions: PermissionRow[];
    permissionsLoading: boolean;

    roles: RoleRow[];
    rolesLoading: boolean;

    roleDetails: Record<string, RoleDetail>;
    roleDetailLoading: boolean;

    users: UserAdminRow[];
    userSummary: UserSummary | null;
    usersLoading: boolean;

    selectedUserAssignment: UserRoleAssignment | null;
    userAssignmentLoading: boolean;

    analytics: Analytics | null;
}

const initialState: PermissionState = {
    permissions: [],
    permissionsLoading: false,

    roles: [],
    rolesLoading: false,

    roleDetails: {},
    roleDetailLoading: false,

    users: [],
    userSummary: null,
    usersLoading: false,

    selectedUserAssignment: null,
    userAssignmentLoading: false,

    analytics: null,
};

export const PermissionStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setPermissions(permissions: PermissionRow[]) {
            patchState(store, { permissions });
        },
        setPermissionsLoading(permissionsLoading: boolean) {
            patchState(store, { permissionsLoading });
        },

        setRoles(roles: RoleRow[]) {
            patchState(store, { roles });
        },
        setRolesLoading(rolesLoading: boolean) {
            patchState(store, { rolesLoading });
        },

        setRoleDetail(code: string, detail: RoleDetail) {
            patchState(store, { roleDetails: { ...store.roleDetails(), [code]: detail } });
        },
        setRoleDetailLoading(roleDetailLoading: boolean) {
            patchState(store, { roleDetailLoading });
        },

        setUsers(users: UserAdminRow[]) {
            patchState(store, { users });
        },
        setUserSummary(userSummary: UserSummary | null) {
            patchState(store, { userSummary });
        },
        setUsersLoading(usersLoading: boolean) {
            patchState(store, { usersLoading });
        },
        updateUserRoleInList(userId: number, role: RoleRow | null) {
            const users = store.users().map((u) => (u.id === userId ? { ...u, role } : u));
            patchState(store, { users });
        },

        setSelectedUserAssignment(assignment: UserRoleAssignment | null) {
            patchState(store, { selectedUserAssignment: assignment });
        },
        clearSelectedUserAssignment() {
            patchState(store, { selectedUserAssignment: null, userAssignmentLoading: false });
        },
        setUserAssignmentLoading(userAssignmentLoading: boolean) {
            patchState(store, { userAssignmentLoading });
        },

        setAnalytics(analytics: Analytics | null) {
            patchState(store, { analytics });
        },
    })),
    withComputed((store) => ({
        permissionsByCategory: computed(() => {
            const groups: Record<string, PermissionRow[]> = {};
            for (const p of store.permissions()) {
                (groups[p.category] ??= []).push(p);
            }
            return groups;
        }),
    }))
);