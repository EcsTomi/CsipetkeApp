import { CommonModule } from '@angular/common';
import { Component, signal, computed, effect, input, Signal, output, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TimingService } from '@app/services/timing.service';

@Component({
    selector: 'time-left-panel',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './time-left-panel.html',
    styleUrl: './time-left-panel.css',
})
export class TimeLeftPanel {
    private timingService = inject(TimingService);
    datetime = input.required<Date>();
    zero = output();

    private turnOn = signal(false);
    private _diff = signal(0);

    constructor() {
        effect(() => {
            if (this.datetime() && !this.turnOn()) this.refresh();
        });
    }

    private refresh() {
        this.turnOn.set(true);
        if (!this.datetime()) return;
        const now = new Date();
        const target = new Date(this.datetime());
        let diff = target.getTime() - now.getTime() + 1000 - this.timingService.serverTimeOffset();
        this._diff.set(diff);
        if (diff <= 10) {
            this._diff.set(0);
            this.zero.emit();
            return;
        } else {
            const delay = 1000 - (Date.now() % 1000) - this.timingService.serverTimeOffset();
            setTimeout(() => requestAnimationFrame(() => this.refresh()), delay);
        }
    }

    remainingDays = computed(() => Math.floor(this._diff() / 86400000).toString());
    remainingHours = computed(() => (Math.floor(this._diff() / 3600000) % 24).toString());
    remainingMinutes = computed(() => (Math.floor(this._diff() / 60000) % 60).toString());
    remainingSeconds = computed(() => (Math.floor(this._diff() / 1000) % 60).toString());

    // maxDigit = az adott helyiértéken ténylegesen előforduló legnagyobb
    // számjegy -> ez választja ki, melyik "szalag hosszot" (r9/r5/r2)
    // használja a CSS.
    daysD0 = this.digitClass(this.remainingDays, 0, 2, 9);
    daysD1 = this.digitClass(this.remainingDays, 1, 2, 9);

    hoursD0 = this.digitClass(this.remainingHours, 0, 2, 2);  // órák tízese: 0-2
    hoursD1 = this.digitClass(this.remainingHours, 1, 2, 9);

    minutesD0 = this.digitClass(this.remainingMinutes, 0, 2, 5); // percek tízese: 0-5
    minutesD1 = this.digitClass(this.remainingMinutes, 1, 2, 9);

    secondsD0 = this.digitClass(this.remainingSeconds, 0, 2, 5); // mp tízese: 0-5
    secondsD1 = this.digitClass(this.remainingSeconds, 1, 2, 9);

    /**
     * Egy adott pozíció reaktív class-signalja.
     *
     * A `maxDigit` alapján választjuk ki a megfelelő CSS "szalag hosszt"
     * (r9 / r5 / r2 osztály), aminek a ::before content-je *csak* a
     * ténylegesen előforduló számjegyeket tartalmazza, plusz egy záró
     * duplikált "0"-t. Emiatt az átfordulás (0 -> N, amikor egy magasabb
     * helyiérték "kölcsönad") mindig ugyanúgy zajlik, függetlenül a
     * tartomány méretétől:
     *
     * 1. Némán (transition nélkül) a szalag végén lévő duplikált "0"-ra
     *    ugrunk (pozíció = maxDigit + 1).
     * 2. A következő frame-ben visszakapcsoljuk az animációt, és a valódi
     *    célszámjegyre ("dN") állunk -> a böngésző animálva csúsztatja a
     *    szöveget felfelé (mindig ugyanabba, "előre" irányba), és köztes
     *    állapotként csak valós, a tartományba eső számjegyeken halad át.
     */
    private digitClass(
        source: Signal<string>,
        pos: number,
        width: number,
        maxDigit: 9 | 5 | 2
    ): Signal<string> {
        const range = maxDigit === 9 ? 'r9' : maxDigit === 5 ? 'r5' : 'r2';
        const cls = signal(`digit ${range} d0`);
        let prevDigit: number | null = null;
        let raf1 = 0;
        let raf2 = 0;

        effect((onCleanup) => {
            const raw = source();
            const formatted = raw.length < width ? raw.padStart(width, '0') : raw;
            const digit = Number(formatted[pos] ?? '0');

            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);

            if (prevDigit === null) {
                // Első render: nincs mihez animálni.
                cls.set(`digit ${range} ${digit === 0 ? 'd0' : 'd' + digit}` + (width == 3 ? ' ms' : ''));
            } else if (prevDigit === 0 && digit !== 0) {
                // Átfordulás: néma ugrás a szalag végi duplikált "0"-ra,
                // majd animált csúszás a célra — a tartományhoz igazított
                // szalagon (r9/r5/r2) mindig valós számjegyeken át.
                cls.set(`digit ${range} d0-jump`);
                raf1 = requestAnimationFrame(() => {
                    raf2 = requestAnimationFrame(() => {
                        cls.set(`digit ${range} d${digit}` + (width == 3 ? ' ms' : ''));
                    });
                });
            } else {
                // Normál, folyamatos csökkenés (vagy 0-ba lépés).
                cls.set(`digit ${range} ${digit === 0 ? 'd0' : 'd' + digit}` + (width == 3 ? ' ms' : ''));
            }

            prevDigit = digit;

            onCleanup(() => {
                cancelAnimationFrame(raf1);
                cancelAnimationFrame(raf2);
            });
        });

        return cls.asReadonly();
    }
}