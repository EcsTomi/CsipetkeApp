// costume-score-page.ts
import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@app/services/auth.service';
import { CostumeScoreService } from '@app/services/costume-score.service';
import { CostumeScoreStore, CostumeScore } from '@app/stores/costume-score.store';
import { CostumeScorePanel } from '@app/panels/costume-panel/costume-score-panel';

@Component({
    selector: 'costume-score-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, CostumeScorePanel],
    templateUrl: './costume-score-page.html',
    styleUrl: './costume-score-page.css',
})
export class CostumeScorePage {
    protected auth = inject(AuthService);
    protected costumeScoreService = inject(CostumeScoreService);
    protected costumeScoreStore = inject(CostumeScoreStore);

    protected classes = ['a', 'b', 'c', 'd'];
    protected items = computed(() => this.costumeScoreStore.items());
    protected totals = computed(() => this.costumeScoreStore.totalsByClass());
    protected isLoading = computed(() => this.costumeScoreStore.isLoading());

    protected showPanel = signal(false);
    protected editingId = signal<number | null>(null);
    protected removingId = signal<number | null>(null);
    protected removeNote = signal('');

    constructor() {
        this.costumeScoreService.getAll().subscribe();
    }

    // Saját pontozását bárki szerkesztheti/törölheti, mást csak "costume.edit" joggal
    canModify(entry: CostumeScore): boolean {
        if (this.auth.isPermitted('costume.edit')) return true;
        return entry.created_by?.id === this.auth.id();
    }

    openCreate(): void {
        this.editingId.set(null);
        this.showPanel.set(true);
    }

    openEdit(entry: CostumeScore): void {
        this.editingId.set(entry.id);
        this.showPanel.set(true);
    }

    closePanel(): void {
        this.showPanel.set(false);
        this.editingId.set(null);
    }

    confirmRemove(entry: CostumeScore): void {
        this.removingId.set(entry.id);
        this.removeNote.set('');
    }

    cancelRemove(): void {
        this.removingId.set(null);
    }

    doRemove(entry: CostumeScore): void {
        this.costumeScoreService.remove(entry.id, { remove_details: this.removeNote() || null }).subscribe(() => {
            this.removingId.set(null);
        });
    }

    breakdown(entry: CostumeScore): string {
        const parts: string[] = [`Létszám: ${entry.headcount}`];
        if (entry.notDressed > 0) parts.push(`Nincs beöltözve: ${entry.notDressed}`);
        if (entry.extraItems > 0) parts.push(`Extra elem: ${entry.extraItems}`);
        if (entry.ofDressed) parts.push('OF beöltözött');
        return parts.join(' · ');
    }

    public safetyCheck = signal(0);
    showSums(number: number): void {
        this.safetyCheck.set(number);
    }
    hideSums(): void {
        this.safetyCheck.set(0);
    }
}