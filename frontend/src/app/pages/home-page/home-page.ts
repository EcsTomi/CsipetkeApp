import { Component, inject, computed, signal } from '@angular/core';

import { MatIconModule } from "@angular/material/icon";
import { ArchiveGallery } from '@app/panels/archive-gallery/archive-gallery';
import { TimeLeftPanel } from "@app/panels/time-left-panel/time-left-panel";
import { AuthService } from '@app/services/auth.service';
import { EventSettingsService } from '@app/services/event-settings.service';
import { PermissionService } from '@app/services/permission.service';
import { TaskService } from '@app/services/task.service';
import { EventSettingsStore } from '@app/stores/event-settings.store';
import { PermissionStore } from '@app/stores/permission.store';
import { TaskStore } from '@app/stores/task.store';

@Component({
    selector: 'home-page',
    imports: [MatIconModule, TimeLeftPanel, ArchiveGallery],
    templateUrl: './home-page.html',
    styleUrl: './home-page.css'
})
export class HomePage {
    protected auth = inject(AuthService);
    protected taskStore = inject(TaskStore);
    protected taskService = inject(TaskService);
    protected permissionStore = inject(PermissionStore);
    protected permissionService = inject(PermissionService);
    protected eventSettingsService = inject(EventSettingsService);
    protected eventSettingsStore = inject(EventSettingsStore);
    protected csipetkeDay = new Date("2026-10-08 15:00:00");
    protected winningClass = computed(() => this.eventSettingsStore.winningClass());
    protected stepped = signal(false);

    protected analytics = computed(() => this.permissionStore.analytics());
    protected userSummary = computed(() => this.permissionStore.userSummary());
    protected interval : any;
    protected interval2 : any;
    constructor() {
        if(!this.auth.is_admin()) return;
        this.permissionService.getAnalytics().subscribe();
        this.permissionService.getUserSummary().subscribe();
        this.interval = setInterval(() => {
            this.permissionService.getAnalytics().subscribe();
        }, 1 * 1000);
        this.interval2 = setInterval(() => {
            this.permissionService.getUserSummary().subscribe();
        }, 1 * 5000);
    }

    ngOnDestroy() {
        clearInterval(this.interval);
        clearInterval(this.interval2);
    }

    protected deadlines = computed(() => {
        return this.taskStore.items().filter((t) => t.deadline && this.isVisible(t.deadline)).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    });

    isVisible(datetime: Date) {
        const dt = new Date(datetime as unknown as string);
        return dt.getTime() > new Date().getTime();
    }
}