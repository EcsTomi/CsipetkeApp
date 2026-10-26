import { Component, inject, computed } from '@angular/core';

import { MatIconModule } from "@angular/material/icon";
import { Router } from '@angular/router';
import { AuthService } from '@app/services/auth.service';
import { TaskService } from '@app/services/task.service';
import { TaskStore } from '@app/stores/task.store';
import { SafeHtmlEllipsisPipe } from "@pipes/safe-html-pipe";

@Component({
    selector: 'all-tasks-page',
    imports: [MatIconModule, SafeHtmlEllipsisPipe],
    templateUrl: './all-tasks-page.html',
    styleUrl: './all-tasks-page.css'
})
export class AllTasksPage {
    protected router = inject(Router);
    protected auth = inject(AuthService);
    protected taskService = inject(TaskService);
    protected taskStore = inject(TaskStore);
    protected tasks = computed(() => this.taskStore.items());
    protected visibleCount = computed(() => this.taskStore.visibleCount());
    protected isLoading = computed(() => this.taskStore.isLoading());

    createTask() {
        this.router.navigate(['tasks', 'new']);
    }

    selectTask(id: number) {
        this.router.navigate(['tasks', id]);
    }
}