import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ApiError } from '@/api/client';
import { useDeleteProfile } from '@/hooks/useProfiles';
import { useParentLock } from '@/hooks/useParentLock';
import { avatarById, nameWithHeart } from '@/lib/theme';
import type { ChildProfile } from '@/api/types';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DeleteConfirm, ProfileForm } from './ProfileForm';
import { PinPad } from './PinPad';

/**
 * The Parent corner's "Manage profiles": rename, change age or buddy, delete
 * (never the default profile), and change the household PIN. The page only
 * shows this while the parent lock is open.
 */
export function ManageProfiles({ profiles }: { profiles: ChildProfile[] }) {
  const [editing, setEditing] = useState<ChildProfile | null>(null);
  const [deleting, setDeleting] = useState<ChildProfile | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const deleteProfile = useDeleteProfile();
  const { unlocked } = useParentLock();

  const deleteError = deleteProfile.error
    ? deleteProfile.error instanceof ApiError && deleteProfile.error.status === 409
      ? 'The main storyteller can’t be deleted.'
      : 'We couldn’t delete that profile. Please try again.'
    : null;

  const cancelDelete = () => {
    deleteProfile.reset();
    setDeleting(null);
  };

  return (
    <section aria-labelledby="manage-profiles-heading" className="flex flex-col gap-4">
      <h2 id="manage-profiles-heading" className="font-display text-2xl text-parchment">
        Manage profiles
      </h2>

      {editing ? (
        <ProfileForm
          key={editing.id}
          initial={editing}
          onSaved={() => setEditing(null)}
          onDeleted={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Card className="p-4 sm:p-6">
          <ul className="flex flex-col gap-3">
            {profiles.map((p) => {
              const avatar = avatarById(p.avatar_id);
              return (
                <li key={p.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <AvatarChip emoji={avatar.emoji} from={avatar.from} to={avatar.to} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg text-parchment">
                        {nameWithHeart(p)}
                      </p>
                      <p className="text-sm text-parchment/60">Age {p.age}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px]"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => {
                        cancelDelete();
                        setNotice(null);
                        setEditing(p);
                      }}
                    >
                      ✏️ Edit
                    </Button>
                    {!p.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] text-blossom hover:text-blossom"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => {
                          deleteProfile.reset();
                          setDeleting(p);
                        }}
                      >
                        🗑️ Delete
                      </Button>
                    )}
                  </div>
                  {deleting?.id === p.id && (
                    <DeleteConfirm
                      name={p.name}
                      busy={deleteProfile.isPending}
                      error={deleteError}
                      onYes={() =>
                        deleteProfile.mutate(p.id, {
                          onSuccess: () => setDeleting(null),
                        })
                      }
                      onNo={cancelDelete}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <div>
          <h3 className="font-display text-lg text-parchment">Parent PIN</h3>
          <p className="text-sm text-parchment/70">One PIN for the whole family.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setNotice(null);
            setChangingPin(true);
          }}
        >
          🔑 Change parent PIN
        </Button>
        {notice && (
          <p role="status" className="w-full text-firefly">
            {notice}
          </p>
        )}
      </Card>

      <AnimatePresence>
        {/* If the lock closes meanwhile the page asks for the PIN; this pad waits so only one listens to the keys. */}
        {changingPin && unlocked && (
          <PinPad
            mode="change"
            onUnlocked={() => {
              setChangingPin(false);
              setNotice('Your PIN was changed ✓');
            }}
            onClose={() => setChangingPin(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
