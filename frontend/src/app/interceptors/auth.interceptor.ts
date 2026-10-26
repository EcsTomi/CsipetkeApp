import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, switchMap, filter, take, throwError, BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '@env/environments';
import { MaintenanceService } from '@app/services/maintenance.service';
import { UserStore } from '@app/stores/user.store';

let isRefreshing = false;
// Explicit megadjuk, hogy stringet vagy null-t tartunk számon
let refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);
  const maintenance = inject(MaintenanceService);
  const userStore = inject(UserStore);
  const accessToken = localStorage.getItem('access_token');

  let authReq = req;
  if (accessToken) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${accessToken}` },
    });
  }

  return next(authReq).pipe(
    catchError((error: any) => {
      if (error instanceof HttpErrorResponse && (error.status === 502)) {
        maintenance.reportDown();
        return throwError(() => error);
      }
      if (error instanceof HttpErrorResponse && (error.status === 0)) {
        maintenance.checkForUptime();
      }

      if (
        error instanceof HttpErrorResponse && 
        error.status === 401 && 
        !req.url.includes('/auth/login-google') && 
        !req.url.includes('/auth/refresh') && accessToken
      ) {
        return handle401Error(req, next, http, userStore);
      }
      return throwError(() => error);
    })
  );
};

// Megadjuk a pontos típusokat a segédfüggvény paramétereinek és visszatérési értékének is
function handle401Error(req: HttpRequest<any>, next: HttpHandlerFn, http: HttpClient, userStore: any): Observable<HttpEvent<any>> {
  const refreshToken = localStorage.getItem('refresh_token');

  if (!refreshToken) {
    logout();
    return throwError(() => new HttpErrorResponse({ error: 'Nincs refresh token elérhető.', status: 401 }));
  }

  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject = new BehaviorSubject<string | null>(null);

    // Biztosítjuk, hogy a POST kérés elvárt válasza <any> (vagy a konkrét interfészed) legyen
    return http.post<any>(`${environment.apiUrl}/auth/refresh`, { refresh_token: refreshToken }).pipe(
      switchMap((res: any) => {
        isRefreshing = false;

        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('refresh_token', res.refresh_token);
        userStore.setProfile(res);
        refreshTokenSubject.next(res.access_token);

        return next(req.clone({
          setHeaders: { Authorization: `Bearer ${res.access_token}` }
        }));
      }),
      catchError((err) => {
        isRefreshing = false;
        refreshTokenSubject.error(err);
        refreshTokenSubject = new BehaviorSubject<string | null>(null);
        if (err instanceof HttpErrorResponse && err.status === 401) {
          logout();
        }
        return throwError(() => err);
      })
    );
  } else {
    return refreshTokenSubject.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap((token) => next(req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      })))
    );
  }
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('email');
  localStorage.removeItem('name');
  localStorage.removeItem('picture');
  localStorage.removeItem('role_code');
  localStorage.removeItem('permissions');
  localStorage.removeItem('role_name');
  window.location.href = '/login';
}