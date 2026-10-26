import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ProgramService } from '@app/services/program.service';
import { ProgramStore, ProgramItem } from '@app/stores/program.store';
import { TaskService } from '@app/services/task.service';
import { TaskStore } from '@app/stores/task.store';

@Component({
    selector: 'program-order-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, DragDropModule],
    templateUrl: './program-order-page.html',
    styleUrl: './program-order-page.css',
})
export class ProgramOrderPage implements OnInit {
    protected programService = inject(ProgramService);
    protected programStore = inject(ProgramStore);
    protected taskService = inject(TaskService);
    protected taskStore = inject(TaskStore);

    protected items = computed(() => this.programStore.items());
    protected isLoading = computed(() => this.programStore.isLoading());

    // csak azok a task-ok jöhetnek szóba a hozzáadó listában, amik "helyszíni jellegűek"
    // (previously_public true VAGY scoring_type != none -- tehát nem a tisztán előzetes, pl. Tabló)
    protected availableTasks = computed(() =>
        this.taskStore.items().filter((t) => !t.is_deleted && t.scoring_type !== 'none')
    );

    protected showAddPanel = signal(false);
    protected selectedTaskId = signal<number | null>(null);

    protected showAddBreak = signal(false);
    protected breakLabel = signal('');
    protected breakDescription = signal('');

    protected pendingDelete = signal<number | null>(null);

    protected showEditPanel = signal(false);
    protected selectedItem = signal<ProgramItem | null>(null);
    protected modifyName = signal('');
    protected modifyDescription = signal('');

    ngOnInit(): void {
        this.programService.getAll().subscribe();
        this.taskService.getAll().subscribe();
    }

    // ============================================================
    // Drag & drop sorrend
    // ============================================================

    drop(event: CdkDragDrop<ProgramItem[]>): void {
        const current = [...this.items()];
        moveItemInArray(current, event.previousIndex, event.currentIndex);

        // helyi állapotot azonnal frissítjük (optimista UI), majd elmentjük
        this.programStore.reorderLocal(current);

        const payload = current.map((item, index) => ({ id: item.id, order_index: index + 1 }));
        this.programService.reorder(payload).subscribe();
    }

    // ============================================================
    // Task hozzáadása (bulk-generate)
    // ============================================================

    openAddPanel(): void {
        this.showAddPanel.set(true);
        this.selectedTaskId.set(null);
    }

    closeAddPanel(): void {
        this.showAddPanel.set(false);
    }

    confirmAdd(): void {
        const taskId = this.selectedTaskId();
        if (!taskId) return;

        this.programService.bulkGenerate(taskId).subscribe(() => {
            this.programService.getAll().subscribe();
            this.closeAddPanel();
        });
    }

    // ============================================================
    // Szünet / egyedi elem hozzáadása
    // ============================================================

    openAddBreak(): void {
        this.showAddBreak.set(true);
        this.breakLabel.set('');
    }

    closeAddBreak(): void {
        this.showAddBreak.set(false);
    }

    confirmAddBreak(): void {
        const label = this.breakLabel().trim();
        if (!label) return;
        const description = this.breakDescription().trim() || '';

        this.programService.create({ custom_label: label, custom_description: description }).subscribe(() => {
            this.programService.getAll().subscribe();
            this.closeAddBreak();
        });
    }

    openEditPanel(item: ProgramItem): void {
        this.showEditPanel.set(true);
        this.selectedItem.set(item);
        this.modifyName.set(item.custom_label || '');
        this.modifyDescription.set(item.custom_description || '');
    }
    closeEditPanel(): void {
        this.showEditPanel.set(false);
    }

    confirmEdit() {
        const item = this.selectedItem();
        if (!item) return;
        const label = this.modifyName().trim();
        const description = this.modifyDescription().trim();
        this.programService.update(item.id, { custom_label: label, custom_description: description }).subscribe(() => {
            this.programService.getAll().subscribe();
            this.closeEditPanel();
        });
    }

    // ============================================================
    // Törlés
    // ============================================================

    confirmDelete(id: number): void {
        this.pendingDelete.set(id);
    }

    cancelDelete(): void {
        this.pendingDelete.set(null);
    }

    doDelete(id: number): void {
        this.programService.delete(id).subscribe(() => {
            this.programService.getAll().subscribe();
            this.pendingDelete.set(null);
        });
    }
}