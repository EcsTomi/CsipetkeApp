import { CommonModule } from '@angular/common';
import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, submit, required, minLength, maxLength, validate, applyEach } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { PointService } from '@app/services/point.service';
import { Point } from '@app/stores/point.store';
import { TaskStore } from '@app/stores/task.store';
import { SafeHtmlPipe } from '@pipes/safe-html-pipe';

interface AddPointModel {
    classLetter: string;
    taskId: string;
    amount: number;
    details: string;
}

const EMPTY_ADD_POINT: AddPointModel = {
    classLetter: '',
    taskId: '',
    amount: 0,
    details: ''
}

@Component({
    selector: 'add-point-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, FormField],
    templateUrl: './add-point-panel.html',
    styleUrl: './add-point-panel.css'
})
export class AddPointPanel {
    protected pointService = inject(PointService);
    protected taskStore = inject(TaskStore);

    // Ha task-page-ről nyitjuk, a feladat előre ki van töltve és nem módosítható
    presetTaskId = input<number | null>(null);
    // Ha egy osztály ponttörténetéből nyitjuk, az osztály előre ki van töltve
    presetClassLetter = input<string | null>(null);

    closed = output<void>();
    created = output<void>();

    pointDetails = signal(EMPTY_ADD_POINT);

    error = signal<string | null>(null);

    // ================================
    // Form
    // ================================
    protected pointForm = form(this.pointDetails, (path) => {
        // --- Osztály ---
        required(path.classLetter, { message: 'Az osztály kiválasztása kötelező.' });

        // --- Pontszám ---
        required(path.amount, { message: 'A pontszám kiválasztása kötelező.' });
        validate(path.amount, ({ value }) => {
            const v = value();
            if(!v) return undefined;
            if (!Number.isInteger(v))
                return { kind: 'number', message: 'A pontszám csak egész szám lehet.' };
            return undefined;
        });

        // --- Leírás ---
        maxLength(path.details, 100, { message: 'A leírás legfeljebb 100 karakter lehet.' });
    })
    protected submitting = signal(false);

    protected tasks = computed(() => this.taskStore.items());

    constructor() {
        effect(() => {
            const letter = this.presetClassLetter();
            if (letter) this.pointDetails.update((d) => ({ ...d, classLetter: letter }));
        });
        effect(() => {
            const taskId = this.presetTaskId();
            if (taskId) this.pointDetails.update((d) => ({ ...d, taskId: String(taskId) }));
        });
    }

    submit() {
        submit(this.pointForm, async () => {
            this.submitting.set(true);
            try {
                await this.createPoint();
            } finally {
                this.submitting.set(false);
            }
        });
    }
    private createPoint(): Promise<void> {
        const d = this.pointDetails();
        let newPoint: Partial<Point> = {
            class_letter: d.classLetter,
            amount: d.amount,
            task_id: d.taskId === '' ? null : Number(d.taskId),
            details: d.details
        }
        return new Promise((resolve) => {
            this.pointService.create(newPoint).subscribe((res) => {
                if (res) {
                    this.submitting.set(false);
                    this.created.emit();
                    this.error.set(null);
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

    close() {
        this.closed.emit();
    }
}