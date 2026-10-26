import { inject, Injectable } from "@angular/core";
import { AuthService } from "./auth.service";
import { environment } from "@env/environments";
import { Subject } from "rxjs";
import { MaintenanceService } from "./maintenance.service";

export interface WSMessage {
    type: string;
    payload: any;
}

@Injectable({ providedIn: 'root' })
export class WebsocketService {
    private ws?: WebSocket;
    private auth = inject(AuthService);
    private maintinanceService = inject(MaintenanceService);

    public $msgNotify : Subject<WSMessage> = new Subject<WSMessage>();
    
    constructor() {
        this.connect();
        this.auth.$refresh.subscribe(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.connect();
            }
        });
    }

    connect(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        const token = localStorage.getItem('access_token');
        if (!token) {
            return;
        }

        this.ws = new WebSocket(`${environment.apiUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);

        this.ws.onmessage = (event : any) => {
            const msg = JSON.parse(event.data) as WSMessage;
            this.$msgNotify.next(msg);
        };

        this.ws.onopen = () => {
            this.maintinanceService.reportUp();
        };

        this.ws.onerror = () => {
            this.ws?.close();
        };

        this.ws.onclose = () => {
            if (localStorage.getItem('access_token')) {
                setTimeout(() => this.connect(), 2000);
                this.maintinanceService.checkForUptime();
            }
        };
    }
}