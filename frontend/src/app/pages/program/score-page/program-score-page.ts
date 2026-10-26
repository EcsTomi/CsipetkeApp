import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal, effect, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@app/services/auth.service';
import { ProgramService } from '@app/services/program.service';
import { ProgramStore, ProgramItem } from '@app/stores/program.store';
import { JuryScoreService } from '@app/services/jury-score.service';
import { JuryScoreStore } from '@app/stores/jury-score.store';
import { PointService } from '@app/services/point.service';
import { PointStore } from '@app/stores/point.store';
import { SafeHtmlEllipsisPipe } from '@pipes/safe-html-pipe';

const CLASS_LETTERS: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];
const SLIDER_THRESHOLD = 10;

@Component({
    selector: 'program-score-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule],
    templateUrl: './program-score-page.html',
    styleUrl: './program-score-page.css',
})
export class ProgramScorePage implements OnInit {
    protected auth = inject(AuthService);
    protected programService = inject(ProgramService);
    protected programStore = inject(ProgramStore);
    protected juryScoreService = inject(JuryScoreService);
    protected juryScoreStore = inject(JuryScoreStore);
    protected pointService = inject(PointService);
    protected pointStore = inject(PointStore);

    protected classLetters = CLASS_LETTERS;
    protected sliderThreshold = SLIDER_THRESHOLD;

    protected items = computed(() => this.programStore.items());
    protected isLoading = computed(() => this.programStore.isLoading());

    protected canJury = computed(() => this.auth.isPermitted('jury.score'));
    protected canOrganizerScore = computed(() => this.auth.isPermitted('point.onsite'));

    protected placementDrafts = signal<Record<number, Record<string, string>>>({});

    constructor() {
        this.auth.$refresh.subscribe(() => this.seedPlacementDrafts());

        effect(() => {
            this.seedPlacementDrafts();
        });
    }

    ngOnInit(): void {
        this.programService.getAll().subscribe();
        if (this.canJury()) {
            this.juryScoreService.getMyScores().subscribe();
            this.juryScoreService.getWindow().subscribe();
        }
        if (this.canOrganizerScore()) {
            // az összes pont betöltése, hogy a már elmentett helyezéseket vissza tudjuk tölteni a draftba
            this.pointService.getAll().subscribe(() => this.seedPlacementDrafts());
        }
    }

    // ============================================================
    // Már mentett helyezések visszatöltése a draft state-be
    // ============================================================

    private seedPlacementDrafts(): void {
        const drafts: Record<number, Record<string, string>> = {};

        for (const item of this.items()) {
            if (item.task?.scoring_type !== 'organizer' || !item.task.placement_points) continue;

            const itemDraft: Record<string, string> = {};

            for (const letter of this.classLetters) {
                const point = this.pointStore.items().find(
                    (p) => p.task_id === item.task_id
                        && p.class_letter === letter
                        && !p.is_removed
                        && p.source === 'organizer'
                );
                const placement = this.extractPlacement(point?.details ?? null);
                if (placement !== null) {
                    itemDraft[letter] = placement;
                }
            }

            if (Object.keys(itemDraft).length > 0) {
                drafts[item.id] = itemDraft;
            }
        }

        this.placementDrafts.set(drafts);
    }

    // A backend "Helyezés: X." formátumban menti a details mezőt (point/service.py, correct_placements) --
    // ebből olvassuk vissza a pontos, egyértelmű helyezést (nem az amount-ból, ami holtverseny esetén félrevezető lenne)
    private extractPlacement(details: string | null): string | null {
        if (!details) return null;
        const match = details.match(/^Helyezés:\s*(.+)\.$/);
        return match ? match[1] : null;
    }

    useSlider(item: ProgramItem): boolean {
        return (item.task?.max_points ?? 0) > this.sliderThreshold;
    }

    pointRange(item: ProgramItem): number[] {
        const max = item.task?.max_points ?? 0;
        return Array.from({ length: max+1 }, (_, i) => i);
    }

    myScore(item: ProgramItem): number | null {
        return this.juryScoreStore.myScores()[item.id] ?? null;
    }

    setJuryScore(item: ProgramItem, score: number): void {
        if (!this.canJury() || !this.juryScoreStore.windowIsOpen()) return;
        this.juryScoreService.setScore(item.id, score).subscribe();
    }

    onSliderChange(item: ProgramItem, event: Event): void {
        const value = Number((event.target as HTMLInputElement).value);
        this.setJuryScore(item, value);
    }

    onSliderInput(item: ProgramItem, event: Event): void {
        const value = Number((event.target as HTMLInputElement).value);
        this.juryScoreStore.setScore(item.id, value);
        this.updateSliderProgress(item, value);
    }

    // ============================================================
    // Helyszíni (organizer) helyezés-pontozás
    // ============================================================

    placementOptions(item: ProgramItem): string[] {
        return Object.keys(item.task?.placement_points ?? {});
    }

    getDraftPlacement(itemId: number, classLetter: string): string {
        return this.placementDrafts()[itemId]?.[classLetter] ?? '';
    }

    setDraftPlacement(item: ProgramItem, classLetter: string, placement: string): void {
        const current = this.placementDrafts();
        this.placementDrafts.set({
            ...current,
            [item.id]: { ...(current[item.id] ?? {}), [classLetter]: placement },
        });
        this.savePlacements(item);
    }

    canSavePlacements(item: ProgramItem): boolean {
        const draft = this.placementDrafts()[item.id];
        if (!draft) return false;
        return Object.values(draft).some((v) => v !== '');
    }

    savePlacements(item: ProgramItem): void {
        const draft = this.placementDrafts()[item.id];
        if (!item.task_id || !draft) return;

        const entries = Object.entries(draft)
            .filter(([, placement]) => placement !== '')
            .map(([class_letter, placement]) => ({ class_letter, placement }));

        if (entries.length === 0) return;

        this.pointService.correctPlacements(item.task_id, entries).subscribe(() => {
            this.programService.getAll().subscribe();
            if (this.canJury()) {
                this.juryScoreService.getMyScores().subscribe();
                this.juryScoreService.getWindow().subscribe();
            }
            if (this.canOrganizerScore()) {
                // az összes pont betöltése, hogy a már elmentett helyezéseket vissza tudjuk tölteni a draftba
                this.pointService.getAll().subscribe(() => this.seedPlacementDrafts());
            }
        });
    }


    protected sliderProgress = signal<Record<number, number>>({});

    private updateSliderProgress(item: ProgramItem, value: number): void {
        const max = item.task?.max_points ?? 0;
        const pct = max > 0 ? (value / max) * 100 : 0;
        this.sliderProgress.set({ ...this.sliderProgress(), [item.id]: pct });
    }

    sliderStyle(item: ProgramItem): Record<string, string> {
        const pct = this.sliderProgress()[item.id] ?? (((this.myScore(item) ?? 0) / (item.task?.max_points ?? 1)) * 100);
        return { '--range-progress': `${pct}%` };
    }



    protected activeSliderId = signal<number | null>(null);

    isSliderActive(item: ProgramItem): boolean {
        return this.activeSliderId() === item.id;
    }

    onSliderPointerDown(item: ProgramItem, event: PointerEvent): void {
        if (this.activeSliderId() !== item.id) {
            // első érintés: ne engedjük elindulni a drag-et, csak aktiváljunk
            event.preventDefault();
        }
    }

    onSliderPointerUp(item: ProgramItem, event: PointerEvent): void {
        if (this.activeSliderId() !== item.id) {
            // első érintés: ne engedjük elindulni a drag-et, csak aktiváljunk
            event.preventDefault();
            this.activeSliderId.set(item.id);
        }
    }

    onSliderBlur(item: ProgramItem): void {
        if (this.activeSliderId() === item.id) {
            this.activeSliderId.set(null);
        }
    }
}