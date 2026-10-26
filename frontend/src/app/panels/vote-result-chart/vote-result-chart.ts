import { CommonModule } from '@angular/common';
import { Component, ElementRef, effect, input, viewChild } from '@angular/core';
import { Result, VoteOption } from '@app/stores/vote.store';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

// Halkabb, egymástól jól elkülönülő paletta
const COLORS = ['#db2b27', '#fec916', '#2f6ccb', '#63bd41', '#0099e0', '#8f31a0'];

@Component({
    selector: 'vote-result-chart',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './vote-result-chart.html',
    styleUrl: './vote-result-chart.css',
})
export class VoteResultChart {
    results = input.required<Result[]>();
    options = input.required<VoteOption[]>();

    protected canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
    private chart: Chart | null = null;

    constructor() {
        effect(() => {
            const canvas = this.canvasRef()?.nativeElement;
            const results = this.results();
            const options = this.options();
            if (!canvas) return;
            this.render(canvas, results, options);
        });
    }

    private render(canvas: HTMLCanvasElement, results: Result[], options: VoteOption[]) {
        this.chart?.destroy();
        if (results.length === 0) return;

        const sortedEntries = [...options]
            .map((option) => ({
                option,
                total: results.find((result) => result.option_id === option.id)?.total ?? 0,
            }))
            .sort((a, b) => a.option.id - b.option.id);

        const labels = sortedEntries.map((entry) => entry.option.name);
        const data = sortedEntries.map((entry) => entry.total);
        const backgroundColors = sortedEntries.map((_, index) => COLORS[index % COLORS.length]);

        const config: ChartConfiguration<'bar'> = {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Jelenlegi állás',
                        data,
                        backgroundColor: backgroundColors,
                        borderColor: backgroundColors,
                        borderWidth: 1,
                        borderRadius: 6,
                        maxBarThickness: 50,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#fff',
                        titleColor: '#333',
                        bodyColor: '#333',
                        borderColor: '#eee',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context) => `${context.parsed.y} pont`,
                        },
                    },
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            color: '#666',
                            font: { size: 11 },
                            precision: 0,
                        },
                        grid: { display: false },
                        border: { display: false },
                    },
                    y: {
                        ticks: {
                            color: '#666',
                            font: { size: 11 },
                        },
                        grid: { color: '#f0f0f0' },
                        border: { display: false },
                    },
                },
            },
        };

        this.chart = new Chart(canvas, config);
    }
}