import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/**
 * Destructive-action confirm (brief #21). Replaces window.confirm, which is
 * unstyled, unbranded, blocks the main thread, and — on the delete paths here —
 * offered no consequence detail beyond a single line.
 *
 * Radix AlertDialog gives the accessibility window.confirm only pretended to: a
 * real focus trap, and initial focus on Cancel (the non-destructive choice) so
 * a stray Enter dismisses rather than deletes. The confirm button is a solid
 * maroon fill (--destructive, white on it 11.60:1) — the strongest "this is
 * destructive" signal the palette allows, per TOKENS.md.
 *
 * The dialog closes on confirm and the mutation runs through the shared
 * lifecycle, so the global MutationStatusBanner reports success or failure —
 * the same contract handleMutation relies on. The confirm handler is not
 * awaited here; keeping the surface open on failure would duplicate the banner.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-card border-dacfp-line">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-sans text-lg font-bold text-dacfp-navy">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-dacfp-gray-text">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel first + auto-focused (Radix default): the safe choice owns
              Enter and the initial focus ring. */}
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40"
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
