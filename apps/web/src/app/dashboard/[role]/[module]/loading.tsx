import { SkeletonCard } from "@/components/ui/skeleton-card";

export default function DashboardModuleLoading() {
  return (
    <main className="min-h-screen bg-background px-6 py-6">
      <div className="mx-auto grid max-w-[1200px] gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <SkeletonCard className="hidden h-[calc(100vh-48px)] md:block" />
        <div className="space-y-6">
          <SkeletonCard className="h-24" />
          <div className="grid gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} className="h-36" />
            ))}
          </div>
          <SkeletonCard className="h-24" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SkeletonCard className="h-[420px]" />
            <div className="space-y-6">
              <SkeletonCard className="h-[180px]" />
              <SkeletonCard className="h-[180px]" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
