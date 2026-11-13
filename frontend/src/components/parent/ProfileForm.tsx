import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { useCreateProfile, useDeleteProfile, useUpdateProfile } from '@/hooks/useProfiles';
import { cleanProfileName, PROFILE_AGE_MAX, PROFILE_NAME_MAX } from '@/lib/profiles';
import { AVATARS } from '@/lib/theme';
import type { ChildProfile } from '@/api/types';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const AGES = Array.from({ length: PROFILE_AGE_MAX + 1 }, (_, i) => i);

/** Why a save or delete failed, in words a grown-up can act on. */
function problemMessage(err: unknown, doing: 'save' | 'delete'): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return 'The parent lock closed. Unlock it, then try again.';
    }
    if (err.status === 409 && doing === 'delete') {
      return 'The main storyteller can’t be deleted.';
    }
    if (err.status === 422) return 'Please check the name and age.';
  }
  return doing === 'save'
    ? 'Something went wrong saving. Please try again.'
    : 'Something went wrong deleting. Please try again.';
}

/** "Delete {name} and their stories? Yes / No": the in-app confirm step (never a browser dialog). */
export function DeleteConfirm({
  name,
  busy,
  error,
  onYes,
  onNo,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={`Delete ${name}?`}
      className="flex flex-col gap-3 rounded-2xl border border-blossom/40 bg-blossom/10 p-4"
    >
      <p className="text-parchment">Delete {name} and their stories?</p>
      {error && (
        <p role="alert" className="text-sm text-blossom">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onYes} disabled={busy} className="text-blossom">
          {busy ? 'Deleting…' : 'Yes, delete'}
        </Button>
        <Button variant="primary" onClick={onNo} disabled={busy}>
          No, keep
        </Button>
      </div>
    </div>
  );
}

interface ProfileFormProps {
  /** Present to edit that profile; absent to create a new one. */
  initial?: ChildProfile;
  onSaved: (profile: ChildProfile) => void;
  /** Edit mode only: the profile was deleted (the Delete button shows only when this is given). */
  onDeleted?: () => void;
  onCancel: () => void;
}

/**
 * Create a storyteller (Home) or edit one (behind the parent lock). The page
 * decides whether the lock is open; if it closes while this form is up, the
 * form just stays mounted behind the PIN pad, so nothing typed is lost.
 */
export function ProfileForm({ initial, onSaved, onDeleted, onCancel }: ProfileFormProps) {
  const editing = initial !== undefined;
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState(initial?.age ?? 7);
  // A unicorn makes a lovely default buddy.
  const [avatarId, setAvatarId] = useState(initial?.avatar_id ?? 'unicorn');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const deleteProfile = useDeleteProfile();

  const cleanName = cleanProfileName(name);
  const saving = createProfile.isPending || updateProfile.isPending;
  const saveError = createProfile.error ?? updateProfile.error;
  const canDelete = editing && !initial.is_default && onDeleted !== undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cleanName === null || saving) return;
    const body = { name: cleanName, age, avatar_id: avatarId };
    if (initial) {
      updateProfile.mutate({ id: initial.id, body }, { onSuccess: onSaved });
    } else {
      createProfile.mutate(body, { onSuccess: onSaved });
    }
  };

  const confirmDelete = () => {
    if (!initial) return;
    deleteProfile.mutate(initial.id, { onSuccess: () => onDeleted?.() });
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <h2 className="font-display text-2xl text-parchment">
        {editing ? `Edit ${initial.name}` : 'Create your storyteller'}
      </h2>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
        <div>
          <label htmlFor="profile-name" className="mb-2 block text-parchment/80">
            {editing ? 'Name' : 'What’s your name?'}
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PROFILE_NAME_MAX}
            autoComplete="off"
            placeholder="Type a name…"
            className="min-h-[56px] w-full rounded-2xl border border-white/10 bg-night-900/40 px-5 py-3 text-xl text-parchment placeholder:text-parchment/40"
          />
        </div>

        <div role="radiogroup" aria-labelledby="profile-age-label">
          <p id="profile-age-label" className="mb-2 text-parchment/80">
            {editing ? 'Age' : 'How old are you?'}{' '}
            <span className="font-display text-firefly">{age}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {AGES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={age === a}
                aria-label={`Age ${a}`}
                onClick={() => setAge(a)}
                className={cn(
                  'h-11 min-w-11 rounded-full px-3 font-display text-lg transition-colors',
                  age === a
                    ? 'bg-firefly text-night-900'
                    : 'bg-white/[0.06] text-parchment hover:bg-white/10'
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-parchment/80">Pick a buddy</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={avatarId === a.id}
                aria-label={a.label}
                onClick={() => setAvatarId(a.id)}
                className={cn(
                  'rounded-[1.25rem] p-1 transition-transform hover:scale-105',
                  avatarId === a.id && 'ring-4 ring-firefly'
                )}
              >
                <AvatarChip emoji={a.emoji} from={a.from} to={a.to} />
              </button>
            ))}
          </div>
        </div>

        {saveError && (
          <p role="alert" className="text-blossom">
            {problemMessage(saveError, 'save')}
          </p>
        )}

        {confirmingDelete && initial ? (
          <DeleteConfirm
            name={initial.name}
            busy={deleteProfile.isPending}
            error={deleteProfile.error ? problemMessage(deleteProfile.error, 'delete') : null}
            onYes={confirmDelete}
            onNo={() => {
              deleteProfile.reset();
              setConfirmingDelete(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="magic" size="lg" disabled={cleanName === null || saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'That’s me! ✨'}
            </Button>
            <Button variant="secondary" size="lg" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
                className="ml-auto text-blossom hover:text-blossom"
              >
                🗑️ Delete
              </Button>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
