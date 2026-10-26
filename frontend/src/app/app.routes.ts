import { Routes } from '@angular/router';
import { authGuard } from '@guards/auth-guard';
import { loginGuard } from '@guards/login-guard';
import { csipetkeGuard } from '@guards/csipetke-guard';
import { retryImport } from './utils/retry-import';
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => retryImport(() => import('@app/pages/home-page/home-page')).then(m => m.HomePage),
    canActivate: [authGuard],
    data: { headerTitle: 'Csipetke' }
  },
  {
    path: 'login',
    loadComponent: () => retryImport(() => import('@app/user/login/login')).then(m => m.Login),
    canActivate: [loginGuard],
    data: { headerTitle: 'Csipetke' }
  },
  {
    path: 'auth/callback',
    loadComponent: () => retryImport(() => import('@app/user/auth-callback')).then(m => m.AuthCallback)
  },
  {
    path: 'tasks',
    loadComponent: () => retryImport(() => import('@app/pages/tasks/all-tasks-page/all-tasks-page')).then(m => m.AllTasksPage),
    canActivate: [csipetkeGuard(['task.view'])],
    data: { headerTitle: 'Feladatok' }
  },
  {
    path: 'tasks/new',
    loadComponent: () => retryImport(() => import('@app/pages/tasks/edit-task-page/edit-task-page')).then(m => m.EditTaskPage),
    canActivate: [csipetkeGuard(['task.edit'])],
    data: { headerTitle: 'Új feladat' }
  },
  {
    path: 'tasks/:id',
    loadComponent: () => retryImport(() => import('@app/pages/tasks/task-page/task-page')).then(m => m.TaskPage),
    canActivate: [csipetkeGuard(['task.view'])],
    data: { headerTitle: 'Feladat' },
  },
  {
    path: 'tasks/:id/edit',
    loadComponent: () => retryImport(() => import('@app/pages/tasks/edit-task-page/edit-task-page')).then(m => m.EditTaskPage),
    canActivate: [csipetkeGuard(['task.edit'])],
    data: { headerTitle: 'Feladat szerkesztés' }
  },
  {
    path: 'points',
    loadComponent: () => retryImport(() => import('@app/pages/points/points-overview-page/points-overview-page')).then(m => m.PointsOverviewPage),
    canActivate: [csipetkeGuard(['point.details', 'point.summary', 'costume.score'])],
    data: { headerTitle: 'Pont áttekintés' }
  },
  {
    path: 'points/:letter',
    loadComponent: () => retryImport(() => import('@app/pages/points/class-points-page/class-points-page')).then(m => m.ClassPointsPage),
    canActivate: [csipetkeGuard(['point.details'])],
    data: { headerTitle: 'Ponttörténet' }
  },
  {
    path: 'costume',
    loadComponent: () => retryImport(() => import('@app/pages/costume-score-page/costume-score-page')).then(m => m.CostumeScorePage),
    canActivate: [csipetkeGuard(['costume.edit', 'costume.score'])],
    data: { headerTitle: 'Jelmez Pontozás' }
  },
  {
    path: 'votes',
    loadComponent: () => retryImport(() => import('@app/pages/votes/all-votes-page/all-votes-page')).then(m => m.AllVotesPage),
    canActivate: [csipetkeGuard(['vote.vote', 'vote.hidden', 'vote.edit'])],
    data: { headerTitle: 'Szavazások' }
  },
  {
    path: 'votes/new',
    loadComponent: () => retryImport(() => import('@app/pages/votes/edit-vote-page/edit-vote-page')).then(m => m.EditVotePage),
    canActivate: [csipetkeGuard(['vote.edit'])],
    data: { headerTitle: 'Új szavazás' }
  },
  {
    path: 'votes/:id',
    loadComponent: () => retryImport(() => import('@app/pages/votes/vote-page/vote-page')).then(m => m.VotePage),
    canActivate: [csipetkeGuard(['vote.vote', 'vote.hidden', 'vote.edit'])],
    data: { headerTitle: 'Szavazások' }
  },
  {
    path: 'votes/:id/edit',
    loadComponent: () => retryImport(() => import('@app/pages/votes/edit-vote-page/edit-vote-page')).then(m => m.EditVotePage),
    canActivate: [csipetkeGuard(['vote.edit'])],
    data: { headerTitle: 'Szavazás szerkesztés' }
  },
  {
    path: 'audit_log',
    loadComponent: () => retryImport(() => import('@app/pages/audit-log-page/audit-log-page')).then(m => m.AuditLogPage),
    canActivate: [csipetkeGuard(['audit_log.view'])],
    data: { headerTitle: 'Audit log' }
  },
  {
    path: 'admin/permission',
    loadComponent: () => retryImport(() => import('@app/pages/permission-management-page/permission-management-page')).then(m => m.PermissionManagementPage),
    canActivate: [csipetkeGuard(['admin.permission'])],
    data: { headerTitle: 'Jogosultságok' }
  },
  {
    path: 'program',
    loadComponent: () => retryImport(() => import('@app/pages/program/program-page/program-page')).then(m => m.ProgramPage),
    canActivate: [csipetkeGuard(['program.view_all', 'program.manage', 'audit_log.view', 'point.onsite', 'jury.score', 'admin.permission', 'settings.freeze', 'settings.jury_window'])],
    data: { headerTitle: 'Szervezés' }
  },
  {
    path: 'program/control',
    loadComponent: () => retryImport(() => import('@app/pages/program/control-page/program-control-page')).then(m => m.ProgramControlPage),
    canActivate: [csipetkeGuard(['settings.freeze', 'settings.jury_window'])],
    data: { headerTitle: 'Verseny-vezérlés' }
  },
  {
    path: 'program/score',
    loadComponent: () => retryImport(() => import('@app/pages/program/score-page/program-score-page')).then(m => m.ProgramScorePage),
    canActivate: [csipetkeGuard(['jury.score', 'point.onsite'])],
    data: { headerTitle: 'Pontok' }
  },
  {
    path: 'program/order',
    loadComponent: () => retryImport(() => import('@app/pages/program/order-page/program-order-page')).then(m => m.ProgramOrderPage),
    canActivate: [csipetkeGuard(['program.manage'])],
    data: { headerTitle: 'Program tervezés' }
  },
  {
    path: 'program/view',
    loadComponent: () => retryImport(() => import('@app/pages/program/view-page/program-view-page')).then(m => m.ProgramViewPage),
    canActivate: [csipetkeGuard(['program.view_all'])],
    data: { headerTitle: 'Program megtekintés' }
  },
  {
    path: 'racing',
    loadComponent: () => retryImport(() => import('@app/pages/racing-page/racing-page')).then(m => m.RacingPage),
    canActivate: [authGuard],
    data: { headerTitle: 'Autóversenyző stopper' }
  }
];