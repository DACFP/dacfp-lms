import { useState, type ReactNode } from 'react';
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
import { Input } from '@/components/ui/input';

/**
 * The M1 named-confirmation pattern for destructive learner actions: the
 * operator must type the learner's email exactly before the destructive
 * button enables. Same AlertDialog foundation as ConfirmDialog — Cancel is
 * first and auto-focused, the confirm fill is the destructive maroon.
 */
export function NamedConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  expected,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** The exact string (learner email) that must be typed to confirm. */
  expected: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === expected.trim().toLowerCase();

  return (
    <AlertDialog onOpenChange={(open) => { if (!open) setTyped(''); }}>
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
        <label className="block text-sm">
          <span className="font-bold text-dacfp-navy">
            Type <span className="font-mono">{expected}</span> to confirm
          </span>
          <Input
            className="mt-2"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Type ${expected} to confirm`}
          />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40 disabled:pointer-events-none disabled:opacity-50"
            disabled={!matches}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
