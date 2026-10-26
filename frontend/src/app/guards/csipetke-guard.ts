import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@services/auth.service';

export function csipetkeGuard(
  allowedPermissions: string[]
): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const permitted = allowedPermissions.some((permission) => authService.isPermitted(permission));

    return authService.isAuthenticated() && permitted ? true : router.parseUrl('/');
  }
};
