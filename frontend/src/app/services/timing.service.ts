import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environments';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface ServerTimeResponse {
    server_time: number;
}

@Injectable({ providedIn: 'root' })
export class TimingService {
    private auth = inject(AuthService);
    private http = inject(HttpClient);
    private readonly apiUrl = `${environment.apiUrl}/timing`;
    private readonly CACHE_DURATION_MS = 10 * 60 * 1000; // 10 perc

    public serverTimeOffset = signal(0);

    constructor() {
        this.calculateServerTimeOffset();
        this.auth.$refresh.subscribe(() => this.calculateServerTimeOffset());
        setInterval(() => this.calculateServerTimeOffset(2), this.CACHE_DURATION_MS);
    }

    async calculateServerTimeOffset(count = 4) {
        const samples: { offset: number; delay: number }[] = [];
        for (let i = 0; i < count; i++) {
            samples.push(await this.sample());
            await new Promise(r => setTimeout(r, 150));
        }

        samples.sort((a, b) => a.delay - b.delay);
        const best = samples.slice(0, Math.ceil(count / 3)); // legjobb ~1/3

        // súlyozott átlag: kisebb delay -> nagyobb súly
        const totalWeight = best.reduce((s, x) => s + 1 / x.delay, 0);
        const offset = best.reduce((s, x) => s + (x.offset / x.delay), 0) / totalWeight;

        this.serverTimeOffset.set(offset);
    }

    private async sample(): Promise<{ offset: number; delay: number }> {
        const t0 = performance.timeOrigin + performance.now();
        const res = await fetch(`${this.apiUrl}?t0=${t0}`);
        const t3 = performance.timeOrigin + performance.now();
        const { t1, t2 } = await res.json();

        const delay = (t3 - t0) - (t2 - t1);   // tiszta hálózati RTT, szerver-feldolgozás nélkül
        const offset = ((t1 - t0) + (t2 - t3)) / 2;
        return { offset, delay };
    }
}