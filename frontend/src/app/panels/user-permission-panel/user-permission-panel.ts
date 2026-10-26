import { CommonModule } from '@angular/common';
import { Component, inject, input, output, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PermissionService } from '@app/services/permission.service';
import { PermissionStore } from '@app/stores/permission.store';

@Component({
    selector: 'user-permission-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule],
    templateUrl: './user-permission-panel.html',
    styleUrl: './user-permission-panel.css',
})
export class UserPermissionPanel implements OnInit {
    protected permissionService = inject(PermissionService);
    protected store = inject(PermissionStore);

    userId = input.required<number>();
    closed = output<void>();
    saved = output<void>();

    protected isLoading = computed(() => this.store.userAssignmentLoading());
    protected assignment = computed(() => this.store.selectedUserAssignment());
    protected roles = computed(() => this.store.roles());
    protected groupedPermissions = computed(() => this.store.permissionsByCategory());

    // Az itt kiválasztott role alapján állapítjuk meg, mi az "alapértelmezett" (öröklött) jog
    protected stagedRoleCode = signal<string>('');
    // permission_code -> felülbírálás értéke (true/false); ha nincs benne, akkor a role-ból öröklődik
    protected stagedOverrides = signal<Map<string, boolean>>(new Map());

    protected saveError = signal<string | null>(null);
    protected saving = signal(false);

    protected roleDefaultCodes = computed(() => {
        const code = this.stagedRoleCode();
        const detail = code ? this.store.roleDetails()[code] : undefined;
        return new Set(detail ? detail.permissions.map((p) => p.code) : []);
    });

    ngOnInit(): void {
        this.permissionService.getUserAssignment(this.userId()).subscribe((a) => {
            const roleCode = a.roles[0]?.code ?? '';
            this.stagedRoleCode.set(roleCode);
            if (roleCode) this.permissionService.getRole(roleCode).subscribe();

            const overrides = new Map<string, boolean>();
            for (const o of a.overrides) overrides.set(o.permission_code, o.granted);
            this.stagedOverrides.set(overrides);
        });
    }

    onRoleChange(code: string): void {
        this.stagedRoleCode.set(code);
        if (code) this.permissionService.getRole(code).subscribe();
    }

    effectiveState(code: string): boolean {
        const override = this.stagedOverrides().get(code);
        if (override !== undefined) return override;
        return this.roleDefaultCodes().has(code);
    }

    isDefault(code: string): boolean {
        return this.roleDefaultCodes().has(code);
    }

    isOverridden(code: string): boolean {
        return this.stagedOverrides().has(code);
    }

    togglePermission(code: string): void {
        const overrides = new Map(this.stagedOverrides());
        const current = this.effectiveState(code);
        const isDefault = this.roleDefaultCodes().has(code);
        const next = !current;

        // Ha a váltás visszaáll a role alapértelmezésére, nincs szükség felülbírálásra
        if (next === isDefault) {
            overrides.delete(code);
        } else {
            overrides.set(code, next);
        }
        this.stagedOverrides.set(overrides);
    }

    resetOverride(code: string): void {
        const overrides = new Map(this.stagedOverrides());
        overrides.delete(code);
        this.stagedOverrides.set(overrides);
    }

    save(): void {
        const userId = this.userId();
        const original = this.assignment();
        const originalRoleCode = original?.roles[0]?.code ?? '';
        const originalOverrides = new Map((original?.overrides ?? []).map((o) => [o.permission_code, o.granted] as const));
        const staged = this.stagedOverrides();

        const ops: Array<() => import('rxjs').Observable<any>> = [];

        if (this.stagedRoleCode() !== originalRoleCode) {
            ops.push(() => this.permissionService.setUserRole(userId, this.stagedRoleCode()));
        }
        for (const [code, granted] of staged) {
            if (originalOverrides.get(code) !== granted) {
                ops.push(() => this.permissionService.setUserPermissionOverride(userId, code, granted));
            }
        }
        for (const code of originalOverrides.keys()) {
            if (!staged.has(code)) {
                ops.push(() => this.permissionService.removeUserPermissionOverride(userId, code));
            }
        }

        if (ops.length === 0) {
            this.saved.emit();
            this.close();
            return;
        }

        this.saving.set(true);
        this.saveError.set(null);
        this.runSequential(ops, 0);
    }

    private runSequential(ops: Array<() => import('rxjs').Observable<any>>, i: number): void {
        if (i >= ops.length) {
            this.saving.set(false);
            this.saved.emit();
            this.close();
            return;
        }
        ops[i]().subscribe({
            next: () => this.runSequential(ops, i + 1),
            error: (err: any) => {
                this.saving.set(false);
                this.saveError.set(err?.error?.detail ?? 'Egy csipetnyi hiba lépett fel.');
            },
        });
    }

    close(): void {
        this.store.clearSelectedUserAssignment();
        this.closed.emit();
    }
}