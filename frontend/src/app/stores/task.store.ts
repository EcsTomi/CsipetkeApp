import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';
import { Toolbar } from 'ngx-editor';
import { UserPublic } from '@stores/point.store';

export interface Submission {
    id: number;
    task_id: number;
    class_letter: string;
    original_filename: string;
    content_type: string;
    size_bytes: number;
    uploaded_at: string;
    user: UserPublic;
}

export const ToolbarPreset: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['ordered_list', 'bullet_list', 'outdent', 'indent'],
    [{ heading: ['h1', 'h2', 'h3'] }, 'format_clear'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
    ['text_color', 'background_color'],
];

export const ColorPresets = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'black', '#313d8f', 'white', '#db2b27', '#fec916', '#2f6ccb', '#63bd41'];

export enum FileUpload {
    file_upload_not = 'file_upload_not',
    file_upload_vid = 'file_upload_vid',
    file_upload_doc = 'file_upload_doc',
    file_upload_img = 'file_upload_img',
    file_upload_any = 'file_upload_any'
}

export interface VersionChange {
    old: any;
    new: any;
}

export interface EntityVersion {
    version_number: number;
    created_at: string;
    created_by_id: number | null;
    created_by_name: string | null;
    created_by_picture: string | null;
    data: Record<string, any>;
    changes: Record<string, VersionChange>;
}

export enum ScoringType {
    none = 'none',
    jury = 'jury',
    organizer = 'organizer',
}

export interface Task {
  id : number
  name : string
  details : string
  previously_public : boolean
  visible_from : Date
  visible_from_human : string
  available_from : Date | null
  available_from_human : string
  file_upload : FileUpload
  deadline : Date | null
  deadline_human : string
  is_visible : boolean
  submissions : Submission[]

  scoring_type : ScoringType
  max_points : number | null
  placement_points : Record<string, number> | null

  is_deleted : boolean

  modified_at : Date
  modified_by: UserPublic
}

interface TaskState {
    items: Task[];
    lastUpdated: number;
    selectedTaskId: number | null;
    selectedCriteriaId: number | null;
    isLoading: boolean;
    versions: EntityVersion[];
    versionsLoading: boolean;
}

const initialState: TaskState = {
    items: [],
    lastUpdated: 0,
    selectedTaskId: null,
    selectedCriteriaId: null,
    isLoading: false,
    versions: [],
    versionsLoading: false,
};

export const TaskStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store) => ({
        setItems(items: Task[]) {
            patchState(store, {
                items,
                lastUpdated: Date.now(),
            });
        },

        addItem(item: Task) {
            patchState(store, { items: [...store.items(), item] });
        },

        updateItem(id: number, item: Task) {
            const items = store.items().map((i) => (i.id === id ? item : i));
            patchState(store, { items });
        },

        removeItem(id: number) {
            const items = store.items().filter((i) => i.id !== id);
            patchState(store, { items });
        },

        updateSubmission(taskId: number, class_letter: string, item: Submission) {
            const task = store.items().find((i) => i.id === taskId);
            if (task) {
                const submissions = task.submissions.map((s) => (s.class_letter === class_letter ? item : s));
                patchState(store, { items: store.items().map((i) => (i.id === taskId ? { ...i, submissions } : i)) });
            }
        },

        selectTask(id: number | null) {
            patchState(store, { selectedTaskId: id });
        },

        selectCriteria(id: number | null) {
            patchState(store, { selectedCriteriaId: id });
        },

        clear() {
            patchState(store, initialState);
        },

        setLoading(isLoading: boolean) {
            patchState(store, { isLoading });
        },

        setVersions(versions: EntityVersion[]) {
            patchState(store, { versions, versionsLoading: false });
        },

        setVersionsLoading(versionsLoading: boolean) {
            patchState(store, { versionsLoading });
        },

        clearVersions() {
            patchState(store, { versions: [], versionsLoading: false });
        },
    })),
    withComputed((store) => ({
        selectedTask: computed(() => {
            const id = store.selectedTaskId();
            return store.items().find((item) => item.id === id) || null;
        }),
        visibleCount: computed(() => store.items().filter((item) => item.is_visible).length),
        isEmpty: computed(() => store.items().length === 0),
        count: computed(() => store.items().length),
    }))
);