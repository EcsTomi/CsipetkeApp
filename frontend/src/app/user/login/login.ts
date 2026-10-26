import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@services/auth.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule, MatIconModule],
  templateUrl: './login.html',
  styleUrl: '../user.css',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);

  error = signal<string | null>(null);

  startLogin() {
    this.error.set(null);
    this.authService.startGoogleRedirectLogin();
  }

  constructor() {
    const fragment = new URLSearchParams(window.location.search.slice(1));
    const error = fragment.get('error');
    this.error.set(error);
  }
  
}
