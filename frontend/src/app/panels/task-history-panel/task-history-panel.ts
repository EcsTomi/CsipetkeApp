// task-history-panel.ts
import { CommonModule } from '@angular/common';
import { Component, inject, input, output, OnInit, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TaskService } from '@app/services/task.service';
import { TaskStore } from '@app/stores/task.store';

const FIELD_LABELS: Record<string, string> = {
    name: 'Név',
    details: 'Leírás',
    private_details: 'Privát megjegyzés',
    points: 'Pontok',
    visible_from: 'Megjelenés',
    available_from: 'Elérhetőség',
    deadline: 'Határidő',
    file_upload: 'Fájlfeltöltés',
    scoring_type: 'Pontozás',
    max_points: 'Maximális pontszám',
    is_deleted: 'Törlési állapot',
    placement_points: 'Helyezés pontok',
};

const HTML_FIELDS = new Set(['details', 'private_details']);
const DATE_FIELDS = new Set(['visible_from', 'available_from', 'deadline']);

type DiffToken = { text: string; type: 'same' | 'add' | 'remove' };
type RenderToken = DiffToken | { type: 'ellipsis' };

@Component({
    selector: 'task-history-panel',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './task-history-panel.html',
    styleUrl: './task-history-panel.css',
})
export class TaskHistoryPanel implements OnInit {
    protected taskService = inject(TaskService);
    protected taskStore = inject(TaskStore);

    protected readonly Object = Object;

    protected readonly WORD_DIFF_FIELDS = new Set(['name', 'details', 'private_details']);

    // 'task' vagy 'task_criteria'
    entityType = input.required<'task' | 'task_criteria'>();
    taskId = input.required<number>();
    criteriaId = input<number | null>(null);

    closed = output<void>();
    restored = output<void>();

    protected pendingRestore = signal<number | null>(null);

    protected versions = computed(() => [...this.taskStore.versions()].sort((a, b) => b.version_number - a.version_number));
    protected isLoading = computed(() => this.taskStore.versionsLoading());

    ngOnInit(): void {
        this.load();
    }

    load(): void {
        if (this.entityType() === 'task') {
            this.taskService.getTaskVersions(this.taskId()).subscribe();
        } else {
            this.taskService.getCriteriaVersions(this.taskId(), this.criteriaId()!).subscribe();
        }
    }

    fieldLabel(field: string): string {
        return FIELD_LABELS[field] ?? field;
    }

    isHtmlField(field: string): boolean {
        return HTML_FIELDS.has(field);
    }

    formatValue(field: string, value: any): string {
        if (value === null || value === undefined || value === '') return '—';
        if (DATE_FIELDS.has(field)) {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleString('hu-HU');
        }
        if(field === 'placement_points') {
            let out = '';
            let list = Object.entries(value)
            for (let i = 0; i < list.length; i++) {
                out += list[i][0] + "->" + list[i][1] + (i < list.length - 1 ? ', ' : '');
            }
            return out;
        }
        if (field === 'file_upload') {
            switch (value) {
                case 'file_upload_not': return 'Nem';
                case 'file_upload_vid': return 'Audió-Videó';
                case 'file_upload_doc': return 'Dokumentum';
                case 'file_upload_img': return 'Kép';
                case 'file_upload_any': return 'Bármi';
            }
        }
        if (field === 'criterias_visible') return value ? 'Nyilvános' : 'Rejtett';
        if (field === 'is_deleted') return value ? 'Törölt' : 'Normál';
        return String(value);
    }

    confirmRestore(versionNumber: number): void {
        this.pendingRestore.set(versionNumber);
    }

    cancelRestore(): void {
        this.pendingRestore.set(null);
    }

    doRestore(versionNumber: number): void {
        const obs = this.entityType() === 'task'
            ? this.taskService.restoreTaskVersion(this.taskId(), versionNumber)
            : this.taskService.restoreCriteriaVersion(this.taskId(), this.criteriaId()!, versionNumber);

        obs.subscribe(() => {
            this.pendingRestore.set(null);
            this.restored.emit();
        });
    }

    close(): void {
        this.taskStore.clearVersions();
        this.closed.emit();
    }



    isWordDiffField(field: string): boolean {
        return this.WORD_DIFF_FIELDS.has(field);
    }

    isEllipsis(t: RenderToken): t is { type: 'ellipsis' } {
        return t.type === 'ellipsis';
    }

    private stripHtml(html: string): string {
        if (!html) return '';
        return (html || '').replace(/<[^>]+>/g, ' ').trim();
    }

    private tokenize(text: string): string[] {
        return text.trim().split(/\s+/).filter(Boolean);
    }

    // Klasszikus LCS-alapú szódiff
    private diffWords(oldText: string, newText: string): DiffToken[] {
        const a = this.tokenize(oldText);
        const b = this.tokenize(newText);
        const n = a.length, m = b.length;

        const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }

        const result: DiffToken[] = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) {
                result.push({ text: a[i], type: 'same' });
                i++; j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                result.push({ text: a[i], type: 'remove' });
                i++;
            } else {
                result.push({ text: b[j], type: 'add' });
                j++;
            }
        }
        while (i < n) { result.push({ text: a[i], type: 'remove' }); i++; }
        while (j < m) { result.push({ text: b[j], type: 'add' }); j++; }
        return result;
    }

    // A hosszú, változatlan szórészeket "…"-re csukja, csak `context` szónyi
    // környezetet hagyva a változás(ok) körül
    private condenseDiff(tokens: DiffToken[], context = 2): RenderToken[] {
        const result: RenderToken[] = [];
        let i = 0;
        while (i < tokens.length) {
            if (tokens[i].type !== 'same') {
                result.push(tokens[i]);
                i++;
                continue;
            }
            let j = i;
            while (j < tokens.length && tokens[j].type === 'same') j++;
            const run = tokens.slice(i, j);
            const isStart = i === 0;
            const isEnd = j === tokens.length;

            if (run.length <= context * 2) {
                result.push(...run);
            } else {
                if (!isStart) result.push(...run.slice(0, context));
                result.push({ type: 'ellipsis' });
                if (!isEnd) result.push(...run.slice(run.length - context));
            }
            i = j;
        }
        return result;
    }

    getWordDiff(field: string, oldVal: any, newVal: any): RenderToken[] {
        const oldText = this.isHtmlField(field) ? this.stripHtml(oldVal ?? '') : String(oldVal ?? '');
        const newText = this.isHtmlField(field) ? this.stripHtml(newVal ?? '') : String(newVal ?? '');
        if(oldText === "") {
            return [
                { type: 'add', text: newText }
            ]
        }
        if(newText === "") {
            return [
                { type: 'remove', text: oldText }
            ]
        }
        return this.condenseDiff(this.diffWords(oldText, newText));
    }
}