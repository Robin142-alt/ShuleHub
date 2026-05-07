export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-[var(--radius)] border border-border ${className}`}
    />
  );
}
