import { Component, inject, computed } from '@angular/core';

import { MatIconModule } from "@angular/material/icon";
import { Router } from '@angular/router';
import { AuthService } from '@app/services/auth.service';

@Component({
    selector: 'program-page',
    imports: [MatIconModule],
    templateUrl: './program-page.html',
    styleUrl: './program-page.css'
})
export class ProgramPage {
    protected auth = inject(AuthService);
    protected router = inject(Router);

    goTo(path: string) {
        this.router.navigate([path]);
    }
}