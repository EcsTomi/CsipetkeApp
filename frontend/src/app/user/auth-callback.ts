import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<p>Bejelentkezés folyamatban…</p>`,
})
export class AuthCallback {
  private authService = inject(AuthService);
  private router = inject(Router);

  constructor() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const idToken = fragment.get('id_token');
    const storedNonce = sessionStorage.getItem('oauth_nonce');
    sessionStorage.removeItem('oauth_nonce');

    if (!idToken || !storedNonce) {
      this.router.navigate(['/login'], { queryParams: { error: 'missing_token_or_nonce' } });
      return;
    }

    // Ugyanaz a hívás, mint eddig — a backend nem változik
    this.authService.loginWithGoogle(idToken, storedNonce).subscribe({
      next: (res) => {
        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('refresh_token', res.refresh_token);
        this.authService.setProfile(res);
        this.authService.$refresh.next(true);
        this.router.navigate(['/']);
      },
      error: (e) => this.router.navigate(['/login'], { queryParams: { error: e.error.detail } }),
    });
  }
}