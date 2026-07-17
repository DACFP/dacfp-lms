import { cloneElement, isValidElement, useId } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The app form label (brief #19), on the shadcn/Radix Label base.
 */
export function FormLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn('mb-2 block text-sm font-bold text-dacfp-navy', className)}
      {...props}
    />
  );
}

type SlottableControl = ReactElement<{
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}>;

/**
 * Label + slot pattern (brief #19). Replaces 20 hand-rolled
 * `<label><span>…</span><input class="field" /></label>` blocks.
 *
 * Every one of those used an *implicit* (wrapping) label — the repo contained
 * zero `htmlFor` before this. Implicit labels are valid but do not survive
 * being reparented, and they cannot carry hint/error wiring. Field slots the
 * control instead: it generates the id, points the label at it explicitly, and
 * wires hint/error text into aria-describedby so the control announces its own
 * help and failure text.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: SlottableControl;
}) {
  const reactId = useId();
  const controlId = children.props.id ?? `${reactId}-control`;
  const hintId = hint ? `${reactId}-hint` : undefined;
  const errorId = error ? `${reactId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-describedby':
          [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ') ||
          undefined,
        'aria-invalid': error ? true : children.props['aria-invalid'],
      })
    : children;

  return (
    <div className={cn('block', className)}>
      <FormLabel htmlFor={controlId}>{label}</FormLabel>
      {control}
      {hint ? (
        <p id={hintId} className="mt-2 text-sm leading-6 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-2 text-sm font-semibold text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
