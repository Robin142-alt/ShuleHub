import { SkeletonCard } from "@/components/ui/skeleton-card";

export default function LibrarianLibraryLoading() {
  return (
    <main className="min-h-screen bg-[#eef3f1] px-4 py-4 md:px-6">
      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        <SkeletonCard className="h-[680px] bg-slate-900" />
        <div className="space-y-4">
          <SkeletonCard className="h-24" />
          <div className="grid gap-3 md:grid-cols-6">
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <SkeletonCard className="h-72" />
            <SkeletonCard className="h-72" />
          </div>
        </div>
      </div>
    </main>
  );
}
