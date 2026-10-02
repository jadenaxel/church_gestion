import { definitiveWriteRejection } from './resumable-write.js';

export type ActivitySubmissionProgress = {
  payload: string | null;
  key: string | null;
  draftId: string | null;
  uploadedFile: File | null;
  pendingFile: File | null;
  uploadKey: string | null;
  running: boolean;
};

export function newActivitySubmissionProgress(): ActivitySubmissionProgress {
  return { payload: null, key: null, draftId: null, uploadedFile: null, pendingFile: null, uploadKey: null, running: false };
}

type ActivityDraftOperations = {
  create: (payload: string, key: string) => Promise<{ id: string }>;
  upload: (id: string, file: File, key: string) => Promise<void>;
  onCreated: (id: string) => void;
  createKey: () => string;
};

/** Acknowledges the server draft and selected program; never submits or reserves it. */
async function persistActivityDraft(progress: ActivitySubmissionProgress, payload: string, file: File | null, operations: ActivityDraftOperations): Promise<string> {
    if (progress.payload === null) {
      progress.payload = payload;
      progress.key = operations.createKey();
    }
    if (!progress.draftId) {
      const created = await operations.create(progress.payload, progress.key!);
      progress.draftId = created.id;
      operations.onCreated(created.id);
    }
    if (progress.pendingFile && file && progress.pendingFile !== file) throw new Error('El adjunto sigue sin confirmarse. Reintenta el mismo archivo antes de reemplazarlo.');
    // A pending File must be acknowledged even if the caller has no fresh selection.
    const selectedFile = progress.pendingFile ?? file;
    if (selectedFile && progress.uploadedFile !== selectedFile) {
      progress.pendingFile ??= selectedFile;
      progress.uploadKey ??= operations.createKey();
      try {
        await operations.upload(progress.draftId, progress.pendingFile, progress.uploadKey);
        progress.uploadedFile = progress.pendingFile;
        progress.pendingFile = null;
        progress.uploadKey = null;
      } catch (reason) {
        // A renewed session must still offer the original File in this mounted tab.
        if (definitiveWriteRejection(reason) && Number((reason as {status:unknown}).status) !== 401) { progress.pendingFile = null; progress.uploadKey = null; }
        throw reason;
      }
    }
    return progress.draftId;
}

/** Explicit durable save using existing authenticated draft/file APIs, not browser storage. */
export async function runActivityDraftSave(progress: ActivitySubmissionProgress, payload: string, file: File | null, operations: ActivityDraftOperations): Promise<{ id: string } | null> {
  if (progress.running) return null;
  progress.running = true;
  try {
    return { id: await persistActivityDraft(progress, payload, file, operations) };
  } finally { progress.running = false; }
}

/** Resume acknowledged steps on the same draft and replay uncertain creates with the same key/body. */
export async function runActivitySubmission<T>(progress: ActivitySubmissionProgress, payload: string, file: File | null, operations: ActivityDraftOperations & {
  submit: (id: string) => Promise<T>;
}): Promise<{ id: string; result: T } | null> {
  if (progress.running) return null;
  progress.running = true;
  try {
    const id = await persistActivityDraft(progress, payload, file, operations);
    return { id, result: await operations.submit(id) };
  } finally { progress.running = false; }
}

export function canUploadActivityFile(user: { sub: string; permissions: string[] } | null, activity: {
  status: string; created_by: string; capabilities: { departmentRole: string | null };
}): boolean {
  if (!user?.permissions.includes('calendar.create') || ['CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(activity.status)) return false;
  if (user.permissions.includes('calendar.manage') || user.permissions.includes('documents.manage')) return true;
  if (activity.status === 'APPROVED') return false;
  const role = activity.capabilities.departmentRole;
  return ['DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY'].includes(role ?? '')
    || (activity.created_by === user.sub && ['PLANNER', 'CONTRIBUTOR'].includes(role ?? ''));
}
