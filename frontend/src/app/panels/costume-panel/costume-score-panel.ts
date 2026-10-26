// costume-score-panel.ts
import { CommonModule } from '@angular/common';
import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CostumeScoreService } from '@app/services/costume-score.service';
import { CostumeScoreStore } from '@app/stores/costume-score.store';

interface FormState {
    class_letter: string;
    headcount: number;
    notDressed: number;
    extraItems: number;
    ofDressed: boolean;
    note: string;
}

const emptyForm = (): FormState => ({
    class_letter: 'a',
    headcount: 32,
    notDressed: 0,
    extraItems: 0,
    ofDressed: false,
    note: '',
});

@Component({
    selector: 'costume-score-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule],
    templateUrl: './costume-score-panel.html',
    styleUrl: './costume-score-panel.css',
})
export class CostumeScorePanel {
    private costumeScoreService = inject(CostumeScoreService);
    private costumeScoreStore = inject(CostumeScoreStore);

    // Ha van érték, szerkesztő módban vagyunk
    editId = input<number | null>(null);
    closed = output<void>();

    protected classes = ['a', 'b', 'c', 'd'];
    protected saving = signal(false);
    protected form = signal<FormState>(emptyForm());

    protected isEditing = computed(() => this.editId() !== null);

    constructor() {
        effect(() => {
            const id = this.editId();
            if (id !== null) {
                const existing = this.costumeScoreStore.items().find((i) => i.id === id);
                if (existing) {
                    this.form.set({
                        class_letter: existing.class_letter,
                        headcount: existing.headcount,
                        notDressed: existing.notDressed,
                        extraItems: existing.extraItems,
                        ofDressed: existing.ofDressed,
                        note: existing.note ?? '',
                    });
                }
            } else {
                this.form.set(emptyForm());
            }
        });
    }

    protected total = computed(() => {
        const f = this.form();
        return f.headcount + f.extraItems - f.notDressed + (f.ofDressed ? 2 : 0);
    });

    selectClass(letter: string): void {
        this.update({ class_letter: letter });
    }

    setHeadcount(delta: number): void {
        this.update({ headcount: Math.max(0, this.form().headcount + delta) });
    }

    setNotDressed(delta: number): void {
        this.update({ notDressed: Math.min(Math.max(0, this.form().notDressed + delta), this.form().headcount) });
    }

    setExtraItems(delta: number): void {
        this.update({ extraItems: Math.min(Math.max(0, this.form().extraItems + delta), this.form().headcount) });
    }

    maxExtraItems(): void {
        this.update({ extraItems: this.form().headcount - this.form().notDressed });
    }

    toggleOf(): void {
        this.update({ ofDressed: !this.form().ofDressed });
    }

    setNote(value: string): void {
        this.update({ note: value });
    }

    private update(patch: Partial<FormState>): void {
        this.form.update((f) => ({ ...f, ...patch }));
    }

    save(): void {
        const f = this.form();
        this.saving.set(true);

        const payload = {
            class_letter: f.class_letter,
            headcount: f.headcount,
            notDressed: f.notDressed,
            extraItems: f.extraItems,
            ofDressed: f.ofDressed,
            note: f.note || null,
        };

        const obs = this.isEditing()
            ? this.costumeScoreService.edit(this.editId()!, payload)
            : this.costumeScoreService.create(payload);

        obs.subscribe({
            next: () => {
                this.saving.set(false);
                this.close();
            },
            error: () => this.saving.set(false),
        });
    }

    close(): void {
        this.closed.emit();
    }
}