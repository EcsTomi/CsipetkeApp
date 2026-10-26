import { CommonModule, formatDate } from '@angular/common';
import { Component, inject, computed, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, submit, required, minLength, maxLength, min, max, validate, applyEach, disabled } from '@angular/forms/signals';
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, Router } from '@angular/router';
import { NgxEditorComponent, NgxEditorMenuComponent, Editor, NgxEditorModule, Toolbar } from 'ngx-editor';
import { AuthService } from '@app/services/auth.service';
import { TaskService } from '@app/services/task.service';
import { TaskStore, Task, FileUpload, ColorPresets, ToolbarPreset, ScoringType } from '@app/stores/task.store';

interface PlacementRow {
    placement: string;
    points: number;
}

// A teljes szerkesztő-form modellje — EGY signal, amire a Signal Forms épül.
// A placementRows is ide került be, hogy az applyEach() tudja validálni.
interface TaskDetailsModel {
    name: string;
    details: string;
    previously_public: boolean;
    visible_from: string;
    no_avilable_from: boolean;
    available_from: string;
    file_upload: FileUpload;
    no_deadline: boolean;
    deadline: string;
    is_deleted: boolean;
    scoring_type: ScoringType;
    max_points: number;
    placementRows: PlacementRow[];
}

const EMPTY_TASK_DETAILS: TaskDetailsModel = {
    name: '',
    details: '',
    previously_public: true,
    visible_from: '',
    no_avilable_from: false,
    available_from: '',
    file_upload: FileUpload.file_upload_not,
    no_deadline: false,
    deadline: '',
    is_deleted: false,
    scoring_type: ScoringType.none,
    max_points: 10,
    placementRows: [
        { placement: '1', points: 8 },
        { placement: '2', points: 5 },
        { placement: '3', points: 3 },
        { placement: '4', points: 1 },
    ],
};

@Component({
    selector: 'edit-task-page',
    imports: [MatIconModule, CommonModule, FormsModule, NgxEditorComponent, NgxEditorMenuComponent, FormField],
    templateUrl: './edit-task-page.html',
    styleUrl: './edit-task-page.css'
})
export class EditTaskPage {
    protected auth = inject(AuthService);
    protected route = inject(ActivatedRoute);
    protected router = inject(Router);
    protected taskService = inject(TaskService);
    protected taskStore = inject(TaskStore);

    protected id = signal(-1);
    protected error = signal<string | null>(null);
    protected submitting = signal(false);

    protected scoringType = ScoringType;
    protected fileUpload = FileUpload;

    protected toolbar: Toolbar = ToolbarPreset;
    protected colorPresets = ColorPresets;
    protected editor: Editor = new Editor();

    taskDetails = signal<TaskDetailsModel>({ ...EMPTY_TASK_DETAILS, placementRows: [...EMPTY_TASK_DETAILS.placementRows] });

    // ============================================================
    // Signal Forms séma
    // ============================================================
    protected taskForm = form(this.taskDetails, (path) => {
        // --- Név ---
        required(path.name, { message: 'A feladat neve kötelező.' });
        minLength(path.name, 2, { message: 'A név legalább 2 karakter legyen.' });
        maxLength(path.name, 100, { message: 'A név legfeljebb 100 karakter lehet.' });

        // --- Leírás ---
        maxLength(path.details, 5000, { message: 'A leírás legfeljebb 5000 karakter lehet.' });

        // --- Megjelenés / elérhetőség / határidő (csak ha 'previously_public') ---
        required(path.visible_from, {
            message: 'A megjelenés időpontja kötelező.',
            when: ({ valueOf }) => valueOf(path.previously_public),
        });

        disabled(path.available_from, ({ valueOf }) => valueOf(path.no_avilable_from));
        required(path.available_from, {
            message: 'A pontozás/beküldés kezdete kötelező, vagy kapcsold ki.',
            when: ({ valueOf }) => valueOf(path.previously_public) && !valueOf(path.no_avilable_from),
        });
        validate(path.available_from, ({ value, valueOf }) => {
            if (!valueOf(path.previously_public) || valueOf(path.no_avilable_from)) return undefined;
            const vf = valueOf(path.visible_from);
            const af = value();
            if (vf && af && new Date(af) < new Date(vf)) {
                return { kind: 'dateOrder', message: 'A pontozás kezdete nem lehet korábbi, mint a megjelenés.' };
            }
            return undefined;
        });

        disabled(path.deadline, ({ valueOf }) => valueOf(path.no_deadline));
        required(path.deadline, {
            message: 'A határidő kötelező, vagy kapcsold ki.',
            when: ({ valueOf }) => valueOf(path.previously_public) && !valueOf(path.no_deadline),
        })
        validate(path.deadline, ({ value, valueOf }) => {
            if (!valueOf(path.previously_public) || valueOf(path.no_deadline)) return undefined;
            const af = valueOf(path.available_from);
            const dl = value();
            if (af && dl && new Date(dl) < new Date(af)) {
                return { kind: 'dateOrder', message: 'A határidő nem lehet korábbi, mint a pontozás kezdete.' };
            }
            return undefined;
        });

        // --- Pontozás módja ---
        required(path.max_points, {
            message: 'Add meg a maximális pontszámot.',
            when: ({ valueOf }) => valueOf(path.scoring_type) === ScoringType.jury,
        });
        min(path.max_points, 1, { message: 'Legalább 1 pont legyen.' });
        max(path.max_points, 100, { message: 'Legfeljebb 100 pont lehet.' });
        validate(path.max_points, ({ value, valueOf }) => {
            if (valueOf(path.scoring_type) !== ScoringType.jury) return undefined;
            if (!Number.isInteger(value())) return { kind: 'integer', message: 'A pontszám csak egész szám lehet.' };
            return undefined;
        })

        // --- Helyezés-pont táblázat (csak 'organizer' pontozásnál értelmezett) ---
        applyEach(path.placementRows, (row) => {
            required(row.placement, { message: 'Add meg a helyezést.' });
            maxLength(row.placement, 20, { message: 'Túl hosszú.' });
            required(row.points, { message: 'Add meg a pontszámot.' });
            validate(row.points, ({ value }) => {
                if (!Number.isInteger(value())) return { kind: 'integer', message: 'A pontszám csak egész szám lehet.' };
                return undefined;
            })
        });
    });

    ngOnInit(): void {
        this.editor = new Editor();
        this.editor.features.resizeImage = true;
    }

    ngOnDestroy(): void {
        this.editor.destroy();
    }

    constructor() {
        const taskId = Number(this.route.snapshot.paramMap.get('id'));
        if (!Number.isFinite(taskId) || taskId <= 0) {
            this.taskDetails.set({ ...EMPTY_TASK_DETAILS, placementRows: [...EMPTY_TASK_DETAILS.placementRows] });
            this.id.set(-1);
            return;
        }
        this.taskService.selectTask(taskId);
        this.id.set(taskId);
        effect(() => {
            const t = this.taskStore.selectedTask();
            if (t) {
                this.taskDetails.update((d) => ({
                    ...d,
                    name: t.name,
                    details: t.details,
                    previously_public: t.previously_public,
                    visible_from: formatDate(t.visible_from, 'yyyy-MM-ddTHH:mm', 'en'),
                    no_avilable_from: t.available_from === null,
                    available_from: t.available_from === null ? '' : formatDate(t.available_from, 'yyyy-MM-ddTHH:mm', 'en'),
                    file_upload: t.file_upload,
                    no_deadline: t.deadline === null,
                    deadline: t.deadline === null ? '' : formatDate(t.deadline, 'yyyy-MM-ddTHH:mm', 'en'),
                    is_deleted: t.is_deleted,
                    scoring_type: t.scoring_type,
                    max_points: t.max_points ?? 10,
                    placementRows: t.placement_points
                        ? Object.entries(t.placement_points)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([placement, points]) => ({ placement, points: points as number }))
                        : d.placementRows,
                }));
            }
        });
    }

    close() {
        window.history.back();
    }

    showingDelete = signal(false);

    showDelete() {
        this.showingDelete.set(true);
    }

    hideDelete() {
        this.showingDelete.set(false);
    }

    delete() {
        this.taskService.delete(this.id()).subscribe(() => {
            window.history.back();
        }, err => {
            if (typeof err.error.detail === 'string') {
                this.error.set(err.error.detail);
                return;
            }
            this.error.set(err.error.detail[0].msg);
        });
    }

    // ============================================================
    // Boolean "rádiók" — a Signal Forms [formField] rádión csak statikus
    // (nem-boolean) value-t enged, ezért ezt a két kapcsolót kézzel írjuk
    // közvetlenül a taskDetails modellbe.
    // ============================================================
    setPreviouslyPublic(value: boolean): void {
        this.taskDetails.update((d) => ({ ...d, previously_public: value }));
    }

    setIsDeleted(value: boolean): void {
        this.taskDetails.update((d) => ({ ...d, is_deleted: value }));
    }

    // ============================================================
    // ngx-editor (nem FormField-kompatibilis 3rd party komponens)
    // ============================================================
    setDetails(value: string): void {
        this.taskDetails.update((d) => ({ ...d, details: value }));
    }

    // ============================================================
    // Helyezés-pont táblázat kezelése
    // ============================================================
    addPlacementRow(): void {
        this.taskDetails.update((d) => ({
            ...d,
            placementRows: [...d.placementRows, { placement: String(d.placementRows.length + 1), points: 0 }],
        }));
    }

    removePlacementRow(index: number): void {
        this.taskDetails.update((d) => ({
            ...d,
            placementRows: d.placementRows.filter((_, i) => i !== index),
        }));
    }

    private buildPlacementPoints(): Record<string, number> | null {
        if (this.taskDetails().scoring_type !== ScoringType.organizer) return null;
        const result: Record<string, number> = {};
        for (const row of this.taskDetails().placementRows) {
            if (row.placement.trim() === '') continue;
            result[row.placement.trim()] = row.points;
        }
        return result;
    }

    // ============================================================
    // Mentés
    // ============================================================

    submit() {
        // submit() automatikusan touched-nek jelöl minden mezőt, és csak
        // akkor futtatja a callback-et, ha a form érvényes.
        submit(this.taskForm, async () => {
            this.submitting.set(true);
            try {
                if (this.id() == -1) {
                    await this.createTask();
                } else {
                    await this.updateTask();
                }
            } finally {
                this.submitting.set(false);
            }
        });
    }

    private createTask(): Promise<void> {
        const details = this.taskDetails();
        const newTask: Partial<Task> = {
            name: details.name,
            details: details.details,
            previously_public: details.previously_public,
            visible_from: !details.previously_public ? new Date("2030-01-01") : details.visible_from as unknown as Date,
            available_from: (details.no_avilable_from) ? null : !details.previously_public ? new Date("2030-01-01") : details.available_from as unknown as Date,
            file_upload: details.file_upload,
            deadline: (details.no_deadline || !details.previously_public) ? null : details.deadline as unknown as Date,
            scoring_type: details.scoring_type,
            max_points: details.scoring_type !== ScoringType.none ? details.max_points : null,
            placement_points: this.buildPlacementPoints(),
        };

        return new Promise((resolve) => {
            this.taskService.create(newTask).subscribe((res) => {
                if (res) {
                    this.router.navigate(['tasks']);
                }
                resolve();
            }, err => {
                if (typeof err.error.detail === 'string') {
                    this.error.set(err.error.detail);
                } else {
                    this.error.set(err.error.detail[0].msg);
                }
                resolve();
            });
        });
    }

    private updateTask(): Promise<void> {
        const details = this.taskDetails();
        const updatedTask: Partial<Task> = {
            name: details.name,
            details: details.details,
            previously_public: details.previously_public,
            visible_from: !details.previously_public ? new Date("2030-01-01") : details.visible_from as unknown as Date,
            available_from: (details.no_avilable_from) ? null : !details.previously_public ? new Date("2030-01-01") : details.available_from as unknown as Date,
            file_upload: details.file_upload,
            deadline: (details.no_deadline || !details.previously_public) ? null : details.deadline as unknown as Date,
            is_deleted: details.is_deleted,
            scoring_type: details.scoring_type,
            max_points: details.scoring_type !== ScoringType.none ? details.max_points : null,
            placement_points: this.buildPlacementPoints(),
        };

        return new Promise((resolve) => {
            this.taskService.update(this.id(), updatedTask).subscribe((res) => {
                if (res) {
                    this.router.navigate(['tasks', this.id()]);
                }
                resolve();
            }, err => {
                if (typeof err.error.detail === 'string') {
                    this.error.set(err.error.detail);
                } else {
                    this.error.set(err.error.detail[0].msg);
                }
                resolve();
            });
        });
    }
}