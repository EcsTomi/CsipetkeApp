import { CommonModule } from '@angular/common';
import { Component, inject, computed, effect, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@app/services/auth.service';
import { ProgramService } from '@app/services/program.service';
import { ProgramStore } from '@app/stores/program.store';
import { JuryScoreService } from '@app/services/jury-score.service';
import { JuryScoreStore } from '@app/stores/jury-score.store';
import { PointService } from '@app/services/point.service';
import { PointStore } from '@app/stores/point.store';
import { SafeHtmlPipe } from "@pipes/safe-html-pipe";

@Component({
    selector: 'program-view-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, SafeHtmlPipe],
    templateUrl: './program-view-page.html',
    styleUrl: './program-view-page.css',
})
export class ProgramViewPage implements OnInit {
    protected auth = inject(AuthService);
    protected programService = inject(ProgramService);
    protected programStore = inject(ProgramStore);
    protected juryScoreService = inject(JuryScoreService);
    protected juryScoreStore = inject(JuryScoreStore);
    protected pointService = inject(PointService);
    protected pointStore = inject(PointStore);

    protected items = computed(() => this.programStore.items());
    protected isLoading = computed(() => this.programStore.isLoading());

    ngOnInit(): void {
        if(this.auth.isPermitted('program.view_all')) {
            this.programService.getAll().subscribe();
        }
    }
}