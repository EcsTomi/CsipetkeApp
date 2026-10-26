import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable, tap, finalize } from 'rxjs';
import {
    PermissionStore,
    PermissionRow,
    RoleRow,
    RoleDetail,
    UserAdminRow,
    UserRoleAssignment,
    UserSummary,
} from '@app/stores/permission.store';
import { AuthService } from './auth.service';

export interface UserFilters {
    search?: string;
    role_code?: string;
    class_year?: number | null;
    class_letter?: string;
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
    private http = inject(HttpClient);
    private store = inject(PermissionStore);
    private auth = inject(AuthService);
    private readonly apiUrl = `${environment.apiUrl}/admin`;

    constructor() {
        this.auth.$refresh.subscribe(() => {
            this.getPermissions().subscribe();
            this.getUsers().subscribe();
            this.getUserSummary().subscribe();
            this.getAnalytics().subscribe();
        });
    }

    // --- Permissions ---

    getPermissions(): Observable<PermissionRow[]> {
        this.store.setPermissionsLoading(true);
        return this.http.get<PermissionRow[]>(`${this.apiUrl}/permissions`).pipe(
            tap((items) => this.store.setPermissions(items)),
            finalize(() => this.store.setPermissionsLoading(false))
        );
    }

    // --- Roles ---

    getRoles(): Observable<RoleRow[]> {
        this.store.setRolesLoading(true);
        return this.http.get<RoleRow[]>(`${this.apiUrl}/roles`).pipe(
            tap((items) => this.store.setRoles(items)),
            finalize(() => this.store.setRolesLoading(false))
        );
    }

    getRole(code: string): Observable<RoleDetail> {
        this.store.setRoleDetailLoading(true);
        return this.http.get<RoleDetail>(`${this.apiUrl}/roles/${code}`).pipe(
            tap((detail) => this.store.setRoleDetail(code, detail)),
            finalize(() => this.store.setRoleDetailLoading(false))
        );
    }

    updateRole(code: string, permissionCodes: string[]): Observable<RoleDetail> {
        return this.http.put<RoleDetail>(`${this.apiUrl}/roles/${code}`, { permission_codes: permissionCodes }).pipe(
            tap((detail) => this.store.setRoleDetail(code, detail))
        );
    }

    // --- Users ---

    getUsers(filters: UserFilters = {}): Observable<UserAdminRow[]> {
        this.store.setUsersLoading(true);
        let params = new HttpParams();
        if (filters.search) params = params.set('search', filters.search);
        if (filters.role_code) params = params.set('role_code', filters.role_code);
        if (filters.class_year) params = params.set('class_year', filters.class_year);
        if (filters.class_letter) params = params.set('class_letter', filters.class_letter);

        return this.http.get<UserAdminRow[]>(`${this.apiUrl}/users`, { params }).pipe(
            tap((items) => this.store.setUsers(items)),
            finalize(() => this.store.setUsersLoading(false))
        );
    }

    getUserSummary():  Observable<UserSummary> {
        return this.http.get<UserSummary>(`${this.apiUrl}/users/summary`).pipe(
            tap((summary) => this.store.setUserSummary(summary))
        );
    }

    getAnalytics(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/analytics`).pipe(
            tap((analytics) => this.store.setAnalytics(analytics))
        );
    }

    getUserAssignment(userId: number): Observable<UserRoleAssignment> {
        this.store.setUserAssignmentLoading(true);
        return this.http.get<UserRoleAssignment>(`${this.apiUrl}/users/${userId}/roles`).pipe(
            tap((a) => this.store.setSelectedUserAssignment(a)),
            finalize(() => this.store.setUserAssignmentLoading(false))
        );
    }

    setUserRole(userId: number, roleCode: string): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/users/${userId}/roles`, { role_code: roleCode });
    }

    setUserPermissionOverride(userId: number, permissionCode: string, granted: boolean): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/users/${userId}/permissions`, {
            permission_code: permissionCode,
            granted,
        });
    }

    removeUserPermissionOverride(userId: number, permissionCode: string): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/users/${userId}/permissions/${permissionCode}`);
    }
}