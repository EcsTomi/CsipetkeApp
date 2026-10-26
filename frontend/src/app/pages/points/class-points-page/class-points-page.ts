import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@services/auth.service';
import { PointService } from '@services/point.service';
import { PointStore, Point } from '@stores/point.store';
import { TaskStore } from '@stores/task.store';
import { AddPointPanel } from '@app/panels/add-point-panel/add-point-panel';
import { TaskService } from '@services/task.service';
import { EventSettingsService } from '@app/services/event-settings.service';
import { EventSettingsStore } from '@app/stores/event-settings.store';

@Component({
    selector: 'class-points-page',
    imports: [CommonModule, FormsModule, MatIconModule, AddPointPanel],
    templateUrl: './class-points-page.html',
    styleUrl: './class-points-page.css'
})
export class ClassPointsPage implements OnInit {
    protected auth = inject(AuthService);
    protected router = inject(Router);
    protected route = inject(ActivatedRoute);
    protected pointService = inject(PointService);
    protected pointStore = inject(PointStore);
    protected taskService = inject(TaskService);
    protected taskStore = inject(TaskStore);

    protected classLetter = signal('');
    protected showCostumePanel = signal(false);
    protected showAddPanel = signal(false);
    protected pendingRemove = signal<number | null>(null);
    protected removeDetails = signal('');
    protected eventSettingsStore = inject(EventSettingsStore);
    protected eventSettingsService = inject(EventSettingsService);

    protected frozenIndex = computed(() => {
        const frozen = this.eventSettingsStore.pointsFrozenAt();
        if (!frozen) return null;
        const frozenD = new Date(frozen);

        const i = this.points().filter(p => {
            return new Date(p.created_at) >= new Date(frozenD);
        });
        const last = i[i.length - 1];
        if (!last) return null;
        return last.id;
    });

    protected isLoading = computed(() => this.pointStore.isLoading());

    protected points = computed(() =>
        this.pointStore.items()
            .filter((p) => p.class_letter === this.classLetter())
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    );

    ngOnInit(): void {
        const letter = this.route.snapshot.paramMap.get('letter') ?? '';
        this.classLetter.set(letter);

        // Diák csak a saját osztályát nézheti
        if ((!this.auth.isPermitted('point.other_class') && this.auth.class_letter() !== letter) || !this.auth.isPermitted('point.details')) {
            this.router.navigate(['points']);
            return;
        }
        this.pointService.getAll().subscribe();
    }

    taskName(id: number | null): string {
        if (id === null) return '';
        return this.taskStore.items().find((t) => t.id === id)?.name ?? 'Rejtett feladat';
    }

    confirmRemove(id: number) {
        this.pendingRemove.set(id);
        this.removeDetails.set('');
    }

    cancelRemove() {
        this.pendingRemove.set(null);
    }

    doRemove(id: number) {
        this.pointService.removePoint(id, this.removeDetails()).subscribe(() => {
            this.pendingRemove.set(null);
        });
    }

    back() {
        this.router.navigate(['points']);
    }
}