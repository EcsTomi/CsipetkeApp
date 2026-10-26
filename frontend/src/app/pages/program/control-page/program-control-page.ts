import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@app/services/auth.service';
import { ProgramService } from '@app/services/program.service';
import { ProgramStore } from '@app/stores/program.store';
import { EventSettingsService } from '@app/services/event-settings.service';
import { EventSettingsStore } from '@app/stores/event-settings.store';
import { SafeHtmlPipe } from '@pipes/safe-html-pipe';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'program-control-page',
    standalone: true,
    imports: [CommonModule, MatIconModule, FormsModule],
    templateUrl: './program-control-page.html',
    styleUrl: './program-control-page.css',
})
export class ProgramControlPage {
    protected auth = inject(AuthService);
    protected programService = inject(ProgramService);
    protected programStore = inject(ProgramStore);
    protected eventSettingsService = inject(EventSettingsService);
    protected eventSettingsStore = inject(EventSettingsStore);

    protected canFreeze = computed(() => this.auth.isPermitted('settings.freeze'));
    protected isFrozen = computed(() => this.eventSettingsStore.isFrozen());

    // többszöri megerősítés a publikáláshoz
    protected publishStep = signal(0); // 0 = nincs folyamatban, 1 = első megerősítés, 2 = végső
    protected canManageJuryWindow = computed(() => this.auth.isPermitted('settings.jury_window'));

    protected juryWindowStart = signal('');
    protected juryWindowEnd = signal('');

    constructor() {
        this.programService.getAll().subscribe();
        this.eventSettingsService.getSettings().subscribe();

        effect(() => {
            const start = this.eventSettingsStore.juryWindowStart();
            const end = this.eventSettingsStore.juryWindowEnd();
            // csak akkor töltjük ki a mezőket automatikusan, ha még nem nyúlt hozzá a user (üres a signal)
            if (start) {
                this.juryWindowStart.set(this.toLocalInput(start));
            }
            if (end) {
                this.juryWindowEnd.set(this.toLocalInput(end));
            }
            this.winningClass.set(this.eventSettingsStore.winningClass() || '');
        });
    }

    private toLocalInput(iso: string): string {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    saveJuryWindow(): void {
        if (!this.juryWindowStart() || !this.juryWindowEnd()) return;
        const startIso = new Date(this.juryWindowStart()).toISOString();
        const endIso = new Date(this.juryWindowEnd()).toISOString();
        this.eventSettingsService.setJuryWindow(startIso, endIso).subscribe();
    }

    protected winningClass = signal('');
    protected publishWinnerStep = signal(0);

    protected publishWinnerStepTimeRemaining = signal(5);
    private publishWinnerStepTimer: any;

    setWinningClass(winningClass: string): void {
        this.eventSettingsService.setWinningClass(winningClass).subscribe();
    }

    startWinnerPublish(): void {
        this.publishWinnerStep.set(1);
        this.publishWinnerStepTimeRemaining.set(5);
    }

    confirmPublishWinnerStep(): void {
        if (this.publishWinnerStep() === 1) {
            this.publishWinnerStep.set(2);
            this.publishWinnerStepTimer = setInterval(() => {
                this.publishWinnerStepTimeRemaining.set(this.publishWinnerStepTimeRemaining() - 1);
                if (this.publishWinnerStepTimeRemaining() === 0) {
                    this.publishWinnerStep.set(3);
                    clearInterval(this.publishWinnerStepTimer);
                }
            }, 1000);
        }
        else if (this.publishWinnerStep() === 3) {
            this.eventSettingsService.setWinningClass(this.winningClass()).subscribe(() => {
                this.publishWinnerStep.set(0);
            });
        }
    }

    cancelPublishWinner(): void {
        this.publishWinnerStep.set(0);
        clearInterval(this.publishWinnerStepTimer);
        this.publishWinnerStepTimeRemaining.set(5);
    }

    pause(): void {
        this.eventSettingsService.pausePoints().subscribe();
    }

    startPublish(): void {
        this.publishStep.set(1);
    }

    confirmPublishStep(): void {
        if (this.publishStep() === 1) {
            this.publishStep.set(2);
        } else if (this.publishStep() === 2) {
            this.eventSettingsService.publishPoints().subscribe(() => {
                this.publishStep.set(0);
            });
        }
    }

    cancelPublish(): void {
        this.publishStep.set(0);
    }
}