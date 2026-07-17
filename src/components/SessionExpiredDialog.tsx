import { LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '../context/AuthContext';
import { IconTile } from './IconTile';

/**
 * Session-expiry re-auth prompt (brief #21, L-11 — UI ONLY).
 *
 * When an admin request fails because the session is no longer authorised
 * (isLmsAccessDenied — a 401/403/RLS error the provider already classifies as
 * 'denied'), the console used to show the same dead "Admin data unavailable →
 * Retry" as a network blip. Retry cannot fix an expired session, so it was a
 * loop to nowhere. This surfaces the real state and the only action that
 * resolves it: sign in again.
 *
 * No auth-flow logic changes. Signing out then routing to /login is exactly
 * what the shell's existing Sign-out control does; this reuses that path rather
 * than introducing any new session handling.
 */
export function SessionExpiredDialog() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const reauthenticate = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="rounded-card border-dacfp-line sm:max-w-md"
      >
        <IconTile icon={LogIn} size="lg" tone="brand" />
        <DialogTitle className="mt-4 font-sans text-xl font-bold text-dacfp-navy">
          Your operator session has expired
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-dacfp-gray-text">
          For security, admin sessions time out. Sign in again to continue — no work in progress has been discarded on the server.
        </DialogDescription>
        <button
          className="button-primary mt-6 w-full sm:w-auto"
          type="button"
          onClick={() => void reauthenticate()}
        >
          <LogIn className="size-icon-sm" aria-hidden="true" />
          Sign in again
        </button>
      </DialogContent>
    </Dialog>
  );
}
