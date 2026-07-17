import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeletons (brief #15).
 *
 * Boot and page loads previously showed a single centred line of text
 * ("Loading the learning portal…"), which gives no sense of what is coming and
 * makes a slow connection feel broken. These mirror the shape of the content
 * they stand in for.
 *
 * Each is wrapped in a role="status" region with an sr-only label: the visual
 * skeleton is decorative, so assistive tech gets one honest announcement of the
 * loading state instead of a pile of meaningless boxes.
 */
function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading your dashboard">
      <div className="space-y-8">
        <div className="border-b border-dacfp-line pb-7">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="card overflow-hidden">
          <Skeleton className="h-1 w-full rounded-none" />
          <div className="space-y-4 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <Skeleton className="size-14 rounded-xl" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-11 w-36 rounded-lg" />
              <Skeleton className="h-11 w-28 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((key) => (
            <div key={key} className="card space-y-4 p-5 sm:p-6">
              <Skeleton className="size-11 rounded-xl" />
              <Skeleton className="h-6 w-44 max-w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PageSkeleton() {
  return (
    <LoadingRegion label="Loading">
      <div className="space-y-8">
        <div className="border-b border-dacfp-line pb-7">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-9 w-80 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="card space-y-4 p-6 sm:p-8">
          <Skeleton className="h-6 w-56 max-w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function QuizSkeleton() {
  return (
    <LoadingRegion label="Loading shuffled questions">
      <div className="card overflow-hidden">
        <div className="border-b border-dacfp-line bg-dacfp-wash px-5 py-4 sm:px-8">
          <div className="flex items-baseline justify-between gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
        </div>
        <div className="space-y-5 p-5 sm:p-8">
          <Skeleton className="h-7 w-full max-w-md" />
          <Skeleton className="h-3 w-28" />
          <div className="grid gap-3">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-dacfp-line px-5 py-4 sm:px-8">
          <Skeleton className="h-11 w-24 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-lg" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function BootSkeleton() {
  return (
    <div className="min-h-dvh bg-dacfp-wash">
      <div className="h-16 bg-dacfp-navy" />
      <div className="brand-strip h-1" />
      <div className="mx-auto max-w-shell px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
