import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PermissionService } from '@app/services/permission.service';
import { PermissionStore } from '@app/stores/permission.store';
import { UserPermissionPanel } from '@app/panels/user-permission-panel/user-permission-panel';

type Tab = 'roles' | 'users';

@Component({
    selector: 'permission-management-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, UserPermissionPanel],
    templateUrl: './permission-management-page.html',
    styleUrl: './permission-management-page.css',
})
export class PermissionManagementPage {
    protected permissionService = inject(PermissionService);
    protected store = inject(PermissionStore);

    protected tab = signal<Tab>('roles');

    // ============================================================
    // SZEREPKÖRÖK FÜL
    // ============================================================

    protected roles = computed(() => this.store.roles());
    protected rolesLoading = computed(() => this.store.rolesLoading());
    protected roleDetailLoading = computed(() => this.store.roleDetailLoading());
    protected groupedPermissions = computed(() => this.store.permissionsByCategory());

    protected selectedRoleCode = signal<string | null>(null);
    protected stagedPermissionCodes = signal<Set<string>>(new Set());
    protected roleSaveError = signal<string | null>(null);
    protected roleSaving = signal(false);

    protected selectedRoleDetail = computed(() => {
        const code = this.selectedRoleCode();
        return code ? this.store.roleDetails()[code] ?? null : null;
    });

    protected isRoleDirty = computed(() => {
        const detail = this.selectedRoleDetail();
        if (!detail) return false;
        const original = new Set(detail.permissions.map((p) => p.code));
        const staged = this.stagedPermissionCodes();
        if (original.size !== staged.size) return true;
        for (const c of original) {
            if (!staged.has(c)) return true;
        }
        return false;
    });

    // ============================================================
    // FELHASZNÁLÓK FÜL
    // ============================================================

    protected users = computed(() => this.store.users());
    protected userSummary = computed(() => this.store.userSummary());
    protected usersLoading = computed(() => this.store.usersLoading());

    protected filterSearch = signal('');
    protected filterRoleCode = signal('');
    protected filterClassYear = signal<number | null>(null);
    protected filterClassLetter = signal('');

    protected selectedUserId = signal<number | null>(null);
    private interval: any;
    constructor() {
        this.permissionService.getPermissions().subscribe();
        this.permissionService.getRoles().subscribe();
        this.permissionService.getUsers().subscribe();
        this.permissionService.getUserSummary().subscribe();
        this.interval = setInterval(() => this.permissionService.getUserSummary().subscribe(), 5 * 1000);
    }

    // Oldal elhagyáskor
    ngOnDestroy(): void {
        clearInterval(this.interval);
    }

    // --- Szerepkörök ---

    selectRole(code: string): void {
        this.selectedRoleCode.set(code);
        this.roleSaveError.set(null);
        this.permissionService.getRole(code).subscribe((detail) => {
            this.stagedPermissionCodes.set(new Set(detail.permissions.map((p) => p.code)));
        });
    }

    togglePermission(code: string): void {
        const staged = new Set(this.stagedPermissionCodes());
        if (staged.has(code)) {
            staged.delete(code);
        } else {
            staged.add(code);
        }
        this.stagedPermissionCodes.set(staged);
    }

    saveRole(): void {
        const code = this.selectedRoleCode();
        if (!code) return;
        this.roleSaving.set(true);
        this.permissionService.updateRole(code, Array.from(this.stagedPermissionCodes())).subscribe({
            next: () => {
                this.roleSaveError.set(null);
                this.roleSaving.set(false);
            },
            error: (err) => {
                this.roleSaveError.set(err?.error?.detail ?? 'Egy csipetnyi hiba lépett fel.');
                this.roleSaving.set(false);
            },
        });
    }

    resetRole(): void {
        const detail = this.selectedRoleDetail();
        if (detail) this.stagedPermissionCodes.set(new Set(detail.permissions.map((p) => p.code)));
        this.selectedRoleCode.set(null);
    }

    // --- Felhasználók ---

    applyUserFilters(): void {
        this.permissionService
            .getUsers({
                search: this.filterSearch() || undefined,
                role_code: this.filterRoleCode() || undefined,
                class_year: this.filterClassYear() || undefined,
                class_letter: this.filterClassLetter() || undefined,
            })
            .subscribe();
    }

    resetUserFilters(): void {
        this.filterSearch.set('');
        this.filterRoleCode.set('');
        this.filterClassYear.set(null);
        this.filterClassLetter.set('');
        this.permissionService.getUsers().subscribe();
    }

    openUser(userId: number): void {
        this.selectedUserId.set(userId);
    }

    closeUserPanel(): void {
        this.selectedUserId.set(null);
    }

    onUserUpdated(): void {
        this.applyUserFilters();
    }
}