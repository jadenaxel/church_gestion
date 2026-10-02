import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../../packages/contracts/src/index.js';
import { canWriteActivityAttachment } from '../../services/file-service/src/authorization.js';
import { canUploadActivityFile, newActivitySubmissionProgress, runActivityDraftSave, runActivitySubmission } from '../../apps/web/components/activity-submission.js';

function operations() {
  return {
    create: vi.fn(async (_payload: string, _key: string) => ({ id: 'draft-one' })),
    upload: vi.fn(async (_id: string, _file: File, _key: string) => undefined),
    submit: vi.fn(async (_id: string) => ({ status: 'SUBMITTED' })),
    onCreated: vi.fn(),
    createKey: vi.fn(() => 'activity-fixed-key')
  };
}

describe('activity submission recovery', () => {
  it('retries a failed attachment on the acknowledged draft without creating a second activity', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    const file = new File(['program'], 'program.txt');
    api.upload.mockRejectedValueOnce(new Error('Upload failed'));
    await expect(runActivitySubmission(progress, 'payload', file, api)).rejects.toThrow('Upload failed');
    expect(progress.draftId).toBe('draft-one');
    expect(api.submit).not.toHaveBeenCalled();
    await expect(runActivitySubmission(progress, 'payload', file, api)).resolves.toEqual({ id: 'draft-one', result: { status: 'SUBMITTED' } });
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.onCreated).toHaveBeenCalledExactlyOnceWith('draft-one');
    expect(api.upload).toHaveBeenNthCalledWith(2, 'draft-one', file, 'activity-fixed-key');
    expect(api.submit).toHaveBeenCalledExactlyOnceWith('draft-one');
  });

  it('preserves an acknowledged upload when submission fails', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    const file = new File(['program'], 'program.txt');
    api.submit.mockRejectedValueOnce(new Error('Submission rejected'));
    await expect(runActivitySubmission(progress, 'payload', file, api)).rejects.toThrow('Submission rejected');
    await runActivitySubmission(progress, 'payload', file, api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledExactlyOnceWith('draft-one', file, 'activity-fixed-key');
    expect(api.submit).toHaveBeenCalledTimes(2);
  });

  it('replays the original body and idempotency key after an uncertain create response', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    api.create.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(runActivitySubmission(progress, 'original payload', null, api)).rejects.toThrow('Connection lost');
    await runActivitySubmission(progress, 'different payload', null, api);
    expect(api.create).toHaveBeenNthCalledWith(1, 'original payload', 'activity-fixed-key');
    expect(api.create).toHaveBeenNthCalledWith(2, 'original payload', 'activity-fixed-key');
    expect(api.createKey).toHaveBeenCalledTimes(1);
  });

  it('prevents simultaneous submits from creating duplicate activities', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    let resolveCreate: (created: { id: string }) => void = () => undefined;
    api.create.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const first = runActivitySubmission(progress, 'payload', null, api);
    await expect(runActivitySubmission(progress, 'payload', null, api)).resolves.toBeNull();
    expect(api.create).toHaveBeenCalledTimes(1);
    resolveCreate({ id: 'draft-one' });
    await first;
    expect(progress.running).toBe(false);
  });

  it('allows a replacement attachment after failure without replacing the saved activity', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    const original = new File(['original'], 'program.txt');
    const replacement = new File(['replacement'], 'program.txt');
    api.submit.mockRejectedValueOnce(new Error('Submission rejected'));
    await expect(runActivitySubmission(progress, 'payload', original, api)).rejects.toThrow('Submission rejected');
    await runActivitySubmission(progress, 'payload', replacement, api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenNthCalledWith(2, 'draft-one', replacement, 'activity-fixed-key');
  });
});

describe('explicit durable activity draft save', () => {
  it('acknowledges the draft and optional program without submitting or reserving dates', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    const file = new File(['fixture program'], 'program.txt');
    await expect(runActivityDraftSave(progress, 'complete payload', file, api)).resolves.toEqual({ id: 'draft-one' });
    expect(api.create).toHaveBeenCalledExactlyOnceWith('complete payload', 'activity-fixed-key');
    expect(api.upload).toHaveBeenCalledExactlyOnceWith('draft-one', file, 'activity-fixed-key');
    expect(api.submit).not.toHaveBeenCalled();
    expect(progress.uploadedFile).toBe(file);
    expect(progress.pendingFile).toBeNull();
    expect(progress.running).toBe(false);
  });

  it('saves a draft without inventing or requiring a program upload', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    await expect(runActivityDraftSave(progress, 'complete payload', null, api)).resolves.toEqual({ id: 'draft-one' });
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('reuses acknowledged save steps when the person explicitly submits later', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    const file = new File(['fixture'], 'program.txt');
    await runActivityDraftSave(progress, 'complete payload', file, api);
    await runActivitySubmission(progress, 'complete payload', file, api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.submit).toHaveBeenCalledExactlyOnceWith('draft-one');
    expect(api.createKey).toHaveBeenCalledTimes(2);
  });

  it('keeps the original create body/key after a lost save acknowledgement', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    api.create.mockRejectedValueOnce(new Error('Acknowledgement lost'));
    await expect(runActivityDraftSave(progress, 'original payload', null, api)).rejects.toThrow('Acknowledgement lost');
    await runActivityDraftSave(progress, 'changed payload', null, api);
    expect(api.create).toHaveBeenNthCalledWith(2, 'original payload', 'activity-fixed-key');
    expect(api.createKey).toHaveBeenCalledTimes(1);
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('does not finish a save while its File is unacknowledged, even without a fresh selection', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    const file = new File(['fixture'], 'program.txt');
    api.upload.mockRejectedValueOnce(new Error('Upload acknowledgement lost'));
    await expect(runActivityDraftSave(progress, 'payload', file, api)).rejects.toThrow('Upload acknowledgement lost');
    expect(progress.draftId).toBe('draft-one');
    expect(progress.pendingFile).toBe(file);
    expect(progress.uploadedFile).toBeNull();
    expect(api.submit).not.toHaveBeenCalled();
    const originalKey = progress.uploadKey;
    await runActivityDraftSave(progress, 'payload', null, api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenNthCalledWith(2, 'draft-one', file, originalKey);
    expect(progress.uploadedFile).toBe(file);
    expect(progress.pendingFile).toBeNull();
  });

  it('shares the in-flight guard between saving and sending', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    let acknowledge: (value: { id: string }) => void = () => undefined;
    api.create.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve; }));
    const saving = runActivityDraftSave(progress, 'payload', null, api);
    await expect(runActivityDraftSave(progress, 'payload', null, api)).resolves.toBeNull();
    await expect(runActivitySubmission(progress, 'payload', null, api)).resolves.toBeNull();
    acknowledge({ id: 'draft-one' });
    await saving;
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.submit).not.toHaveBeenCalled();
  });
});

describe('uncertain attachment receipt', () => {
  it('retains the original File and retry key through session expiration', async () => {
    const progress = newActivitySubmissionProgress(), api = operations();
    const file = new File(['fixture'], 'fixture.txt'); api.upload.mockRejectedValueOnce(Object.assign(new Error('Expired'), {status:401}));
    await expect(runActivitySubmission(progress, 'payload', file, api)).rejects.toThrow('Expired');
    expect(progress.pendingFile).toBe(file); const key = progress.uploadKey;
    await runActivitySubmission(progress, 'payload', file, api);
    expect(api.upload).toHaveBeenNthCalledWith(2,'draft-one',file,key); expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('keeps the key and file stable after response loss, refusing a different file', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    const file = new File(['fixture'], 'fixture.txt');
    api.upload.mockRejectedValueOnce(new Error('Response lost'));
    await expect(runActivitySubmission(progress, 'payload', file, api)).rejects.toThrow('Response lost');
    await expect(runActivitySubmission(progress, 'payload', new File(['other'], 'other.txt'), api)).rejects.toThrow('El adjunto sigue sin confirmarse');
    await runActivitySubmission(progress, 'payload', file, api);
    expect(api.upload.mock.calls[0]?.[2]).toBe(api.upload.mock.calls[1]?.[2]);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('allows a corrected attachment only after definitive validation rejection', async () => {
    const progress = newActivitySubmissionProgress();
    const api = operations();
    api.upload.mockRejectedValueOnce(Object.assign(new Error('Unsupported file'), { status: 422 }));
    await expect(runActivitySubmission(progress, 'payload', new File(['bad'], 'bad.txt'), api)).rejects.toThrow('Unsupported file');
    expect(progress.pendingFile).toBeNull();
    await runActivitySubmission(progress, 'payload', new File(['good'], 'good.txt'), api);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});

describe('activity upload visibility agrees with API authorization', () => {
  const permissions = [[], ['calendar.create'], ['calendar.create', 'calendar.manage'], ['calendar.create', 'documents.manage'], ['documents.manage']];
  const statuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED', 'COMPLETED', 'ARCHIVED'];
  const roles = [null, 'DIRECTOR', 'ASSISTANT_DIRECTOR', 'DEPARTMENT_SECRETARY', 'PLANNER', 'CONTRIBUTOR', 'VIEWER'];
  it.each(statuses)('matches both the route permission and attachment policy for %s', (status) => {
    for (const assignedPermissions of permissions) {
      const user: AuthPrincipal = { sub: 'actor-one', name: 'Test actor', email: 'fixture@example.com', roles: [], permissions: assignedPermissions, scope: 'tenant', sessionId: 'fixture-session' };
      for (const role of roles) {
        for (const owner of [true, false]) {
          const activity = { status, created_by: owner ? user.sub : 'another-actor', capabilities: { departmentRole: role } };
          const expected = assignedPermissions.includes('calendar.create') && canWriteActivityAttachment(user, activity, role);
          expect(canUploadActivityFile(user, activity)).toBe(expected);
        }
      }
    }
  });
  it('does not expose upload before identity has loaded', () => {
    expect(canUploadActivityFile(null, { status: 'DRAFT', created_by: 'actor-one', capabilities: { departmentRole: 'DIRECTOR' } })).toBe(false);
  });
});
