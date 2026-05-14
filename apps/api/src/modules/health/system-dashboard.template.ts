export const renderSystemDashboard = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ShuleHub Operations Console</title>
    <style>
      :root {
        color-scheme: light;
        --canvas: #f4efdf;
        --ink: #1f2528;
        --muted: #5e6668;
        --panel: rgba(255, 252, 244, 0.95);
        --border: rgba(31, 37, 40, 0.12);
        --shadow: 0 26px 60px rgba(31, 37, 40, 0.12);
        --teal: #0f7b6c;
        --amber: #c47a24;
        --rose: #b34f55;
        --green: #17824f;
        --chip: rgba(15, 123, 108, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 10% 10%, rgba(196, 122, 36, 0.16), transparent 26%),
          radial-gradient(circle at 90% 15%, rgba(15, 123, 108, 0.18), transparent 24%),
          linear-gradient(135deg, #faf5ea 0%, var(--canvas) 44%, #e6efe7 100%);
      }

      .frame {
        width: min(1220px, calc(100% - 32px));
        margin: 24px auto;
      }

      .hero {
        position: relative;
        overflow: hidden;
        background:
          linear-gradient(120deg, rgba(15, 123, 108, 0.12), rgba(196, 122, 36, 0.1)),
          rgba(255, 252, 244, 0.96);
        border: 1px solid var(--border);
        border-radius: 30px;
        box-shadow: var(--shadow);
        padding: 34px 34px 28px;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -40px -90px auto;
        width: 260px;
        height: 260px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(15, 123, 108, 0.18), transparent 68%);
        pointer-events: none;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(15, 123, 108, 0.12);
        color: var(--teal);
        text-transform: uppercase;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
      }

      .eyebrow-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--green);
        box-shadow: 0 0 0 8px rgba(23, 130, 79, 0.12);
      }

      h1 {
        margin: 18px 0 10px;
        font-size: clamp(42px, 7vw, 78px);
        line-height: 0.92;
        max-width: 8ch;
      }

      .lead {
        margin: 0;
        max-width: 64ch;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.65;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 22px;
      }

      .action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 156px;
        padding: 12px 18px;
        border-radius: 999px;
        border: 1px solid transparent;
        text-decoration: none;
        font-weight: 700;
        font-size: 14px;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }

      .action:hover {
        transform: translateY(-1px);
      }

      .action.primary {
        color: #fff;
        background: linear-gradient(135deg, var(--teal), #125d53);
        box-shadow: 0 14px 28px rgba(15, 123, 108, 0.22);
      }

      .action.secondary {
        color: var(--ink);
        background: rgba(255, 255, 255, 0.68);
        border-color: var(--border);
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.95fr);
        gap: 22px;
        margin-top: 22px;
      }

      .stack {
        display: grid;
        gap: 22px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 26px;
        box-shadow: var(--shadow);
        padding: 24px;
      }

      .panel-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }

      .panel-title {
        margin: 0;
        font-size: 24px;
      }

      .panel-copy {
        margin: 6px 0 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .timestamp {
        white-space: nowrap;
        font-size: 13px;
        color: var(--muted);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }

      .metric-card {
        border-radius: 20px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.72);
        padding: 18px;
      }

      .metric-label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
        font-weight: 700;
      }

      .metric-value {
        font-size: 32px;
        font-weight: 700;
        line-height: 1.05;
      }

      .metric-note {
        margin-top: 8px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .status-badge::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: currentColor;
      }

      .status-healthy {
        color: var(--green);
        background: rgba(23, 130, 79, 0.1);
      }

      .status-degraded,
      .status-warning {
        color: var(--amber);
        background: rgba(196, 122, 36, 0.12);
      }

      .status-critical,
      .status-failed {
        color: var(--rose);
        background: rgba(179, 79, 85, 0.12);
      }

      .status-unknown {
        color: var(--muted);
        background: rgba(94, 102, 104, 0.1);
      }

      .service-list,
      .subsystem-list,
      .alerts-list,
      .endpoints-list {
        display: grid;
        gap: 12px;
      }

      .service-row,
      .subsystem-row,
      .alert-row,
      .endpoint-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 16px 18px;
        border-radius: 20px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.72);
      }

      .service-name,
      .subsystem-name,
      .alert-title,
      .endpoint-name {
        font-weight: 700;
        font-size: 17px;
      }

      .service-copy,
      .subsystem-copy,
      .alert-copy,
      .endpoint-copy {
        margin-top: 4px;
        color: var(--muted);
        line-height: 1.5;
        font-size: 14px;
      }

      .alert-copy {
        margin-right: 10px;
      }

      .empty {
        padding: 22px 18px;
        border-radius: 20px;
        border: 1px dashed rgba(15, 123, 108, 0.2);
        color: var(--muted);
        background: rgba(15, 123, 108, 0.04);
      }

      .code {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--chip);
        color: var(--teal);
        font-family: "Courier New", Courier, monospace;
        font-size: 13px;
      }

      .footer {
        margin-top: 22px;
        text-align: center;
        color: var(--muted);
        font-size: 13px;
      }

      @media (max-width: 980px) {
        .layout {
          grid-template-columns: 1fr;
        }

        h1 {
          max-width: 12ch;
        }
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <section class="hero">
        <div class="eyebrow">
          <span class="eyebrow-dot"></span>
          Live Production Console
        </div>
        <h1>ShuleHub SaaS Operations</h1>
        <p class="lead">
          This frontend is connected to the live NestJS backend and renders real health,
          readiness, observability, and queue-alert data from the deployed production system.
        </p>
        <div class="hero-actions">
          <a class="action primary" href="/health/ready">Open Readiness</a>
          <a class="action secondary" href="/observability/dashboard">Open Raw Dashboard JSON</a>
          <a class="action secondary" href="/observability/alerts">Open Alerts JSON</a>
        </div>
      </section>

      <section class="layout">
        <div class="stack">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2 class="panel-title">Command Center</h2>
                <p class="panel-copy">
                  Fast view of overall runtime, open alert count, database and Redis status,
                  and the current queue posture.
                </p>
              </div>
              <div class="timestamp" id="lastUpdated">Refreshing...</div>
            </div>
            <div class="metric-grid" id="summaryMetrics">
              <div class="metric-card">
                <span class="metric-label">Overall</span>
                <div class="metric-value">Loading</div>
                <div class="metric-note">Fetching deployed health data.</div>
              </div>
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2 class="panel-title">Subsystem Status</h2>
                <p class="panel-copy">
                  Live service and subsystem state from readiness and observability endpoints.
                </p>
              </div>
            </div>
            <div class="service-list" id="serviceList"></div>
            <div class="subsystem-list" id="subsystemList" style="margin-top: 12px;"></div>
          </article>
        </div>

        <div class="stack">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2 class="panel-title">Open Alerts</h2>
                <p class="panel-copy">
                  The current SLO and queue warnings coming from the production service.
                </p>
              </div>
            </div>
            <div class="alerts-list" id="alertsList"></div>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2 class="panel-title">Useful Endpoints</h2>
                <p class="panel-copy">
                  Quick links for health, observability, and API inspection.
                </p>
              </div>
            </div>
            <div class="endpoints-list">
              <a class="endpoint-row" href="/health">
                <div>
                  <div class="endpoint-name">Liveness Probe</div>
                  <div class="endpoint-copy">Simple public runtime check.</div>
                </div>
                <span class="code">GET /health</span>
              </a>
              <a class="endpoint-row" href="/health/ready">
                <div>
                  <div class="endpoint-name">Readiness Probe</div>
                  <div class="endpoint-copy">Database, Redis, and readiness state.</div>
                </div>
                <span class="code">GET /health/ready</span>
              </a>
              <a class="endpoint-row" href="/observability/dashboard">
                <div>
                  <div class="endpoint-name">Observability Dashboard</div>
                  <div class="endpoint-copy">Raw dashboard payload used by this page.</div>
                </div>
                <span class="code">GET /observability/dashboard</span>
              </a>
              <a class="endpoint-row" href="/observability/alerts">
                <div>
                  <div class="endpoint-name">Alerts Feed</div>
                  <div class="endpoint-copy">Active alert inventory and severity.</div>
                </div>
                <span class="code">GET /observability/alerts</span>
              </a>
            </div>
          </article>
        </div>
      </section>

      <div class="footer">
        Auto-refreshes every 20 seconds from the live deployment.
      </div>
    </div>

    <script>
      const summaryMetrics = document.getElementById('summaryMetrics');
      const serviceList = document.getElementById('serviceList');
      const subsystemList = document.getElementById('subsystemList');
      const alertsList = document.getElementById('alertsList');
      const lastUpdated = document.getElementById('lastUpdated');

      const escapeHtml = (value) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const statusClass = (status) => {
        const normalized = String(status || 'unknown').toLowerCase();

        if (normalized === 'healthy' || normalized === 'ok' || normalized === 'up') {
          return 'status-healthy';
        }

        if (normalized === 'degraded' || normalized === 'warning' || normalized === 'configured') {
          return 'status-degraded';
        }

        if (normalized === 'critical' || normalized === 'error' || normalized === 'failed' || normalized === 'down') {
          return 'status-critical';
        }

        return 'status-unknown';
      };

      const formatTimestamp = (value) => {
        if (!value) {
          return 'No timestamp';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return String(value);
        }

        return date.toLocaleString();
      };

      const renderSummary = (health, readiness, alerts) => {
        const alertCount = Array.isArray(alerts) ? alerts.length : 0;
        const overall = health?.overall_status ?? readiness?.status ?? 'unknown';
        const requestId = readiness?.request_context?.request_id ?? 'n/a';
        const servicesUp = readiness?.services
          ? Object.values(readiness.services).filter((value) => value === 'up' || value === 'configured').length
          : 0;

        summaryMetrics.innerHTML = [
          {
            label: 'Overall',
            value: overall,
            note: 'Live status reported by the deployed backend.',
          },
          {
            label: 'Open Alerts',
            value: alertCount,
            note: alertCount === 0 ? 'No active warnings right now.' : 'Warnings currently need attention.',
          },
          {
            label: 'Healthy Services',
            value: servicesUp,
            note: 'Counts Postgres, Redis, and BullMQ readiness flags.',
          },
          {
            label: 'Request ID',
            value: requestId.slice(0, 8),
            note: 'Most recent readiness probe correlation id.',
          },
        ].map((metric) => \`
          <div class="metric-card">
            <span class="metric-label">\${escapeHtml(metric.label)}</span>
            <div class="metric-value">\${escapeHtml(metric.value)}</div>
            <div class="metric-note">\${escapeHtml(metric.note)}</div>
          </div>
        \`).join('');
      };

      const renderServices = (readiness) => {
        const services = readiness?.services ?? {};
        const entries = Object.entries(services);

        if (entries.length === 0) {
          serviceList.innerHTML = '<div class="empty">Service readiness is not available yet.</div>';
          return;
        }

        serviceList.innerHTML = entries.map(([name, status]) => \`
          <div class="service-row">
            <div>
              <div class="service-name">\${escapeHtml(name)}</div>
              <div class="service-copy">Runtime service check from <span class="code">/health/ready</span>.</div>
            </div>
            <span class="status-badge \${statusClass(status)}">\${escapeHtml(status)}</span>
          </div>
        \`).join('');
      };

      const renderSubsystems = (health) => {
        const subsystems = health?.subsystem_statuses ?? [];

        if (!subsystems.length) {
          subsystemList.innerHTML = '<div class="empty">Subsystem health has not been reported yet.</div>';
          return;
        }

        subsystemList.innerHTML = subsystems.map((item) => \`
          <div class="subsystem-row">
            <div>
              <div class="subsystem-name">\${escapeHtml(item.subsystem)}</div>
              <div class="subsystem-copy">Derived from rolling SLO evaluations.</div>
            </div>
            <span class="status-badge \${statusClass(item.status)}">\${escapeHtml(item.status)}</span>
          </div>
        \`).join('');
      };

      const renderAlerts = (alerts) => {
        if (!Array.isArray(alerts) || alerts.length === 0) {
          alertsList.innerHTML = '<div class="empty">No active alerts. The production signal is quiet right now.</div>';
          return;
        }

        alertsList.innerHTML = alerts.map((alert) => \`
          <div class="alert-row">
            <div>
              <div class="alert-title">\${escapeHtml(alert.title || alert.id)}</div>
              <div class="alert-copy">\${escapeHtml(alert.message || 'No alert details provided.')}</div>
              <div class="alert-copy">Last evaluated: \${escapeHtml(formatTimestamp(alert.last_evaluated_at))}</div>
            </div>
            <span class="status-badge \${statusClass(alert.severity || alert.status)}">\${escapeHtml(alert.severity || alert.status || 'warning')}</span>
          </div>
        \`).join('');
      };

      const renderFailure = (message) => {
        const fallback = '<div class="empty">' + escapeHtml(message) + '</div>';
        summaryMetrics.innerHTML = fallback;
        serviceList.innerHTML = fallback;
        subsystemList.innerHTML = fallback;
        alertsList.innerHTML = fallback;
      };

      const refresh = async () => {
        try {
          const [healthResponse, readinessResponse, alertsResponse] = await Promise.all([
            fetch('/observability/health', { cache: 'no-store' }),
            fetch('/health/ready', { cache: 'no-store' }),
            fetch('/observability/alerts', { cache: 'no-store' }),
          ]);

          if (!healthResponse.ok || !readinessResponse.ok || !alertsResponse.ok) {
            throw new Error('One or more live endpoints returned a non-200 response.');
          }

          const healthPayload = await healthResponse.json();
          const readinessPayload = await readinessResponse.json();
          const alertsPayload = await alertsResponse.json();

          const health = healthPayload.data ?? healthPayload;
          const readiness = readinessPayload.data ?? readinessPayload;
          const alerts = alertsPayload.data?.alerts ?? alertsPayload.alerts ?? [];

          renderSummary(health, readiness, alerts);
          renderServices(readiness);
          renderSubsystems(health);
          renderAlerts(alerts);
          lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        } catch (error) {
          renderFailure(error instanceof Error ? error.message : 'Failed to load live frontend data.');
          lastUpdated.textContent = 'Last updated: failed';
        }
      };

      refresh();
      setInterval(refresh, 20000);
    </script>
  </body>
</html>`;
