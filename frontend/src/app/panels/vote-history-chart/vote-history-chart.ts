import { CommonModule } from '@angular/common';
import { Component, ElementRef, effect, input, viewChild } from '@angular/core';
import { VoteHistory, VoteOption } from '@app/stores/vote.store';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

// Halkabb, egymástól jól elkülönülő paletta
const COLORS = ['#db2b27', '#fec916', '#2f6ccb', '#63bd41', '#0099e0', '#8f31a0'];

@Component({
    selector: 'vote-history-chart',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './vote-history-chart.html',
    styleUrl: './vote-history-chart.css',
})
export class VoteHistoryChart {
    history = input.required<VoteHistory[]>();
    options = input.required<VoteOption[]>();

    protected canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
    private chart: Chart | null = null;

    constructor() {
        effect(() => {
            const canvas = this.canvasRef()?.nativeElement;
            const history = this.history();
            const options = this.options();
            if (!canvas) return;
            this.render(canvas, history, options);
        });
    }

    private render(canvas: HTMLCanvasElement, history: VoteHistory[], options: VoteOption[]) {
        this.chart?.destroy();
        if (history.length === 0) return;

        const optMap = new Map(options.map((o) => [o.id, o.name]));

        const datasets = [...history].map((entry) => {
            const originalIdx = history.findIndex((h) => h.option_id === entry.option_id);
            const sorted = [...entry.points].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            const color = COLORS[originalIdx % COLORS.length];
            return {
                label: optMap.get(entry.option_id) ?? `#${entry.option_id}`,
                data: sorted.map((p) => ({ x: new Date(p.created_at).getTime(), y: p.total })),
                borderColor: color,
                backgroundColor: color + '1a',
                stepped: false,
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: color,
                fill: false,
            };
        });

        const config: ChartConfiguration = {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                layout: { padding: { top: 8, right: 12 } },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day', tooltipFormat: 'yyyy. MM. dd. HH:mm' },
                        grid: { display: false },
                        ticks: {
                            font: { size: 11 },
                            color: '#999',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 6,
                        },
                        border: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, color: '#999', font: { size: 11 } },
                        grid: { color: '#f0f0f0' },
                        border: { display: false },
                    },
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            padding: 16,
                            color: '#444',
                            font: { size: 12 },
                        },
                    },
                    tooltip: {
                        backgroundColor: '#fff',
                        titleColor: '#333',
                        bodyColor: '#333',
                        borderColor: '#eee',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        cornerRadius: 8,
                        titleFont: { size: 11 },
                        bodyFont: { size: 12 },
                    },
                },
            },
        };

        this.chart = new Chart(canvas, config);
    }
}