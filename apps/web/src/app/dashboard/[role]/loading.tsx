export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-background px-6 py-6">
      <div className="mx-auto grid max-w-[1200px] gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="hidden h-[calc(100vh-48px)] rounded-xl border border-border bg-surface md:block" />
        <div className="space-y-6">
          <div className="dashboard-card h-14 rounded-xl" />
          <div className="dashboard-card h-32 rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="dashboard-card h-40 rounded-xl"
              />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="dashboard-card h-[420px] rounded-xl" />
            <div className="space-y-6">
              <div className="dashboard-card h-[200px] rounded-xl" />
              <div className="dashboard-card h-[200px] rounded-xl" />
            </div>
          </div>
          <div className="dashboard-card h-24 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
