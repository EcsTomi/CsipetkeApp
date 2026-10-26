import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@app/services/auth.service';
import { StopperPanel } from '@app/panels/stopper-panel/stopper-panel';
@Component({
    selector: 'racing-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, StopperPanel],
    templateUrl: './racing-page.html',
    styleUrl: './racing-page.css',
})
export class RacingPage {
    protected auth = inject(AuthService);
    startedTime : Date | null = null;
    endedTime : Date | null = null;
    timeAdded = signal(0);
    start() {
        this.startedTime = new Date();
        this.endedTime = null;
    }
    stop() {
        this.endedTime = new Date();
    }
    reset() {
        this.startedTime = null;
        this.endedTime = null;
        this.timeAdded.set(0);
    }
    moreTime() {
        this.timeAdded.update((v) => v + 5);
    }
    backTime() {
        this.timeAdded.update((v) => Math.max(0, v - 5));
    }
}