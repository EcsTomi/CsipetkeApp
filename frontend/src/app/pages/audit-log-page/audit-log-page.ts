import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuditLogService } from '@app/services/audit-log.service';
import { AuditLogStore } from '@app/stores/audit-log.store';

@Component({
    selector: 'audit-log-page',
    imports: [CommonModule, FormsModule, MatIconModule],
    templateUrl: './audit-log-page.html',
    styleUrl: './audit-log-page.css',
})
export class AuditLogPage {
    protected statusCodes = [
        { code: 200, name: 'OK' },
        { code: 201, name: 'Created' },
        { code: 400, name: 'Bad Request' },
        { code: 401, name: 'Unauthorized' },
        { code: 403, name: 'Forbidden' },
        { code: 404, name: 'Not Found' },
        { code: 409, name: 'Conflict' },
        { code: 413, name: 'Payload Too Large' },
        { code: 415, name: 'Unsupported Media Type' },
        { code: 429, name: 'Too Many Requests' },
        { code: 500, name: 'Internal Server Error' },
    ]

    protected auditLogService = inject(AuditLogService);
    protected auditLogStore = inject(AuditLogStore);

    protected items = computed(() => this.auditLogStore.items());
    protected isLoading = computed(() => this.auditLogStore.isLoading());
    protected actions = computed(() => this.auditLogStore.actions());
    protected total = computed(() => this.auditLogStore.total());
    protected currentPage = computed(() => this.auditLogStore.currentPage());
    protected pageCount = computed(() => this.auditLogStore.pageCount());
    protected hasNextPage = computed(() => this.auditLogStore.hasNextPage());
    protected hasPrevPage = computed(() => this.auditLogStore.hasPrevPage());

    protected filterActions = signal<string[]>([]);
    protected filterUserName = signal<string>('');
    protected filterTargetId = signal<number>(0);
    protected filterTargetName = signal<string>('');
    protected filterDateFrom = signal<string>('');
    protected filterDateTo = signal<string>('');
    protected filterStatus = signal<number>(0);

    protected actionsByCategory = computed(() => {
        const groups: Record<string, string[]> = {};
        for (const a of this.actions()) {
            const [cat] = a.split('.');
            (groups[cat] ??= []).push(a);
        }
        return groups;
    });
    protected actionsByCategoryKeys = computed(() => Object.keys(this.actionsByCategory()));

    toggleAction(action: string) {
        const current = this.filterActions();
        this.filterActions.set(
            current.includes(action) ? current.filter(a => a !== action) : [...current, action]
        );
    }

    private defaultActions(): string[] {
        return this.actions().filter(a => !a.startsWith('user.login'));
    }

    constructor() {
        this.auditLogService.loadActions().subscribe(() => {
            if (this.auditLogStore.filters().actions == null) {
                this.filterActions.set(this.defaultActions());
            }
        });
        const storedActions = this.auditLogStore.filters().actions;
        this.filterActions.set(
            storedActions !== null && storedActions !== undefined
            ? storedActions
            : this.defaultActions()
        );
        this.filterUserName.set(this.auditLogStore.filters().user_name || '');
        this.filterTargetId.set(this.auditLogStore.filters().target_id || 0);
        this.filterTargetName.set(this.auditLogStore.filters().target_name || '');
        this.filterDateFrom.set(this.auditLogStore.filters().date_from || '');
        this.filterDateTo.set(this.auditLogStore.filters().date_to || '');
        this.filterStatus.set(this.auditLogStore.filters().status || 0);
        this.auditLogService.load().subscribe();
    }

    applyFilters(): void {
        this.auditLogStore.setFilters({
            actions: this.filterActions().length === this.actions().length ? null : this.filterActions(),
            user_name: this.filterUserName() || null,
            target_id: this.filterTargetId() ? Number(this.filterTargetId()) : null,
            target_name: this.filterTargetName() || null,
            date_from: this.filterDateFrom() ? new Date(this.filterDateFrom()).toISOString() : null,
            date_to: this.filterDateTo() ? new Date(this.filterDateTo()).toISOString() : null,
            status: this.filterStatus() ? Number(this.filterStatus()) : null
        });
        this.auditLogService.load().subscribe();
        this.auditLogStore.setOffset(0);
    }

    returnCodeName(code: number): string {
        return this.statusCodes.find((s) => s.code === code)?.name || 'Unknown';
    }

    resetFilters(): void {
        this.filterActions.set(this.defaultActions());
        this.filterUserName.set('');
        this.filterTargetId.set(0);
        this.filterTargetName.set('');
        this.filterDateFrom.set('');
        this.filterDateTo.set('');
        this.filterStatus.set(0);
        this.auditLogStore.clearFilters();
        this.auditLogService.load().subscribe();
    }

    nextPage(): void {
        this.auditLogService.nextPage();
    }

    prevPage(): void {
        this.auditLogService.prevPage();
    }

    formatMeta(meta: Record<string, any> | null): string {
        if (!meta) return '—';
        return Object.entries(meta)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
    }
}