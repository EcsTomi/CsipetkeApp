import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@services/auth.service';

export const loginGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  const query = state.url.split('?')[1] ?? '';
  const redirectParam = new URLSearchParams(query).get('redirect');
  if (redirectParam) {
    return router.parseUrl(decodeURIComponent(redirectParam));
  }

  return router.parseUrl('/');
};
