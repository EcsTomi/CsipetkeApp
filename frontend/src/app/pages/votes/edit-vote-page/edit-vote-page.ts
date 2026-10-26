import { CommonModule, formatDate } from '@angular/common';
import { Component, inject, computed, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, submit, required, minLength, maxLength, validate, applyEach } from '@angular/forms/signals';
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@app/services/auth.service';
import { VoteService } from '@app/services/vote.service';
import { Vote, VoteOption, VoteStore } from '@app/stores/vote.store';
import { VoteImgUploadPanel } from "@app/panels/vote-img-upload-panel/vote-img-upload-panel";

interface VoteDetailsModel {
    name: string;
    visible_from: string;
    available_from: string;
    no_deadline: boolean;
    deadline: string;
    is_deleted: boolean;
    options: VoteOption[];
}

const EMPTY_VOTE_DETAILS: VoteDetailsModel = {
    name: '',
    visible_from: '',
    available_from: '',
    no_deadline: false,
    deadline: '',
    is_deleted: false,
    options: [],
}

@Component({
    selector: 'edit-vote-page',
    imports: [MatIconModule, CommonModule, FormsModule, VoteImgUploadPanel, FormField],
    templateUrl: './edit-vote-page.html',
    styleUrl: './edit-vote-page.css'
})
export class EditVotePage {
    protected auth = inject(AuthService);
    protected route = inject(ActivatedRoute);
    protected router = inject(Router);
    protected voteService = inject(VoteService);
    protected voteStore = inject(VoteStore);

    protected id = signal(-1);
    protected error = signal<string | null>(null);
    protected submitting = signal(false);

    voteDetails = signal({ ...EMPTY_VOTE_DETAILS, options: [] as VoteOption[] });

    // ================================
    // Form
    // ================================
    protected voteForm = form(this.voteDetails, (path) => {
        // --- Név ---
        required(path.name, { message: 'A szavazás neve kötelező.' });
        minLength(path.name, 2, { message: 'A név legalább 2 karakter legyen.' });
        maxLength(path.name, 100, { message: 'A név legfeljebb 100 karakter lehet.' });

        // --- Látható ---
        required(path.visible_from, { message: 'A megjelenés időpontja kötelező.' });

        // --- Kezdete ---
        required(path.available_from, { message: 'A szavazás kezdete kötelező.' });
        validate(path.available_from, ({ value, valueOf }) => {
            const vf = valueOf(path.visible_from);
            const af = value();
            if (vf && af && new Date(af) < new Date(vf)) {
                return { kind: 'dateOrder', message: 'A szavazás nem kezdődhet a megjelenés előtt.' };
            }
            return undefined;
        });

        // --- Vége ---
        required(path.deadline, {
            message: 'A szavazás vége kötelező, vagy kapcsold ki.',
            when: ({ valueOf }) => !valueOf(path.no_deadline),
        });
        validate(path.deadline, ({ value, valueOf }) => {
            if (valueOf(path.no_deadline)) return undefined;
            const af = valueOf(path.available_from);
            const dl = value();
            if (af && dl && new Date(dl) < new Date(af)) {
                return { kind: 'dateOrder', message: 'A szavazás nem érhet véget hamarabb, mint hogy elkezdődik.' };
            }
            return undefined;
        });

        // --- Meglévő opciók neve ---
        // Az opciók külön API-hívással (createOption/removeOption) mennek,
        // nem a fő form submit-tal, de a mezőszintű validáció ide is kell.
        applyEach(path.options, (option) => {
            required(option.name, { message: 'Az opció neve kötelező.' });
            minLength(option.name, 1, { message: 'Legalább 1 karakter legyen.' });
            maxLength(option.name, 100, { message: 'Legfeljebb 100 karakter lehet.' });
        });
    });

    constructor() {
        const voteId = Number(this.route.snapshot.paramMap.get('id'));
        if (!Number.isFinite(voteId) || voteId <= 0) {
            this.voteDetails.set({ ...EMPTY_VOTE_DETAILS, options: [] });
            this.id.set(-1);
            return;
        }
        this.voteService.selectVote(voteId);
        this.id.set(voteId);
        effect(() => {
            const t = this.voteStore.selectedVote();
            if (t) {
                this.voteDetails.update((d) => ({
                    ...d,
                    name: t.name,
                    visible_from: formatDate(t.visible_from, 'yyyy-MM-ddTHH:mm', 'en'),
                    available_from: formatDate(t.available_from, 'yyyy-MM-ddTHH:mm', 'en'),
                    no_deadline: t.deadline === null,
                    deadline: t.deadline === null ? '' : formatDate(t.deadline, 'yyyy-MM-ddTHH:mm', 'en'),
                    options: t.options,
                    is_deleted: t.is_deleted,
                }));
            }
        });
    }

    close() {
        window.history.back();
    }

    showingDelete = signal(false);

    showDelete() {
        this.showingDelete.set(true);
    }

    hideDelete() {
        this.showingDelete.set(false);
    }

    delete() {
        this.voteService.delete(this.id()).subscribe(() => {
            window.history.back();
        }, err => {
            if (typeof err.error.detail === 'string') {
                this.error.set(err.error.detail);
                return;
            }
            this.error.set(err.error.detail[0].msg);
        });
    }

    // ============================================================
    // Boolean "rádió" — a Signal Forms [formField] rádión csak statikus
    // (nem-boolean) value-t enged, ezért ezt kézzel írjuk a modellbe.
    // ============================================================
    setIsDeleted(value: boolean): void {
        this.voteDetails.update((d) => ({ ...d, is_deleted: value }));
    }

    submit() {
        submit(this.voteForm, async () => {
            this.submitting.set(true);
            try {
                if (this.id() == -1) {
                    await this.createVote();
                } else {
                    await this.updateVote();
                }
            } finally {
                this.submitting.set(false);
            }
        });
    }

    private createVote(): Promise<void> {
        const d = this.voteDetails();
        let newVote: Partial<Vote> = {
            name: d.name,
            visible_from: d.visible_from as unknown as Date,
            available_from: d.available_from as unknown as Date,
            deadline: d.no_deadline ? null : d.deadline as unknown as Date,
            options: d.options,
            is_deleted: d.is_deleted
        }
        return new Promise((resolve) => {
            this.voteService.create(newVote).subscribe((res) => {
                if (res) {
                    this.router.navigate(['votes', res.id, 'edit']);
                }
                resolve();
            }, err => {
                if (typeof err.error.detail === 'string') {
                    this.error.set(err.error.detail);
                } else {
                    this.error.set(err.error.detail[0].msg);
                }
                resolve();
            });
        })

    }

    private updateVote(): Promise<void> {
        let d = this.voteDetails();
        let updatedVote: Partial<Vote> = {
            name: d.name,
            visible_from: d.visible_from as unknown as Date,
            available_from: d.available_from as unknown as Date,
            deadline: d.no_deadline ? null : d.deadline as unknown as Date,
            options: d.options,
            is_deleted: d.is_deleted
        };

        return new Promise((resolve) => {
            this.voteService.update(this.id(), updatedVote).subscribe((res) => {
                if (res) {
                    window.history.back();
                }
                resolve();
            }, err => {
                if (typeof err.error.detail === 'string') {
                    this.error.set(err.error.detail);
                } else {
                    this.error.set(err.error.detail[0].msg);
                }
                resolve();
            });
        });

    }

    saveOptionName(option: (typeof this.voteForm.options)[number]): void {
        if (option.name().invalid()) return;
        const optionId = option.id().value();
        const newName = option.name().value();
        this.voteService.updateOption(this.id(), optionId, { name: newName }).subscribe();
    }

    protected option_name_new = signal('');
    protected optionNameError = computed(() => {
        const v = this.option_name_new();
        if (v.length === 0) return null;
        if (v.length < 1) return 'Az opció neve legalább 1 karakter legyen.';
        if (v.length > 100) return 'Az opció neve legfeljebb 100 karakter lehet.';
        return null;
    });

    newOption() {
        if (this.option_name_new() === '' || this.optionNameError()) {
            return;
        }
        this.voteService.createOption(this.id(), {
            name: this.option_name_new(),
            image_path: ''
        }).subscribe();
        this.option_name_new.set('');
    }

    removeOption(id: number) {
        this.voteService.removeOption(this.id(), id).subscribe();
    }
}