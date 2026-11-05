import { useState } from 'react';
import { toast } from 'sonner';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { signInAndLoad, mergeGuestIntoAccount } from '../lib/sync';
import { isDriveConfigured } from '../lib/drive';
import { Button, Dialog } from './ui';

export function useSignIn() {
  const t = useT();
  const [askMerge, setAskMerge] = useState(false);
  const [explain, setExplain] = useState(false);
  /** Resolves true once signed in. */
  async function run(): Promise<boolean> {
    if (!isDriveConfigured()) {
      setExplain(true);
      return false;
    }
    try {
      const r = await signInAndLoad('select_account');
      toast.success(t('Signed in as {name}. Your cards are saved in Google Drive.', { name: r.user.name }));
      if (r.guestHasData) setAskMerge(true);
      if (r.resumeRoute && r.resumeRoute !== '/' && !r.resumeRoute.startsWith('/shared')) navigate(r.resumeRoute);
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'popup-closed') return false;
      if (msg === 'drive-permission') toast.error(t('Flashcard Pro needs permission to save to your Drive. Sign in again and tick the Drive box.'));
      else toast.error(msg);
      return false;
    }
  }
  const dialogs = (
    <>
      <Dialog
        open={askMerge}
        onOpenChange={setAskMerge}
        title={t('Add your guest cards to this account?')}
        description={t('You made cards on this device before signing in. Add them to your Google account so they are saved in Drive too.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAskMerge(false)}>
              {t('Not now')}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await mergeGuestIntoAccount();
                setAskMerge(false);
                toast.success(t('Guest cards added to your account.'));
              }}
            >
              {t('Add to my account')}
            </Button>
          </>
        }
      />
      <SetupNotice open={explain} onOpenChange={setExplain} />
    </>
  );
  return { run, dialogs };
}

function SetupNotice({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Google sign-in is not set up on this site yet')}
      size="sm"
      footer={
        <Button
          variant="primary"
          onClick={() => {
            onOpenChange(false);
            navigate('/help');
          }}
        >
          {t('See setup steps')}
        </Button>
      }
    >
      <p>{t('You can keep using Flashcard Pro as a guest. Your cards stay saved in this browser.')}</p>
      <p className="muted">{t('The site owner needs to add a Google Client ID in config.js to turn on Drive saving.')}</p>
    </Dialog>
  );
}

