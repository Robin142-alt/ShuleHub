export function AuthDemoCredentials({
  title,
  subtitle,
  credentials,
}: {
  title: string;
  subtitle: string;
  credentials: Array<{
    id: string;
    label: string;
    identifier: string;
    password: string;
    auxiliaryLabel?: string;
    auxiliaryValue?: string;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm leading-6 text-muted">{subtitle}</p>
      </div>

      <div className="mt-4 space-y-3">
        {credentials.map((credential) => (
          <div
            key={credential.id}
            className="rounded-xl border border-border bg-surface px-4 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              {credential.label}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Login
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {credential.identifier}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Password
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {credential.password}
                </p>
              </div>
              {credential.auxiliaryLabel && credential.auxiliaryValue ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {credential.auxiliaryLabel}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {credential.auxiliaryValue}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
