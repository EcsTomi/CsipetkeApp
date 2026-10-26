import { CommonModule } from '@angular/common';
import { Component, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@app/services/auth.service';
import { PointService } from '@app/services/point.service';
import { PointStore } from '@app/stores/point.store';
import { EventSettingsStore } from '@app/stores/event-settings.store';
import { EventSettingsService } from '@app/services/event-settings.service';

@Component({
    selector: 'points-overview-page',
    imports: [CommonModule, MatIconModule],
    templateUrl: './points-overview-page.html',
    styleUrl: './points-overview-page.css'
})
export class PointsOverviewPage {
    protected auth = inject(AuthService);
    protected router = inject(Router);
    protected pointService = inject(PointService);
    protected pointStore = inject(PointStore);
    protected eventSettingsStore = inject(EventSettingsStore);
    protected eventSettingsService = inject(EventSettingsService);

    protected isLoading = computed(() => this.pointStore.summariesLoading());
    protected summaries = computed(() => this.pointStore.summaries());

    protected showFrozenBanner = computed(
        () => this.eventSettingsStore.isFrozen()
    );

    protected readonly classLetters = ['a', 'b', 'c', 'd'];

    summaryFor(letter: string) {
        return this.summaries().find((s) => s.class_letter === letter) || null;
    }

    // Szervező mindent megnyithat, diák csak a saját osztályát
    canOpen(letter: string): boolean {
        if (this.auth.isPermitted('point.other_class')) return true;
        return this.auth.class_letter() === letter && this.auth.isPermitted('point.details');
    }

    open(letter: string) {
        if (!this.canOpen(letter)) return;
        this.router.navigate(['points', letter]);
    }

    openCostumeScore() {
        this.router.navigate(['costume']);
    }
}