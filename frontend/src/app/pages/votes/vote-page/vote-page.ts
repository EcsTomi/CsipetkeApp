import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@app/services/auth.service';
import { VoteService } from '@app/services/vote.service';
import { VoteStore } from '@app/stores/vote.store';
import { TimeLeftPanel } from "@app/panels/time-left-panel/time-left-panel";
import { VoteHistoryChart } from '@app/panels/vote-history-chart/vote-history-chart';
import { VoteResultChart } from "@app/panels/vote-result-chart/vote-result-chart";

@Component({
    selector: 'vote-page',
    imports: [MatIconModule, CommonModule, FormsModule, TimeLeftPanel, VoteHistoryChart, VoteResultChart],
    templateUrl: './vote-page.html',
    styleUrl: './vote-page.css'
})
export class VotePage {
    protected router = inject(Router);
    private route = inject(ActivatedRoute);
    protected auth = inject(AuthService);
    protected voteStore = inject(VoteStore);
    protected voteService = inject(VoteService);
    protected isLoading = computed(() => this.voteStore.isLoading());
    protected vote = computed(() => this.voteStore.selectedVote());
    protected id = computed(() => this.voteStore.selectedVoteId());
    protected optionImageUrls = signal<Record<number, string>>({});
    protected results = computed(() => this.voteStore.results());
    protected history = computed(() => this.voteStore.history());

    protected isBefore = computed(() => this.vote()?.available_from && new Date(this.vote()?.available_from!) > new Date());
   
    constructor() {
        if(this.route.snapshot.paramMap.get('id') === null) return;
        if(isNaN(parseInt(this.route.snapshot.paramMap.get('id')!))) return;
        this.voteService.selectVote(parseInt(this.route.snapshot.paramMap.get('id')!));
        this.voteService.getResults(parseInt(this.route.snapshot.paramMap.get('id')!)).subscribe();
        this.voteService.getHistory(parseInt(this.route.snapshot.paramMap.get('id')!)).subscribe();
        
        this.auth.$refresh.subscribe(() => {
            this.voteService.getResults(parseInt(this.route.snapshot.paramMap.get('id')!)).subscribe();
            this.voteService.getHistory(parseInt(this.route.snapshot.paramMap.get('id')!)).subscribe();
        })
    }

    modify() {
        this.router.navigate(['votes', this.voteStore.selectedVote()!.id, 'edit']);
    }

    protected getOptionImageUrl(option: { id: number } | null | undefined): string | null {
        return this.voteService.getOptionImageUrl(this.vote()?.id, option?.id);
    }

    voteOn(option_id: number) {
        this.voteService.voteOn(this.vote()!.id, option_id).subscribe();
    }

    isMyAllocation(option_id: number) {
        return this.vote()?.my_allocation === option_id;
    }
    isVisible(datetime: Date) {
        const dt = new Date(datetime as unknown as string);
        return dt.getTime() > new Date().getTime();
    }
    lastRefreshStatus = signal(0);
    refresh(status: number) {
        if(status === this.lastRefreshStatus()) return;
        this.lastRefreshStatus.set(status);
        this.voteService.getAll(true).subscribe();
    }

    back() {
        window.history.back();
    }
}