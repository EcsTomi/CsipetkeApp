import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '@env/environments';
import { ProfileData, UserStore } from '@app/stores/user.store';

declare const google: any;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth/login-google`;
  private userStore = inject(UserStore);

  constructor(private http: HttpClient) {
    this.getProfile();
  }

  public $refresh : Subject<boolean> = new Subject<boolean>();

  public id = computed(() => this.userStore.profile().id);
  public role_code = computed(() => this.userStore.profile().role_code);
  public permissions = computed(() => this.userStore.profile().permissions);
  public class_letter = computed(() => this.userStore.profile().class_letter);
  public class_year = computed(() => this.userStore.profile().class_year);

  public is_admin = computed(() => this.role_code() === 'admin');
  public is_organizer = computed(() => this.role_code() === 'organizer' || this.is_admin());
  public is_contestant = computed(() => this.role_code() === 'contestant' || this.is_organizer());

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  }

  isPermitted(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  isPermittedGroup(group: string): boolean {
    return this.permissions().some((permission: string) => permission.startsWith(group.replace('*', '')));
  }

  private readonly redirectUri = `${environment.redirectUrl}/auth/callback`;
  private readonly clientId = '977734137164-22kuruvvflgfhhc2198j3fqmt036e8cc.apps.googleusercontent.com';

  startGoogleRedirectLogin() {
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('oauth_nonce', nonce);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: nonce,
      hd: 'lovassy.edu.hu', // ugyanaz a domain-megkötés, mint eddig
      prompt: 'select_account',
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  loginWithGoogle(idToken: string, nonce: string) {
    return this.http.post<ProfileData>(
      this.apiUrl,
      { id_token: idToken, nonce: nonce }
    );
  }

  getProfile() {
    if (this.isAuthenticated()) {
      this.http.get<ProfileData>(`${environment.apiUrl}/auth/profile`).subscribe((res) => {
        this.setProfile(res);
      });
    }
  }

  setProfile(res: ProfileData) {
    this.userStore.setProfile(res);

    localStorage.setItem('role_code', res.role_code);
    localStorage.setItem('permissions', JSON.stringify(res.permissions));
    localStorage.setItem('id', String(res.id));
    localStorage.setItem('picture', res.picture);
    localStorage.setItem('name', res.name);
    localStorage.setItem('email', res.email);
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('id');
    localStorage.removeItem('email');
    localStorage.removeItem('name');
    localStorage.removeItem('picture');
    localStorage.removeItem('role_code');
    localStorage.removeItem('role_name');
    localStorage.removeItem('permissions');
    localStorage.removeItem('class_letter');
    localStorage.removeItem('class_year');

    this.userStore.clear();

    window.location.href = '/login';
  }
  logoutFromAll() {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe(() => {
      this.logout();
    })
  }
}