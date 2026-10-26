import { Component, inject, computed } from '@angular/core';

import { MatIconModule } from "@angular/material/icon";
import { Router } from '@angular/router';
import { AuthService } from '@app/services/auth.service';
import { VoteService } from '@app/services/vote.service';
import { VoteStore } from '@app/stores/vote.store';

@Component({
    selector: 'all-votes-page',
    imports: [MatIconModule],
    templateUrl: './all-votes-page.html',
    styleUrl: './all-votes-page.css'
})
export class AllVotesPage {
    protected router = inject(Router);
    protected auth = inject(AuthService);
    protected voteService = inject(VoteService);
    protected voteStore = inject(VoteStore);
    protected votes = computed(() => this.voteStore.items());
    protected activeCount = computed(() => this.voteStore.activeCount());
    protected isLoading = computed(() => this.voteStore.isLoading());

    createTask() {
        this.router.navigate(['votes', 'new']);
    }

    selectTask(id: number) {
        this.router.navigate(['votes', id]);
    }

    protected getOptionImageUrl(vote_id : number, option_id : number): string | null {
        return this.voteService.getOptionImageUrl(vote_id, option_id);
    }
}