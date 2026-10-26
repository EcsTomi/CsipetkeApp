import { CommonModule } from '@angular/common';
import { Component, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@app/services/auth.service';
import { TaskService } from '@app/services/task.service';
import { TaskStore, FileUpload } from '@app/stores/task.store';
import { SafeHtmlPipe, SafeHtmlEllipsisPipe } from "@pipes/safe-html-pipe";
import { TaskHistoryPanel } from '@app/panels/task-history-panel/task-history-panel';
import { AddPointPanel } from '@app/panels/add-point-panel/add-point-panel';
import { TaskSubmissionUpload } from "@app/panels/submission-upload-panel/submission-upload-panel";
import { SubmissionService } from '@app/services/submission.service';

@Component({
  selector: 'task-page',
  imports: [MatIconModule, CommonModule, FormsModule, SafeHtmlPipe, TaskHistoryPanel, AddPointPanel, TaskSubmissionUpload],
  templateUrl: './task-page.html',
  styleUrl: './task-page.css'
})
export class TaskPage {
  protected fileUpload = FileUpload;
  protected router = inject(Router);
  private route = inject(ActivatedRoute);
  protected auth = inject(AuthService);
  protected taskStore = inject(TaskStore);
  protected taskService = inject(TaskService);
  protected submissionService = inject(SubmissionService);
  protected isLoading = computed(() => this.taskStore.isLoading());
  protected task = computed(() => this.taskStore.selectedTask());
  protected id = computed(() => this.taskStore.selectedTaskId());

  protected showHistory = signal(false);
  protected showAddPoint = signal(false);
  protected showGradeTask = signal(false);
  protected classLetter = signal('');

  constructor() {
    if (this.route.snapshot.paramMap.get('id') === null) return;
    if (isNaN(parseInt(this.route.snapshot.paramMap.get('id')!))) return;
    this.taskService.selectTask(parseInt(this.route.snapshot.paramMap.get('id')!));
  }

  modify() {
    this.router.navigate(['tasks', this.taskStore.selectedTask()!.id, 'edit']);
  }

  pointClass(letter: string) {
    this.classLetter.set(letter);
    this.showGradeTask.set(true);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  protected downloadingLetter = signal('');

  downloadSubmission(classLetter: string) {
    this.downloadingLetter.set(classLetter);
    this.submissionService.downloadSubmission(this.id()!, classLetter).subscribe(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.task()?.submissions.find(s => s.class_letter === classLetter)?.original_filename ?? '';
        a.click();
        URL.revokeObjectURL(url);
        this.downloadingLetter.set('');
      }
    );
  }
  back() {
    window.history.back();
  }

  isLateUploaded(classLetter: string): boolean {
    if (!this.task()?.submissions.find(s => s.class_letter === classLetter)) return false;
    return new Date(this.task()?.submissions.find(s => s.class_letter === classLetter)!.uploaded_at!) > new Date(this.task()?.deadline!);
  }
}
