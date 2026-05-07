export const renderErpPortal = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ShuleHub ERP</title>
    <style>
      :root {
        color-scheme: light;
        --canvas: #f5efdf;
        --surface: rgba(255, 252, 244, 0.96);
        --surface-2: rgba(255, 255, 255, 0.74);
        --ink: #20272b;
        --muted: #5f6769;
        --border: rgba(32, 39, 43, 0.12);
        --shadow: 0 28px 70px rgba(32, 39, 43, 0.12);
        --teal: #0f7b6c;
        --teal-deep: #11584f;
        --amber: #c7842e;
        --rose: #b04b57;
        --green: #18804f;
        --slate: #758087;
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
          radial-gradient(circle at 8% 10%, rgba(199, 132, 46, 0.16), transparent 26%),
          radial-gradient(circle at 88% 12%, rgba(15, 123, 108, 0.16), transparent 28%),
          linear-gradient(135deg, #fbf5ea 0%, var(--canvas) 48%, #e6efe8 100%);
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      a {
        color: inherit;
      }

      .shell {
        width: min(1440px, calc(100% - 28px));
        margin: 14px auto;
        display: grid;
        grid-template-columns: 292px minmax(0, 1fr);
        gap: 18px;
      }

      .sidebar,
      .panel,
      .auth-card {
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
      }

      .sidebar {
        border-radius: 30px;
        padding: 24px;
        position: sticky;
        top: 14px;
        height: calc(100vh - 28px);
        overflow: auto;
      }

      .brand {
        display: grid;
        gap: 10px;
        margin-bottom: 22px;
      }

      .brand-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: fit-content;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(15, 123, 108, 0.12);
        color: var(--teal);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 11px;
        font-weight: 700;
      }

      .brand-dot,
      .status-badge::before {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: currentColor;
        display: inline-block;
        content: "";
      }

      .brand-title {
        margin: 0;
        font-size: 42px;
        line-height: 0.95;
      }

      .brand-copy {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .nav {
        display: grid;
        gap: 10px;
        margin-top: 24px;
      }

      .nav-button,
      .action-button,
      .primary-button,
      .ghost-button {
        border: 0;
        border-radius: 18px;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }

      .nav-button:hover,
      .action-button:hover,
      .primary-button:hover,
      .ghost-button:hover {
        transform: translateY(-1px);
      }

      .nav-button {
        text-align: left;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.58);
        border: 1px solid transparent;
        color: var(--ink);
      }

      .nav-button.active {
        background: linear-gradient(135deg, rgba(15, 123, 108, 0.14), rgba(17, 88, 79, 0.08));
        border-color: rgba(15, 123, 108, 0.18);
      }

      .nav-label {
        display: block;
        font-size: 16px;
        font-weight: 700;
      }

      .nav-copy {
        display: block;
        margin-top: 6px;
        font-size: 13px;
        color: var(--muted);
      }

      .tenant-card {
        margin-top: 24px;
        border-radius: 22px;
        padding: 18px;
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid var(--border);
      }

      .tenant-card h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }

      .tenant-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(15, 123, 108, 0.08);
        color: var(--teal);
        font-size: 12px;
        font-weight: 700;
      }

      .main {
        display: grid;
        gap: 18px;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: center;
        background: rgba(255, 252, 244, 0.72);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 16px 22px;
      }

      .headline h2 {
        margin: 0;
        font-size: 30px;
      }

      .headline p {
        margin: 6px 0 0;
        color: var(--muted);
      }

      .user-cluster {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid var(--border);
        font-size: 13px;
        font-weight: 700;
      }

      .panel {
        border-radius: 30px;
        padding: 26px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
        gap: 18px;
        overflow: hidden;
        position: relative;
        background:
          linear-gradient(120deg, rgba(15, 123, 108, 0.12), rgba(199, 132, 46, 0.1)),
          var(--surface);
      }

      .hero::after {
        content: "";
        position: absolute;
        right: -80px;
        bottom: -120px;
        width: 320px;
        height: 320px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(15, 123, 108, 0.18), transparent 68%);
      }

      .hero h1 {
        margin: 0;
        font-size: clamp(44px, 6vw, 82px);
        line-height: 0.92;
        max-width: 10ch;
      }

      .hero p {
        margin: 16px 0 0;
        color: var(--muted);
        max-width: 62ch;
        font-size: 18px;
        line-height: 1.7;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }

      .primary-button,
      .ghost-button,
      .action-button {
        padding: 12px 18px;
        font-weight: 700;
      }

      .primary-button {
        color: #fff;
        background: linear-gradient(135deg, var(--teal), var(--teal-deep));
        box-shadow: 0 18px 32px rgba(15, 123, 108, 0.22);
      }

      .ghost-button,
      .action-button {
        color: var(--ink);
        background: rgba(255, 255, 255, 0.76);
        border: 1px solid var(--border);
      }

      .hero-status {
        display: grid;
        gap: 14px;
        position: relative;
        z-index: 1;
      }

      .auth-layout {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .auth-card {
        border-radius: 26px;
        padding: 22px;
      }

      .auth-card h3,
      .section-heading h3,
      .section-heading h2 {
        margin: 0;
      }

      .auth-card p,
      .section-heading p {
        color: var(--muted);
        line-height: 1.55;
      }

      .section {
        display: none;
      }

      .section.active {
        display: grid;
        gap: 18px;
      }

      .grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .grid-3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .metric-card,
      .data-card,
      .info-card {
        border-radius: 22px;
        padding: 18px;
        border: 1px solid var(--border);
        background: var(--surface-2);
      }

      .metric-label {
        display: block;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
        font-weight: 700;
      }

      .metric-value {
        margin-top: 10px;
        font-size: 34px;
        font-weight: 700;
        line-height: 1.05;
      }

      .metric-note {
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.45;
        font-size: 14px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        text-transform: uppercase;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
      }

      .status-healthy {
        color: var(--green);
        background: rgba(24, 128, 79, 0.1);
      }

      .status-degraded,
      .status-warning,
      .status-configured {
        color: var(--amber);
        background: rgba(199, 132, 46, 0.12);
      }

      .status-critical,
      .status-error,
      .status-failed,
      .status-down {
        color: var(--rose);
        background: rgba(176, 75, 87, 0.12);
      }

      .status-unknown {
        color: var(--slate);
        background: rgba(117, 128, 135, 0.12);
      }

      form {
        display: grid;
        gap: 12px;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      label {
        display: grid;
        gap: 6px;
        font-size: 14px;
        font-weight: 700;
      }

      input,
      select,
      textarea {
        width: 100%;
        border-radius: 16px;
        border: 1px solid rgba(32, 39, 43, 0.16);
        background: rgba(255, 255, 255, 0.94);
        padding: 12px 14px;
        color: var(--ink);
      }

      textarea {
        resize: vertical;
        min-height: 96px;
      }

      .message {
        min-height: 22px;
        font-size: 14px;
        color: var(--muted);
      }

      .message.error {
        color: var(--rose);
      }

      .message.success {
        color: var(--green);
      }

      .table-shell,
      .list-shell {
        overflow: auto;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.78);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 780px;
      }

      th,
      td {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(32, 39, 43, 0.08);
        text-align: left;
        vertical-align: top;
      }

      th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--muted);
      }

      .mini-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .mini-button {
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.86);
        border-radius: 999px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .empty-state {
        padding: 22px 18px;
        color: var(--muted);
      }

      .overview-stack {
        display: grid;
        gap: 18px;
      }

      .priority-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .priority-card {
        border-radius: 22px;
        padding: 18px;
        border: 1px solid var(--border);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 250, 242, 0.7));
        display: grid;
        gap: 10px;
      }

      .priority-card h4,
      .summary-card h4,
      .radar-card h4 {
        margin: 0;
        font-size: 18px;
      }

      .priority-kicker,
      .summary-kicker {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        font-weight: 700;
      }

      .priority-copy,
      .summary-copy {
        color: var(--muted);
        line-height: 1.6;
        font-size: 14px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .summary-card {
        border-radius: 22px;
        padding: 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.8);
        display: grid;
        gap: 12px;
      }

      .summary-value {
        font-size: 32px;
        font-weight: 700;
        line-height: 1.05;
      }

      .summary-microgrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .summary-micro {
        border-radius: 18px;
        padding: 12px;
        background: rgba(15, 123, 108, 0.06);
      }

      .summary-micro span {
        display: block;
      }

      .summary-micro-label {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 10px;
        font-weight: 700;
      }

      .summary-micro-value {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 700;
      }

      .progress-stack {
        display: grid;
        gap: 12px;
      }

      .progress-card {
        border-radius: 18px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid var(--border);
      }

      .progress-row {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: center;
      }

      .progress-title {
        font-weight: 700;
      }

      .progress-copy {
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }

      .progress-track {
        margin-top: 12px;
        height: 10px;
        border-radius: 999px;
        background: rgba(32, 39, 43, 0.08);
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--teal), var(--amber));
      }

      .radar-grid {
        display: grid;
        gap: 12px;
      }

      .radar-card {
        border-radius: 20px;
        padding: 16px 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.8);
        display: grid;
        gap: 10px;
      }

      .radar-copy {
        color: var(--muted);
        line-height: 1.5;
        font-size: 14px;
      }

      .objective-list {
        display: grid;
        gap: 8px;
      }

      .objective-chip {
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(15, 123, 108, 0.06);
        font-size: 13px;
        color: var(--muted);
      }

      .playbook-grid,
      .risk-list {
        display: grid;
        gap: 12px;
      }

      .playbook-card,
      .risk-card {
        border-radius: 20px;
        padding: 16px 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.82);
        display: grid;
        gap: 10px;
      }

      .playbook-window {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        font-weight: 700;
      }

      .playbook-card h4,
      .risk-card h4 {
        margin: 0;
        font-size: 18px;
      }

      .playbook-copy,
      .risk-copy,
      .risk-meta {
        color: var(--muted);
        line-height: 1.55;
        font-size: 14px;
      }

      .risk-meta {
        font-size: 13px;
      }

      .alert-item,
      .service-item,
      .timeline-item {
        display: grid;
        gap: 8px;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(32, 39, 43, 0.08);
      }

      .alert-item:last-child,
      .service-item:last-child,
      .timeline-item:last-child {
        border-bottom: 0;
      }

      .item-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .code {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(15, 123, 108, 0.08);
        color: var(--teal);
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
      }

      .hidden {
        display: none !important;
      }

      @media (max-width: 1180px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          height: auto;
        }

        .hero,
        .auth-layout,
        .grid-2,
        .grid-3,
        .field-grid,
        .priority-grid,
        .summary-grid,
        .summary-microgrid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-eyebrow"><span class="brand-dot" style="color: var(--green);"></span> Live ERP</div>
          <h1 class="brand-title">ShuleHub</h1>
          <p class="brand-copy">
            School operations, attendance, billing, and platform health in one place.
          </p>
        </div>

        <div class="nav">
          <button class="nav-button active" data-section="overview">
            <span class="nav-label">Overview</span>
            <span class="nav-copy">System posture, usage snapshot, and onboarding state.</span>
          </button>
          <button class="nav-button" data-section="students">
            <span class="nav-label">Students</span>
            <span class="nav-copy">Admission register and guardian details.</span>
          </button>
          <button class="nav-button" data-section="attendance">
            <span class="nav-label">Attendance</span>
            <span class="nav-copy">Daily marking and history by student.</span>
          </button>
          <button class="nav-button" data-section="billing">
            <span class="nav-label">Billing</span>
            <span class="nav-copy">Subscription, usage, invoices, and fees.</span>
          </button>
          <button class="nav-button" data-section="ops">
            <span class="nav-label">Operations</span>
            <span class="nav-copy">Health, alerts, and live backend signals.</span>
          </button>
        </div>

        <div class="tenant-card">
          <h3>Tenant context</h3>
          <p>
            This deployment uses the backend tenant resolver on the current host. The first
            registered user on this tenant becomes the owner and can onboard billing immediately.
          </p>
          <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
            <span class="chip" id="tenantChip">Tenant: resolving</span>
            <span class="chip" id="authChip">Guest mode</span>
          </div>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="headline">
            <h2 id="pageTitle">ERP overview</h2>
            <p id="pageSubtitle">Register or log in to manage your school on the live deployment.</p>
          </div>
          <div class="user-cluster">
            <span class="pill" id="userPill">Guest</span>
            <span class="pill" id="subscriptionPill">Subscription: unknown</span>
            <button class="ghost-button hidden" id="logoutButton" type="button">Log out</button>
          </div>
        </header>

        <section class="panel hero">
          <div>
            <div class="brand-eyebrow"><span class="brand-dot" style="color: var(--teal);"></span> Production ERP workspace</div>
            <h1>Run admissions, attendance, and billing from one live console.</h1>
            <p>
              This frontend talks directly to the deployed NestJS backend. Create a tenant owner
              account, activate a plan, admit students, mark attendance, and inspect system health
              without leaving the page.
            </p>
            <div class="hero-actions">
              <button class="primary-button" type="button" id="heroPrimaryButton">Create owner account</button>
              <button class="ghost-button" type="button" id="heroSecondaryButton">Open operations</button>
            </div>
          </div>
          <div class="hero-status">
            <div class="metric-card">
              <span class="metric-label">Readiness</span>
              <div class="metric-value" id="heroReadinessValue">Loading</div>
              <div class="metric-note" id="heroReadinessNote">Checking Postgres, Redis, and queue state.</div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Open alerts</span>
              <div class="metric-value" id="heroAlertsValue">0</div>
              <div class="metric-note" id="heroAlertsNote">Fetching live alert feed.</div>
            </div>
          </div>
        </section>

        <section class="auth-layout" id="authArea">
          <article class="auth-card">
            <div class="section-heading">
              <h3>Create the owner account</h3>
              <p>
                First registration on this tenant becomes the owner and unlocks billing setup for the ERP.
              </p>
            </div>
            <form id="registerForm">
              <label>
                Display name
                <input type="text" name="display_name" placeholder="School administrator" required />
              </label>
              <label>
                Email
                <input type="email" name="email" placeholder="admin@school.com" required />
              </label>
              <label>
                Password
                <input type="password" name="password" placeholder="Minimum 8 characters" minlength="8" required />
              </label>
              <button class="primary-button" type="submit">Register and enter ERP</button>
              <div class="message" id="registerMessage"></div>
            </form>
          </article>

          <article class="auth-card">
            <div class="section-heading">
              <h3>Sign in</h3>
              <p>
                Existing tenant members can sign in here and continue from the same live data.
              </p>
            </div>
            <form id="loginForm">
              <label>
                Email
                <input type="email" name="email" placeholder="admin@school.com" required />
              </label>
              <label>
                Password
                <input type="password" name="password" placeholder="Your password" minlength="8" required />
              </label>
              <button class="primary-button" type="submit">Log in to ERP</button>
              <div class="message" id="loginMessage"></div>
            </form>
          </article>
        </section>

        <section class="section active" id="section-overview">
          <div class="overview-stack">
            <div class="grid-3" id="overviewMetrics">
              <div class="metric-card">
                <span class="metric-label">Students</span>
                <div class="metric-value">0</div>
                <div class="metric-note">Register a tenant and load the student book.</div>
              </div>
            </div>

            <div class="grid-2">
              <article class="panel">
                <div class="section-heading">
                  <h3>Action deck</h3>
                  <p>
                    The dashboard should answer what to do next for school operators, not just report numbers.
                  </p>
                </div>
                <div class="priority-grid" id="priorityActionGrid">
                  <div class="priority-card">
                    <div class="priority-kicker">Action focus</div>
                    <h4>Loading next-best actions</h4>
                    <div class="priority-copy">The ERP is assembling your onboarding and exception queue.</div>
                  </div>
                </div>
              </article>

              <article class="panel">
                <div class="section-heading">
                  <h3>Financial truth</h3>
                  <p>
                    Finance should be trusted at a glance: invoices, exposure, and MPESA-to-ledger reconciliation.
                  </p>
                </div>
                <div class="summary-grid">
                  <div class="summary-card" id="invoiceSummaryCard">
                    <div class="empty-state">Loading invoice summary…</div>
                  </div>
                  <div class="summary-card" id="reconciliationSummaryCard">
                    <div class="empty-state">Loading reconciliation signal…</div>
                  </div>
                </div>
              </article>
            </div>

            <div class="grid-2">
              <article class="panel">
                <div class="section-heading">
                  <h3>Plan pressure</h3>
                  <p>
                    The best ERP dashboard shows capacity and commercial risk before operators hit hard limits.
                  </p>
                </div>
                <div class="progress-stack" id="usagePressureList">
                  <div class="empty-state">Loading plan utilization…</div>
                </div>
              </article>

              <article class="panel">
                <div class="section-heading">
                  <h3>Subsystem radar</h3>
                  <p>
                    Each subsystem should explain its own health, not hide behind a single green or red badge.
                  </p>
                </div>
                <div class="radar-grid" id="subsystemRadarList">
                  <div class="empty-state">Loading subsystem radar…</div>
                </div>
              </article>
            </div>

            <div class="grid-2">
              <article class="panel">
                <div class="section-heading">
                  <h3>School-day command center</h3>
                  <p>
                    A school ERP should match the rhythm of the day: attendance in the morning, exceptions at midday, collections in the evening.
                  </p>
                </div>
                <div class="playbook-grid" id="schoolDayPlaybookList">
                  <div class="empty-state">Loading school-day operating playbook…</div>
                </div>
              </article>

              <article class="panel">
                <div class="section-heading">
                  <h3>Risk register</h3>
                  <p>
                    Operators need the few risks that can actually change school operations, ranked clearly with an owner and next response.
                  </p>
                </div>
                <div class="risk-list" id="riskRegisterList">
                  <div class="empty-state">Loading tenant risk register…</div>
                </div>
              </article>
            </div>

            <div class="grid-2">
              <article class="panel">
                <div class="section-heading">
                  <h3>Getting started</h3>
                  <p id="onboardingCopy">
                    Start by creating an owner account, then activate a subscription plan to unlock student and attendance flows.
                  </p>
                </div>
                <div class="list-shell">
                  <div class="timeline-item">
                    <div class="item-row">
                      <strong>1. Register or log in</strong>
                      <span class="code">auth</span>
                    </div>
                    <div style="color: var(--muted);">Establish the tenant owner session on this deployment.</div>
                  </div>
                  <div class="timeline-item">
                    <div class="item-row">
                      <strong>2. Create a subscription</strong>
                      <span class="code">billing</span>
                    </div>
                    <div style="color: var(--muted);">Use the Billing tab to activate Trial, Starter, Growth, or Enterprise.</div>
                  </div>
                  <div class="timeline-item">
                    <div class="item-row">
                      <strong>3. Admit students</strong>
                      <span class="code">students</span>
                    </div>
                    <div style="color: var(--muted);">Add admission numbers, learner names, and guardian contacts.</div>
                  </div>
                  <div class="timeline-item">
                    <div class="item-row">
                      <strong>4. Mark attendance</strong>
                      <span class="code">attendance</span>
                    </div>
                    <div style="color: var(--muted);">Pick a student, set the date, and write the daily status.</div>
                  </div>
                </div>
              </article>

              <article class="panel">
                <div class="section-heading">
                  <h3>Live backend posture</h3>
                  <p>
                    Quick operational visibility from readiness and observability while you use the ERP.
                  </p>
                </div>
                <div class="list-shell" id="overviewOpsList">
                  <div class="empty-state">Fetching service posture…</div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section class="section" id="section-students">
          <div class="grid-2">
            <article class="panel">
              <div class="section-heading">
                <h3>Admit a student</h3>
                <p>
                  Add the learner to the ERP register. This writes to the live multi-tenant backend.
                </p>
              </div>
              <form id="studentForm">
                <div class="field-grid">
                  <label>
                    Admission number
                    <input type="text" name="admission_number" required />
                  </label>
                  <label>
                    Status
                    <select name="status">
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                      <option value="graduated">graduated</option>
                      <option value="transferred">transferred</option>
                    </select>
                  </label>
                </div>
                <div class="field-grid">
                  <label>
                    First name
                    <input type="text" name="first_name" required />
                  </label>
                  <label>
                    Last name
                    <input type="text" name="last_name" required />
                  </label>
                </div>
                <div class="field-grid">
                  <label>
                    Middle name
                    <input type="text" name="middle_name" />
                  </label>
                  <label>
                    Date of birth
                    <input type="date" name="date_of_birth" />
                  </label>
                </div>
                <div class="field-grid">
                  <label>
                    Gender
                    <select name="gender">
                      <option value="">Select</option>
                      <option value="male">male</option>
                      <option value="female">female</option>
                      <option value="other">other</option>
                      <option value="undisclosed">undisclosed</option>
                    </select>
                  </label>
                  <label>
                    Guardian name
                    <input type="text" name="primary_guardian_name" />
                  </label>
                </div>
                <label>
                  Guardian phone
                  <input type="text" name="primary_guardian_phone" placeholder="+2547..." />
                </label>
                <button class="primary-button" type="submit">Create student</button>
                <div class="message" id="studentFormMessage"></div>
              </form>
            </article>

            <article class="panel">
              <div class="section-heading">
                <h3>Student register</h3>
                <p>
                  Search, refresh, and use the live list to drive attendance and billing operations.
                </p>
              </div>
              <div class="hero-actions" style="margin-top: 0;">
                <input id="studentSearchInput" type="text" placeholder="Search by name or admission number" />
                <button class="action-button" id="studentsRefreshButton" type="button">Refresh</button>
              </div>
              <div class="table-shell" style="margin-top: 14px;">
                <table>
                  <thead>
                    <tr>
                      <th>Admission</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Guardian</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="studentsTableBody">
                    <tr><td colspan="6" class="empty-state">No students loaded yet.</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="message" id="studentsListMessage"></div>
            </article>
          </div>
        </section>

        <section class="section" id="section-attendance">
          <div class="grid-2">
            <article class="panel">
              <div class="section-heading">
                <h3>Mark attendance</h3>
                <p>
                  Choose a student, pick the attendance date, and post the status to the live sync-aware backend.
                </p>
              </div>
              <form id="attendanceForm">
                <label>
                  Student
                  <select name="student_id" id="attendanceStudentSelect" required>
                    <option value="">Choose a student</option>
                  </select>
                </label>
                <div class="field-grid">
                  <label>
                    Attendance date
                    <input type="date" name="attendance_date" required />
                  </label>
                  <label>
                    Status
                    <select name="status">
                      <option value="present">present</option>
                      <option value="absent">absent</option>
                      <option value="late">late</option>
                      <option value="excused">excused</option>
                    </select>
                  </label>
                </div>
                <label>
                  Notes
                  <textarea name="notes" placeholder="Optional attendance notes"></textarea>
                </label>
                <button class="primary-button" type="submit">Save attendance</button>
                <div class="message" id="attendanceFormMessage"></div>
              </form>
            </article>

            <article class="panel">
              <div class="section-heading">
                <h3>Attendance history</h3>
                <p>
                  Pull recent attendance for the selected learner. The same student list is reused here.
                </p>
              </div>
              <div class="hero-actions" style="margin-top: 0;">
                <button class="action-button" id="attendanceRefreshButton" type="button">Refresh records</button>
              </div>
              <div class="list-shell" style="margin-top: 14px;" id="attendanceHistoryList">
                <div class="empty-state">Choose a student to load attendance.</div>
              </div>
            </article>
          </div>
        </section>

        <section class="section" id="section-billing">
          <div class="grid-2">
            <article class="panel">
              <div class="section-heading">
                <h3>Subscription</h3>
                <p>
                  Activate or review the plan that unlocks student and attendance features for this tenant.
                </p>
              </div>
              <div class="data-card" id="subscriptionCard">
                <div class="empty-state">No subscription loaded yet.</div>
              </div>
              <form id="subscriptionForm" style="margin-top: 16px;">
                <div class="field-grid">
                  <label>
                    Plan
                    <select name="plan_code">
                      <option value="trial">trial</option>
                      <option value="starter">starter</option>
                      <option value="growth">growth</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </label>
                  <label>
                    Seats
                    <input type="number" name="seats_allocated" min="1" value="10" />
                  </label>
                </div>
                <div class="field-grid">
                  <label>
                    Status
                    <select name="status">
                      <option value="trialing">trialing</option>
                      <option value="active">active</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                      <option value="expired">expired</option>
                    </select>
                  </label>
                  <label>
                    Billing phone
                    <input type="text" name="billing_phone_number" placeholder="+2547..." />
                  </label>
                </div>
                <button class="primary-button" type="submit">Create or replace subscription</button>
                <div class="message" id="subscriptionFormMessage"></div>
              </form>
            </article>

            <article class="panel">
              <div class="section-heading">
                <h3>Usage summary</h3>
                <p>
                  Current metered usage helps explain feature limits and billing posture.
                </p>
              </div>
              <div class="list-shell" id="usageSummaryList">
                <div class="empty-state">No usage summary loaded yet.</div>
              </div>
            </article>
          </div>

          <div class="grid-2">
            <article class="panel">
              <div class="section-heading">
                <h3>Create invoice</h3>
                <p>
                  Use the subscription to issue a new fee invoice in Kenyan shillings minor units.
                </p>
              </div>
              <form id="invoiceForm">
                <label>
                  Description
                  <input type="text" name="description" placeholder="School fees term 2" required />
                </label>
                <div class="field-grid">
                  <label>
                    Total amount (minor)
                    <input type="number" name="total_amount_minor" min="1" placeholder="150000" required />
                  </label>
                  <label>
                    Due date
                    <input type="datetime-local" name="due_at_local" />
                  </label>
                </div>
                <label>
                  Billing phone
                  <input type="text" name="billing_phone_number" placeholder="+2547..." />
                </label>
                <button class="primary-button" type="submit">Create invoice</button>
                <div class="message" id="invoiceFormMessage"></div>
              </form>
            </article>

            <article class="panel">
              <div class="section-heading">
                <h3>Recent invoices</h3>
                <p>
                  The latest billing documents for this tenant. Refresh after invoice creation.
                </p>
              </div>
              <div class="list-shell" id="invoiceList">
                <div class="empty-state">No invoices loaded yet.</div>
              </div>
            </article>
          </div>
        </section>

        <section class="section" id="section-ops">
          <div class="grid-2">
            <article class="panel">
              <div class="section-heading">
                <h3>Live service health</h3>
                <p>
                  Public readiness data from the deployed NestJS environment.
                </p>
              </div>
              <div class="list-shell" id="serviceHealthList">
                <div class="empty-state">Loading service health…</div>
              </div>
            </article>

            <article class="panel">
              <div class="section-heading">
                <h3>Open alerts</h3>
                <p>
                  Active signals from the SLO engine, including queue backlog and API latency.
                </p>
              </div>
              <div class="list-shell" id="alertsList">
                <div class="empty-state">Loading alerts…</div>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>

    <script>
      const STORAGE_KEY = 'shulehub-erp-auth';
      const state = {
        auth: null,
        user: null,
        students: [],
        selectedStudentId: null,
        subscription: null,
        usageSummary: null,
        invoices: [],
        readiness: null,
        health: null,
        dashboard: null,
        reconciliation: null,
        alerts: [],
        activeSection: 'overview',
      };

      const elements = {
        authArea: document.getElementById('authArea'),
        pageTitle: document.getElementById('pageTitle'),
        pageSubtitle: document.getElementById('pageSubtitle'),
        tenantChip: document.getElementById('tenantChip'),
        authChip: document.getElementById('authChip'),
        userPill: document.getElementById('userPill'),
        subscriptionPill: document.getElementById('subscriptionPill'),
        logoutButton: document.getElementById('logoutButton'),
        heroPrimaryButton: document.getElementById('heroPrimaryButton'),
        heroSecondaryButton: document.getElementById('heroSecondaryButton'),
        heroReadinessValue: document.getElementById('heroReadinessValue'),
        heroReadinessNote: document.getElementById('heroReadinessNote'),
        heroAlertsValue: document.getElementById('heroAlertsValue'),
        heroAlertsNote: document.getElementById('heroAlertsNote'),
        overviewMetrics: document.getElementById('overviewMetrics'),
        onboardingCopy: document.getElementById('onboardingCopy'),
        overviewOpsList: document.getElementById('overviewOpsList'),
        priorityActionGrid: document.getElementById('priorityActionGrid'),
        invoiceSummaryCard: document.getElementById('invoiceSummaryCard'),
        reconciliationSummaryCard: document.getElementById('reconciliationSummaryCard'),
        usagePressureList: document.getElementById('usagePressureList'),
        subsystemRadarList: document.getElementById('subsystemRadarList'),
        schoolDayPlaybookList: document.getElementById('schoolDayPlaybookList'),
        riskRegisterList: document.getElementById('riskRegisterList'),
        studentsTableBody: document.getElementById('studentsTableBody'),
        studentsListMessage: document.getElementById('studentsListMessage'),
        studentSearchInput: document.getElementById('studentSearchInput'),
        attendanceStudentSelect: document.getElementById('attendanceStudentSelect'),
        attendanceHistoryList: document.getElementById('attendanceHistoryList'),
        subscriptionCard: document.getElementById('subscriptionCard'),
        usageSummaryList: document.getElementById('usageSummaryList'),
        invoiceList: document.getElementById('invoiceList'),
        serviceHealthList: document.getElementById('serviceHealthList'),
        alertsList: document.getElementById('alertsList'),
      };

      const navButtons = Array.from(document.querySelectorAll('.nav-button'));
      const sections = Array.from(document.querySelectorAll('.section'));

      const escapeHtml = (value) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const statusClass = (status) => {
        const normalized = String(status || 'unknown').toLowerCase();

        if (normalized === 'healthy' || normalized === 'ok' || normalized === 'active' || normalized === 'trialing' || normalized === 'up' || normalized === 'paid') {
          return 'status-healthy';
        }

        if (normalized === 'degraded' || normalized === 'warning' || normalized === 'configured' || normalized === 'pending_payment' || normalized === 'past_due') {
          return 'status-degraded';
        }

        if (normalized === 'critical' || normalized === 'error' || normalized === 'failed' || normalized === 'down' || normalized === 'void' || normalized === 'canceled' || normalized === 'expired' || normalized === 'uncollectible') {
          return 'status-critical';
        }

        return 'status-unknown';
      };

      const formatDate = (value) => {
        if (!value) {
          return '—';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return String(value);
        }

        return date.toLocaleString();
      };

      const formatShortDate = (value) => {
        if (!value) {
          return '—';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return String(value);
        }

        return date.toLocaleDateString();
      };

      const formatMoneyMinor = (value) => {
        const amount = Number(value || 0);
        if (!Number.isFinite(amount)) {
          return String(value ?? '0');
        }

        return new Intl.NumberFormat('en-KE', {
          style: 'currency',
          currency: 'KES',
          minimumFractionDigits: 2,
        }).format(amount / 100);
      };

      const parseMinorAmount = (value) => {
        try {
          return BigInt(String(value ?? '0'));
        } catch (error) {
          return 0n;
        }
      };

      const getTodayReportDate = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
      };

      const computeInvoiceSummary = () => {
        const summary = {
          totalCount: state.invoices.length,
          billedMinor: 0n,
          paidMinor: 0n,
          outstandingMinor: 0n,
          openCount: 0,
          overdueCount: 0,
          pendingCount: 0,
        };

        const nowMs = Date.now();

        state.invoices.forEach((invoice) => {
          const total = parseMinorAmount(invoice.total_amount_minor);
          const paid = parseMinorAmount(invoice.amount_paid_minor);
          const outstanding = total > paid ? total - paid : 0n;

          summary.billedMinor += total;
          summary.paidMinor += paid;
          summary.outstandingMinor += outstanding;

          if (invoice.status === 'open') {
            summary.openCount += 1;
          }

          if (invoice.status === 'pending_payment') {
            summary.pendingCount += 1;
          }

          if (
            outstanding > 0n
            && invoice.status !== 'paid'
            && invoice.status !== 'void'
            && invoice.status !== 'uncollectible'
          ) {
            const dueAt = new Date(invoice.due_at);
            if (!Number.isNaN(dueAt.getTime()) && dueAt.getTime() < nowMs) {
              summary.overdueCount += 1;
            }
          }
        });

        return summary;
      };

      const getUsageQuantity = (featureKey) => {
        const item = (state.usageSummary?.usage || []).find((entry) => entry.feature_key === featureKey);
        return item ? parseMinorAmount(item.total_quantity) : 0n;
      };

      const getTotalUsageEvents = () =>
        (state.usageSummary?.usage || []).reduce(
          (total, item) => total + parseMinorAmount(item.total_quantity),
          0n,
        );

      const getPositiveLimit = (limitKey) => {
        const rawValue = state.subscription?.limits?.[limitKey];
        if (rawValue == null || typeof rawValue === 'boolean') {
          return null;
        }

        if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
          return BigInt(Math.trunc(rawValue));
        }

        if (typeof rawValue === 'string' && /^\\d+$/.test(rawValue.trim())) {
          return BigInt(rawValue.trim());
        }

        return null;
      };

      const buildPressureModel = () => {
        const activeStudents = BigInt(
          state.students.filter((student) => student.status === 'active').length,
        );
        const studentLimit = getPositiveLimit('students.max_active');
        const attendanceUsage = getUsageQuantity('attendance.upserts');
        const attendanceLimit = getPositiveLimit('attendance.upserts.monthly');
        const totalUsage = getTotalUsageEvents();
        const totalUsageLimit = getPositiveLimit('usage.events.monthly');

        return [
          {
            title: 'Active student capacity',
            current: activeStudents,
            limit: studentLimit,
            detail: studentLimit == null
              ? 'No cap is configured for this plan.'
              : String(activeStudents) + ' of ' + String(studentLimit) + ' student slots used.',
          },
          {
            title: 'Attendance write budget',
            current: attendanceUsage,
            limit: attendanceLimit,
            detail: attendanceLimit == null
              ? 'Attendance writes are effectively unbounded on this plan.'
              : String(attendanceUsage) + ' of ' + String(attendanceLimit) + ' attendance writes recorded this period.',
          },
          {
            title: 'Total metered usage',
            current: totalUsage,
            limit: totalUsageLimit,
            detail: totalUsageLimit == null
              ? 'No global event ceiling is configured for this plan.'
              : String(totalUsage) + ' of ' + String(totalUsageLimit) + ' metered events consumed this period.',
          },
        ];
      };

      const getSchoolLocalHour = () => Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        hour12: false,
      }).format(new Date()));

      const getSchoolDayPhase = () => {
        const hour = getSchoolLocalHour();

        if (hour >= 7 && hour < 10) {
          return {
            label: 'Arrival window',
            title: 'Lock in attendance before the first lesson block settles',
            copy: 'Morning execution should focus on class-level attendance capture and spotting absent learners early enough to contact families.',
          };
        }

        if (hour >= 10 && hour < 14) {
          return {
            label: 'Midday operations',
            title: 'Clear exceptions while administrators and teachers are still on campus',
            copy: 'Use the midday block to resolve sync issues, registration gaps, and students who still have missing attendance or finance references.',
          };
        }

        if (hour >= 14 && hour < 16) {
          return {
            label: 'Closeout preparation',
            title: 'Prepare fee follow-up and reporting before families leave the school day',
            copy: 'This is the best time to line up invoice follow-ups, review readiness warnings, and prepare for the parent payment window.',
          };
        }

        if (hour >= 16 && hour < 20) {
          return {
            label: 'Collections peak',
            title: 'Stay ahead of the evening MPESA and billing rush',
            copy: 'Many fee payments land after classes. Finance teams should watch reconciliation health, overdue exposure, and payment queue posture closely now.',
          };
        }

        return {
          label: 'Recovery window',
          title: 'Use the quiet hours to reconcile, review, and reset for tomorrow',
          copy: 'Outside peak hours, the ERP should surface unresolved finance truth issues, observability alerts, and configuration risks that could block the next school day.',
        };
      };

      const buildSchoolDayPlaybook = () => {
        const phase = getSchoolDayPhase();
        const invoiceSummary = computeInvoiceSummary();
        const playbook = [
          {
            window: phase.label,
            title: phase.title,
            copy: phase.copy,
            status: 'healthy',
          },
        ];

        if (!state.user) {
          playbook.push({
            window: 'Access',
            title: 'Authenticate the tenant owner before daily operations start',
            copy: 'The school cannot safely manage admissions, attendance, or collections without an authenticated tenant operator.',
            status: 'warning',
          });
        } else if (!state.subscription) {
          playbook.push({
            window: 'Commercial gate',
            title: 'Activate a plan before frontline staff hit a feature wall',
            copy: 'Admissions and attendance are feature-gated. A tenant should never start the day without confirming commercial access.',
            status: 'critical',
          });
        }

        if (state.students.length === 0) {
          playbook.push({
            window: 'Academic base',
            title: 'Load the student register before expecting usable operations data',
            copy: 'Attendance, finance references, and family communication all degrade when the register is empty or incomplete.',
            status: 'warning',
          });
        }

        if (invoiceSummary.outstandingMinor > 0n) {
          playbook.push({
            window: 'Collections',
            title: 'Prioritize overdue and open fee exposure',
            copy: formatMoneyMinor(invoiceSummary.outstandingMinor.toString()) + ' is still exposed across the active invoice book.',
            status: invoiceSummary.overdueCount > 0 ? 'critical' : 'warning',
          });
        }

        if (state.reconciliation && !state.reconciliation.is_balanced) {
          playbook.push({
            window: 'Finance truth',
            title: 'Resolve MPESA-to-ledger mismatches before the next posting cycle',
            copy: 'Reconciliation is reporting ' + state.reconciliation.summary.discrepancy_count + ' discrepancy signal(s). Treat that as a daily finance control issue.',
            status: 'critical',
          });
        }

        if (state.alerts.length > 0) {
          playbook.push({
            window: 'Platform',
            title: 'Triage live production alerts before they block school workflows',
            copy: state.alerts[0].message || 'Observability has raised an active warning that needs operator attention.',
            status: 'warning',
          });
        }

        return playbook.slice(0, 4);
      };

      const buildRiskRegister = () => {
        const invoiceSummary = computeInvoiceSummary();
        const pressureItems = buildPressureModel();
        const risks = [];

        if (!state.user) {
          risks.push({
            severity: 'critical',
            title: 'Tenant is not authenticated',
            owner: 'Owner / Admin',
            copy: 'Without an authenticated owner session, this deployment is still in public preview mode for the tenant and no real school operations should depend on it.',
          });
        }

        if (state.user && !state.subscription) {
          risks.push({
            severity: 'critical',
            title: 'Commercial access not established',
            owner: 'Bursar / Owner',
            copy: 'The tenant is signed in but has no active subscription, so feature gating can stop daily operations at admission and attendance time.',
          });
        }

        if (invoiceSummary.outstandingMinor > 0n) {
          risks.push({
            severity: invoiceSummary.overdueCount > 0 ? 'critical' : 'warning',
            title: 'Fee collection exposure is open',
            owner: 'Bursar',
            copy: formatMoneyMinor(invoiceSummary.outstandingMinor.toString()) + ' remains outstanding. The ERP should push the finance team toward follow-up before the exposure ages.',
          });
        }

        if (state.reconciliation && !state.reconciliation.is_balanced) {
          risks.push({
            severity: 'critical',
            title: 'MPESA and ledger are not fully aligned',
            owner: 'Finance controller',
            copy: state.reconciliation.summary.discrepancy_count + ' reconciliation discrepancy signal(s) are present. Financial truth should be treated as broken until reconciled.',
          });
        }

        const pressuredItem = pressureItems
          .map((item) => {
            if (!item.limit || item.limit <= 0n) {
              return null;
            }

            const ratio = Number(item.current) / Number(item.limit);
            return Object.assign({}, item, { ratio });
          })
          .filter(Boolean)
          .sort((left, right) => right.ratio - left.ratio)[0];

        if (pressuredItem && pressuredItem.ratio >= 0.7) {
          risks.push({
            severity: pressuredItem.ratio >= 0.9 ? 'critical' : 'warning',
            title: pressuredItem.title + ' is approaching its plan ceiling',
            owner: 'Operations / Commercial',
            copy: pressuredItem.detail,
          });
        }

        const subsystemRisk = state.dashboard?.subsystem_cards?.find((card) => card.status !== 'healthy');
        if (subsystemRisk) {
          risks.push({
            severity: subsystemRisk.status === 'critical' ? 'critical' : 'warning',
            title: (subsystemRisk.display_name || subsystemRisk.subsystem) + ' is off objective',
            owner: 'Platform operations',
            copy: subsystemRisk.objectives?.[0]?.message || 'A subsystem objective is outside target and may degrade school workflows.',
          });
        } else if ((state.readiness?.status || 'unknown') !== 'healthy') {
          risks.push({
            severity: 'warning',
            title: 'Deployment readiness is not fully healthy',
            owner: 'Platform operations',
            copy: 'At least one of Postgres, Redis, or queue readiness is degraded. Operators should watch the platform before it becomes a workflow outage.',
          });
        }

        if (!risks.length) {
          risks.push({
            severity: 'healthy',
            title: 'No critical operating risks are currently surfacing',
            owner: 'System',
            copy: 'The ERP is not currently flagging finance truth breaks, commercial gating issues, or platform-level exceptions for this tenant.',
          });
        }

        const weight = { critical: 3, warning: 2, healthy: 1 };
        return risks
          .sort((left, right) => (weight[right.severity] || 0) - (weight[left.severity] || 0))
          .slice(0, 4);
      };

      const setMessage = (id, message, tone) => {
        const element = document.getElementById(id);
        if (!element) {
          return;
        }

        element.textContent = message || '';
        element.className = 'message' + (tone ? ' ' + tone : '');
      };

      const saveAuth = (payload) => {
        state.auth = payload.tokens;
        state.user = payload.user;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      };

      const clearAuth = () => {
        state.auth = null;
        state.user = null;
        localStorage.removeItem(STORAGE_KEY);
      };

      const loadStoredAuth = () => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) {
            return null;
          }

          const parsed = JSON.parse(raw);
          if (!parsed || !parsed.tokens || !parsed.user) {
            return null;
          }

          return parsed;
        } catch (error) {
          return null;
        }
      };

      const unwrapResponse = (payload) => {
        if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.data !== undefined) {
          return payload.data;
        }

        return payload;
      };

      const buildErrorMessage = async (response, payload) => {
        if (payload && typeof payload === 'object') {
          if (typeof payload.message === 'string') {
            return payload.message;
          }

          if (Array.isArray(payload.message)) {
            return payload.message.join(', ');
          }
        }

        return 'Request failed with status ' + response.status;
      };

      const refreshTokens = async () => {
        if (!state.auth?.refresh_token) {
          throw new Error('No refresh token available.');
        }

        const response = await fetch('/auth/refresh', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            refresh_token: state.auth.refresh_token,
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          clearAuth();
          throw new Error(await buildErrorMessage(response, payload));
        }

        saveAuth(payload);
        syncAuthUi();
      };

      const apiRequest = async (path, options = {}, retried = false) => {
        const headers = Object.assign({}, options.headers || {});

        if (state.auth?.access_token) {
          headers.authorization = 'Bearer ' + state.auth.access_token;
        }

        if (options.body !== undefined && !headers['content-type']) {
          headers['content-type'] = 'application/json';
        }

        const response = await fetch(path, Object.assign({}, options, { headers }));
        const payload = await response.json().catch(() => null);

        if (response.status === 401 && state.auth?.refresh_token && !retried) {
          await refreshTokens();
          return apiRequest(path, options, true);
        }

        if (!response.ok) {
          throw new Error(await buildErrorMessage(response, payload));
        }

        return unwrapResponse(payload);
      };

      const fetchOptional = async (path, acceptedMissingStatuses = [404]) => {
        try {
          return await apiRequest(path, { method: 'GET' });
        } catch (error) {
          const message = String(error.message || '');
          const matchesAcceptedStatus = acceptedMissingStatuses.some(
            (statusCode) => message.includes('status ' + statusCode),
          );

          if (matchesAcceptedStatus || message.includes('not found')) {
            return null;
          }

          throw error;
        }
      };

      const syncAuthUi = () => {
        elements.tenantChip.textContent = 'Tenant: ' + (state.user?.tenant_id || 'public');
        elements.authChip.textContent = state.user ? 'Authenticated' : 'Guest mode';
        elements.userPill.textContent = state.user
          ? state.user.display_name + ' · ' + state.user.role
          : 'Guest';
        elements.logoutButton.classList.toggle('hidden', !state.user);
        elements.authArea.classList.toggle('hidden', !!state.user);
        elements.subscriptionPill.textContent = state.subscription
          ? 'Subscription: ' + state.subscription.plan_code + ' · ' + state.subscription.status
          : 'Subscription: none';
        elements.heroPrimaryButton.textContent = state.user ? 'Open billing setup' : 'Create owner account';
        elements.pageSubtitle.textContent = state.user
          ? 'Logged in as ' + state.user.display_name + '. Use the sections below to run the ERP.'
          : 'Register or log in to manage your school on the live deployment.';
      };

      const setActiveSection = (sectionName) => {
        state.activeSection = sectionName;
        navButtons.forEach((button) => {
          button.classList.toggle('active', button.dataset.section === sectionName);
        });
        sections.forEach((section) => {
          section.classList.toggle('active', section.id === 'section-' + sectionName);
        });

        const titles = {
          overview: ['ERP overview', 'Your school operations, onboarding state, and live service posture.'],
          students: ['Student register', 'Admit learners, search the register, and keep guardian data current.'],
          attendance: ['Attendance desk', 'Mark daily status and review the attendance trail per learner.'],
          billing: ['Billing and subscriptions', 'Activate plans, inspect usage, and create fee invoices.'],
          ops: ['Operations console', 'Inspect readiness, SLO signals, and live warnings from production.'],
        };

        const [title, subtitle] = titles[sectionName] || titles.overview;
        elements.pageTitle.textContent = title;
        elements.pageSubtitle.textContent = subtitle;
      };

      const renderOverviewMetrics = () => {
        const activeStudents = state.students.filter((student) => student.status === 'active').length;
        const alerts = state.alerts.length;
        const subscriptionValue = state.subscription ? state.subscription.plan_code : 'none';
        const readiness = state.readiness?.status || 'unknown';
        const invoiceSummary = computeInvoiceSummary();
        const reconciliationState = state.reconciliation
          ? state.reconciliation.is_balanced
            ? 'balanced'
            : 'attention'
          : state.user
            ? 'unavailable'
            : 'locked';

        elements.overviewMetrics.innerHTML = [
          {
            label: 'Students',
            value: state.students.length,
            note: activeStudents + ' active learner' + (activeStudents === 1 ? '' : 's'),
          },
          {
            label: 'Plan',
            value: subscriptionValue,
            note: state.subscription ? state.subscription.status : 'Create one to unlock feature gates',
          },
          {
            label: 'Outstanding fees',
            value: formatMoneyMinor(invoiceSummary.outstandingMinor.toString()),
            note: invoiceSummary.overdueCount + ' overdue invoice' + (invoiceSummary.overdueCount === 1 ? '' : 's'),
          },
          {
            label: 'Reconciliation',
            value: reconciliationState,
            note: state.reconciliation
              ? state.reconciliation.summary.discrepancy_count + ' discrepancy signal' + (state.reconciliation.summary.discrepancy_count === 1 ? '' : 's')
              : 'Available after login with billing access.',
          },
          {
            label: 'Readiness',
            value: readiness,
            note: alerts === 0 ? 'No active operations warnings.' : 'Production needs attention.',
          },
          {
            label: 'Role',
            value: state.user?.role || 'guest',
            note: state.user ? 'Current access level on this tenant.' : 'Authenticate to write data.',
          },
          {
            label: 'Invoice pipeline',
            value: invoiceSummary.totalCount,
            note: invoiceSummary.openCount + ' open, ' + invoiceSummary.pendingCount + ' pending payment',
          },
        ].map((metric) =>
          '<div class="metric-card">'
          + '<span class="metric-label">' + escapeHtml(metric.label) + '</span>'
          + '<div class="metric-value">' + escapeHtml(metric.value) + '</div>'
          + '<div class="metric-note">' + escapeHtml(metric.note) + '</div>'
          + '</div>'
        ).join('');

        elements.onboardingCopy.textContent = state.user
          ? state.subscription
            ? 'Your owner session is active. If student endpoints still reject writes, review plan status and usage limits in Billing.'
            : 'You are signed in. Activate a subscription now to unlock student admissions and attendance.'
          : 'Start by creating an owner account, then activate a subscription plan to unlock student and attendance flows.';
      };

      const renderPriorityActions = () => {
        const invoiceSummary = computeInvoiceSummary();
        const priorities = [];

        if (!state.user) {
          priorities.push({
            kicker: 'First move',
            title: 'Create the owner account',
            copy: 'The first registration on this tenant becomes the operational owner and unlocks the full ERP setup flow.',
            status: 'warning',
          });
        } else if (!state.subscription) {
          priorities.push({
            kicker: 'Commercial unlock',
            title: 'Activate a subscription plan',
            copy: 'Student admission and attendance are feature-gated behind an active plan. Start with Trial if you are onboarding.',
            status: 'warning',
          });
        } else if (!['trialing', 'active'].includes(String(state.subscription.status))) {
          priorities.push({
            kicker: 'Revenue risk',
            title: 'Resolve subscription state',
            copy: 'The tenant is authenticated, but the plan status is ' + state.subscription.status + '. Restore an active state before operators hit hard blocks.',
            status: 'critical',
          });
        }

        if (state.user && state.students.length === 0) {
          priorities.push({
            kicker: 'Academic setup',
            title: 'Admit the first student',
            copy: 'Admissions is the foundation for attendance, billing references, and parent communications.',
            status: 'healthy',
          });
        }

        if (invoiceSummary.overdueCount > 0 || invoiceSummary.outstandingMinor > 0n) {
          priorities.push({
            kicker: 'Collections',
            title: 'Follow up outstanding fees',
            copy: formatMoneyMinor(invoiceSummary.outstandingMinor.toString()) + ' is still exposed across ' + invoiceSummary.totalCount + ' invoice(s).',
            status: invoiceSummary.overdueCount > 0 ? 'critical' : 'warning',
          });
        }

        if (state.reconciliation && !state.reconciliation.is_balanced) {
          priorities.push({
            kicker: 'Financial truth',
            title: 'Review MPESA reconciliation',
            copy: state.reconciliation.summary.discrepancy_count + ' discrepancy signal(s) were detected between MPESA activity and the ledger.',
            status: 'critical',
          });
        }

        if (state.alerts.length > 0) {
          priorities.push({
            kicker: 'Platform trust',
            title: 'Clear operations alerts',
            copy: state.alerts[0].message || 'Production observability has raised one or more warnings.',
            status: 'warning',
          });
        }

        if (priorities.length === 0) {
          priorities.push({
            kicker: 'Ready state',
            title: 'School operations are clear',
            copy: 'The dashboard is not currently surfacing onboarding blockers, collections pressure, or operational exceptions.',
            status: 'healthy',
          });
        }

        elements.priorityActionGrid.innerHTML = priorities.slice(0, 4).map((item) =>
          '<div class="priority-card">'
          + '<div class="item-row"><span class="priority-kicker">' + escapeHtml(item.kicker) + '</span><span class="status-badge ' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span></div>'
          + '<h4>' + escapeHtml(item.title) + '</h4>'
          + '<div class="priority-copy">' + escapeHtml(item.copy) + '</div>'
          + '</div>'
        ).join('');
      };

      const renderInvoiceSummary = () => {
        const summary = computeInvoiceSummary();

        elements.invoiceSummaryCard.innerHTML =
          '<div class="summary-kicker">Collections posture</div>'
          + '<h4>Invoice exposure</h4>'
          + '<div class="summary-value">' + escapeHtml(formatMoneyMinor(summary.outstandingMinor.toString())) + '</div>'
          + '<div class="summary-copy">Outstanding amount still open across the tenant invoice pipeline.</div>'
          + '<div class="summary-microgrid">'
          + '<div class="summary-micro"><span class="summary-micro-label">Billed</span><span class="summary-micro-value">' + escapeHtml(formatMoneyMinor(summary.billedMinor.toString())) + '</span></div>'
          + '<div class="summary-micro"><span class="summary-micro-label">Collected</span><span class="summary-micro-value">' + escapeHtml(formatMoneyMinor(summary.paidMinor.toString())) + '</span></div>'
          + '<div class="summary-micro"><span class="summary-micro-label">Open</span><span class="summary-micro-value">' + escapeHtml(summary.openCount) + '</span></div>'
          + '<div class="summary-micro"><span class="summary-micro-label">Overdue</span><span class="summary-micro-value">' + escapeHtml(summary.overdueCount) + '</span></div>'
          + '</div>';
      };

      const renderReconciliationSummary = () => {
        if (!state.user) {
          elements.reconciliationSummaryCard.innerHTML =
            '<div class="summary-kicker">Financial truth</div>'
            + '<h4>MPESA reconciliation</h4>'
            + '<div class="summary-copy">Log in with billing access to compare MPESA transactions against the ledger.</div>';
          return;
        }

        if (!state.reconciliation) {
          elements.reconciliationSummaryCard.innerHTML =
            '<div class="summary-kicker">Financial truth</div>'
            + '<h4>MPESA reconciliation</h4>'
            + '<div class="summary-copy">No reconciliation snapshot is available for this user or tenant right now.</div>';
          return;
        }

        const report = state.reconciliation;
        const summary = report.summary;

        elements.reconciliationSummaryCard.innerHTML =
          '<div class="item-row"><span class="summary-kicker">Financial truth</span><span class="status-badge ' + statusClass(report.is_balanced ? 'healthy' : 'critical') + '">' + escapeHtml(report.is_balanced ? 'balanced' : 'attention') + '</span></div>'
          + '<h4>MPESA vs ledger</h4>'
          + '<div class="summary-value">' + escapeHtml(summary.discrepancy_count) + '</div>'
          + '<div class="summary-copy">Discrepancy signal(s) on the daily reconciliation report for ' + escapeHtml(report.report_date) + '.</div>'
          + '<div class="summary-microgrid">'
          + '<div class="summary-micro"><span class="summary-micro-label">Matched</span><span class="summary-micro-value">' + escapeHtml(summary.matched_transaction_count) + '</span></div>'
          + '<div class="summary-micro"><span class="summary-micro-label">Missing callbacks</span><span class="summary-micro-value">' + escapeHtml(summary.missing_callback_count) + '</span></div>'
          + '<div class="summary-micro"><span class="summary-micro-label">Missing ledger</span><span class="summary-micro-value">' + escapeHtml(summary.missing_ledger_transaction_count) + '</span></div>'
          + '<div class="summary-micro"><span class="summary-micro-label">Amount mismatches</span><span class="summary-micro-value">' + escapeHtml(summary.amount_mismatch_count) + '</span></div>'
          + '</div>';
      };

      const renderUsagePressure = () => {
        const pressureItems = buildPressureModel();

        elements.usagePressureList.innerHTML = pressureItems.map((item) => {
          const ratio = item.limit && item.limit > 0n
            ? Number(item.current) / Number(item.limit)
            : 0;
          const clampedRatio = Math.max(0, Math.min(ratio, 1));
          const tone = !item.limit
            ? 'unknown'
            : clampedRatio >= 0.9
              ? 'critical'
              : clampedRatio >= 0.7
                ? 'warning'
                : 'healthy';

          return ''
            + '<div class="progress-card">'
            + '<div class="progress-row"><div class="progress-title">' + escapeHtml(item.title) + '</div><span class="status-badge ' + statusClass(tone) + '">' + escapeHtml(item.limit ? Math.round(clampedRatio * 100) + '%' : 'open') + '</span></div>'
            + '<div class="progress-copy">' + escapeHtml(item.detail) + '</div>'
            + '<div class="progress-track"><div class="progress-fill" style="width:' + String(Math.max(6, Math.round(clampedRatio * 100))) + '%;"></div></div>'
            + '</div>';
        }).join('');
      };

      const renderSubsystemRadar = () => {
        const subsystemCards = state.dashboard?.subsystem_cards || [];

        if (!subsystemCards.length) {
          elements.subsystemRadarList.innerHTML = '<div class="empty-state">No observability dashboard snapshot is available yet.</div>';
          return;
        }

        elements.subsystemRadarList.innerHTML = subsystemCards.map((card) => {
          const topObjectives = (card.objectives || []).slice(0, 2);
          return ''
            + '<div class="radar-card">'
            + '<div class="item-row"><h4>' + escapeHtml(card.display_name || card.subsystem) + '</h4><span class="status-badge ' + statusClass(card.status) + '">' + escapeHtml(card.status) + '</span></div>'
            + '<div class="radar-copy">' + escapeHtml(card.objectives?.[0]?.message || 'Subsystem is reporting live metrics and objective state.') + '</div>'
            + '<div class="objective-list">'
            + topObjectives.map((objective) =>
                '<div class="objective-chip">'
                + '<strong>' + escapeHtml(objective.title) + ':</strong> '
                + escapeHtml(objective.message)
                + '</div>'
              ).join('')
            + '</div>'
            + '</div>';
        }).join('');
      };

      const renderSchoolDayPlaybook = () => {
        const playbook = buildSchoolDayPlaybook();

        elements.schoolDayPlaybookList.innerHTML = playbook.map((item) =>
          '<div class="playbook-card">'
          + '<div class="item-row"><span class="playbook-window">' + escapeHtml(item.window) + '</span><span class="status-badge ' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span></div>'
          + '<h4>' + escapeHtml(item.title) + '</h4>'
          + '<div class="playbook-copy">' + escapeHtml(item.copy) + '</div>'
          + '</div>'
        ).join('');
      };

      const renderRiskRegister = () => {
        const risks = buildRiskRegister();

        elements.riskRegisterList.innerHTML = risks.map((risk) =>
          '<div class="risk-card">'
          + '<div class="item-row"><h4>' + escapeHtml(risk.title) + '</h4><span class="status-badge ' + statusClass(risk.severity) + '">' + escapeHtml(risk.severity) + '</span></div>'
          + '<div class="risk-copy">' + escapeHtml(risk.copy) + '</div>'
          + '<div class="risk-meta">Owner: ' + escapeHtml(risk.owner) + '</div>'
          + '</div>'
        ).join('');
      };

      const renderOverviewOps = () => {
        const services = state.readiness?.services || {};
        const serviceEntries = Object.entries(services);

        if (!serviceEntries.length) {
          elements.overviewOpsList.innerHTML = '<div class="empty-state">Service posture is not available yet.</div>';
          return;
        }

        elements.overviewOpsList.innerHTML = serviceEntries.map(([name, value]) =>
          '<div class="service-item">'
          + '<div class="item-row"><strong>' + escapeHtml(name) + '</strong><span class="status-badge ' + statusClass(value) + '">' + escapeHtml(value) + '</span></div>'
          + '<div style="color: var(--muted);">Live readiness check from the deployed API.</div>'
          + '</div>'
        ).join('');
      };

      const renderStudents = () => {
        if (!state.students.length) {
          elements.studentsTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No students found yet.</td></tr>';
          return;
        }

        elements.studentsTableBody.innerHTML = state.students.map((student) =>
          '<tr>'
          + '<td>' + escapeHtml(student.admission_number) + '</td>'
          + '<td><strong>' + escapeHtml([student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')) + '</strong></td>'
          + '<td><span class="status-badge ' + statusClass(student.status) + '">' + escapeHtml(student.status) + '</span></td>'
          + '<td>' + escapeHtml(student.primary_guardian_name || '—') + '<br /><span style="color: var(--muted); font-size: 13px;">' + escapeHtml(student.primary_guardian_phone || '') + '</span></td>'
          + '<td>' + escapeHtml(formatDate(student.updated_at)) + '</td>'
          + '<td><div class="mini-actions">'
          + '<button class="mini-button" type="button" data-student-action="select" data-student-id="' + escapeHtml(student.id) + '">Use for attendance</button>'
          + '</div></td>'
          + '</tr>'
        ).join('');
      };

      const renderAttendanceStudentOptions = () => {
        const options = ['<option value="">Choose a student</option>'].concat(
          state.students.map((student) =>
            '<option value="' + escapeHtml(student.id) + '"' + (state.selectedStudentId === student.id ? ' selected' : '') + '>'
            + escapeHtml(student.admission_number + ' · ' + student.first_name + ' ' + student.last_name)
            + '</option>'
          ),
        );

        elements.attendanceStudentSelect.innerHTML = options.join('');
      };

      const renderAttendanceHistory = (records) => {
        if (!records || !records.length) {
          elements.attendanceHistoryList.innerHTML = '<div class="empty-state">No attendance records for the current selection.</div>';
          return;
        }

        elements.attendanceHistoryList.innerHTML = records.map((record) =>
          '<div class="timeline-item">'
          + '<div class="item-row"><strong>' + escapeHtml(record.attendance_date) + '</strong><span class="status-badge ' + statusClass(record.status) + '">' + escapeHtml(record.status) + '</span></div>'
          + '<div style="color: var(--muted);">' + escapeHtml(record.notes || 'No notes recorded.') + '</div>'
          + '</div>'
        ).join('');
      };

      const renderSubscription = () => {
        if (!state.subscription) {
          elements.subscriptionCard.innerHTML = '<div class="empty-state">No active subscription yet. Create one below to unlock feature-gated modules.</div>';
          return;
        }

        elements.subscriptionCard.innerHTML =
          '<div class="item-row"><strong>' + escapeHtml(state.subscription.plan_code) + '</strong><span class="status-badge ' + statusClass(state.subscription.status) + '">' + escapeHtml(state.subscription.status) + '</span></div>'
          + '<div style="margin-top: 10px; color: var(--muted); line-height: 1.6;">'
          + 'Seats: ' + escapeHtml(state.subscription.seats_allocated) + '<br />'
          + 'Features: ' + escapeHtml((state.subscription.features || []).join(', ') || '—') + '<br />'
          + 'Period: ' + escapeHtml(formatShortDate(state.subscription.current_period_start)) + ' → ' + escapeHtml(formatShortDate(state.subscription.current_period_end))
          + '</div>';
      };

      const renderUsageSummary = () => {
        const items = state.usageSummary?.usage || [];

        if (!items.length) {
          elements.usageSummaryList.innerHTML = '<div class="empty-state">No usage has been metered for the current period yet.</div>';
          return;
        }

        elements.usageSummaryList.innerHTML = items.map((item) =>
          '<div class="timeline-item">'
          + '<div class="item-row"><strong>' + escapeHtml(item.feature_key) + '</strong><span class="code">' + escapeHtml(item.total_quantity) + '</span></div>'
          + '<div style="color: var(--muted);">Current period usage for this metered dimension.</div>'
          + '</div>'
        ).join('');
      };

      const renderInvoices = () => {
        if (!state.invoices.length) {
          elements.invoiceList.innerHTML = '<div class="empty-state">No invoices have been issued yet.</div>';
          return;
        }

        elements.invoiceList.innerHTML = state.invoices.map((invoice) =>
          '<div class="timeline-item">'
          + '<div class="item-row"><strong>' + escapeHtml(invoice.invoice_number) + '</strong><span class="status-badge ' + statusClass(invoice.status) + '">' + escapeHtml(invoice.status) + '</span></div>'
          + '<div style="color: var(--muted);">' + escapeHtml(invoice.description) + '</div>'
          + '<div class="item-row"><span class="code">' + escapeHtml(formatMoneyMinor(invoice.total_amount_minor)) + '</span><span style="color: var(--muted);">Due ' + escapeHtml(formatDate(invoice.due_at)) + '</span></div>'
          + '</div>'
        ).join('');
      };

      const renderOps = () => {
        renderOverviewOps();

        const subsystems = state.health?.subsystem_statuses || [];
        const serviceRows = [];
        const services = state.readiness?.services || {};

        Object.entries(services).forEach(([name, value]) => {
          serviceRows.push(
            '<div class="service-item">'
            + '<div class="item-row"><strong>' + escapeHtml(name) + '</strong><span class="status-badge ' + statusClass(value) + '">' + escapeHtml(value) + '</span></div>'
            + '<div style="color: var(--muted);">Readiness response for this dependency.</div>'
            + '</div>'
          );
        });

        subsystems.forEach((item) => {
          serviceRows.push(
            '<div class="service-item">'
            + '<div class="item-row"><strong>' + escapeHtml(item.subsystem) + '</strong><span class="status-badge ' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span></div>'
            + '<div style="color: var(--muted);">SLO-derived subsystem status.</div>'
            + '</div>'
          );
        });

        elements.serviceHealthList.innerHTML = serviceRows.length
          ? serviceRows.join('')
          : '<div class="empty-state">No service health data available.</div>';

        elements.alertsList.innerHTML = state.alerts.length
          ? state.alerts.map((alert) =>
              '<div class="alert-item">'
              + '<div class="item-row"><strong>' + escapeHtml(alert.title || alert.id) + '</strong><span class="status-badge ' + statusClass(alert.severity || alert.status) + '">' + escapeHtml(alert.severity || alert.status || 'warning') + '</span></div>'
              + '<div style="color: var(--muted); line-height: 1.55;">' + escapeHtml(alert.message || 'No alert details provided.') + '</div>'
              + '<div style="color: var(--muted); font-size: 13px;">Last evaluated: ' + escapeHtml(formatDate(alert.last_evaluated_at)) + '</div>'
              + '</div>'
            ).join('')
          : '<div class="empty-state">No open alerts right now.</div>';
      };

      const renderHero = () => {
        const readiness = state.readiness?.status || state.health?.overall_status || 'unknown';
        const alertCount = state.alerts.length;
        const topObjective = state.dashboard?.subsystem_cards
          ?.flatMap((card) => card.objectives || [])
          ?.find((objective) => objective.status !== 'healthy');

        elements.heroReadinessValue.textContent = readiness;
        elements.heroReadinessNote.textContent = state.readiness
          ? 'Postgres is ' + (state.readiness.services?.postgres || 'unknown') + ', Redis is ' + (state.readiness.services?.redis || 'unknown') + ', queue is ' + (state.readiness.services?.bullmq || 'unknown') + '.'
          : 'Checking Postgres, Redis, and queue state.';
        elements.heroAlertsValue.textContent = String(alertCount);
        elements.heroAlertsNote.textContent = topObjective
          ? topObjective.message
          : alertCount === 0
            ? 'No active warnings from observability.'
            : 'Live warnings are coming from the production observability engine.';
      };

      const renderAll = () => {
        syncAuthUi();
        renderHero();
        renderOverviewMetrics();
        renderPriorityActions();
        renderInvoiceSummary();
        renderReconciliationSummary();
        renderUsagePressure();
        renderSubsystemRadar();
        renderSchoolDayPlaybook();
        renderRiskRegister();
        renderOverviewOps();
        renderStudents();
        renderAttendanceStudentOptions();
        renderSubscription();
        renderUsageSummary();
        renderInvoices();
        renderOps();
      };

      const loadPublicSignals = async () => {
        const [healthPayload, readinessPayload, alertsPayload, dashboardPayload] = await Promise.all([
          fetch('/observability/health', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/health/ready', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/observability/alerts', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/observability/dashboard', { cache: 'no-store' }).then((response) => response.json()),
        ]);

        state.health = unwrapResponse(healthPayload);
        state.readiness = unwrapResponse(readinessPayload);
        state.alerts = unwrapResponse(alertsPayload)?.alerts || [];
        state.dashboard = unwrapResponse(dashboardPayload);
        renderAll();
      };

      const loadPrivateData = async () => {
        if (!state.user) {
          state.students = [];
          state.subscription = null;
          state.usageSummary = null;
          state.invoices = [];
          state.reconciliation = null;
          renderAll();
          return;
        }

        const studentSearch = elements.studentSearchInput.value.trim();
        const studentQuery = studentSearch ? '?search=' + encodeURIComponent(studentSearch) + '&limit=50' : '?limit=50';
        const reconciliationQuery = '/payments/mpesa/reconciliation/daily?report_date=' + encodeURIComponent(getTodayReportDate()) + '&missing_callback_grace_minutes=20';

        const [me, students, subscription, usageSummary, invoices, reconciliation] = await Promise.all([
          apiRequest('/auth/me', { method: 'GET' }),
          fetchOptional('/students' + studentQuery),
          fetchOptional('/billing/subscriptions/current'),
          fetchOptional('/billing/usage/summary'),
          fetchOptional('/billing/invoices'),
          fetchOptional(reconciliationQuery, [403, 404]),
        ]);

        state.user = me?.user || state.user;
        state.students = Array.isArray(students) ? students : [];
        state.subscription = subscription;
        state.usageSummary = usageSummary;
        state.invoices = Array.isArray(invoices) ? invoices : [];
        state.reconciliation = reconciliation;
        if (!state.selectedStudentId && state.students.length > 0) {
          state.selectedStudentId = state.students[0].id;
        }

        renderAll();
      };

      const loadAttendanceHistory = async () => {
        if (!state.user || !state.selectedStudentId) {
          renderAttendanceHistory([]);
          return;
        }

        try {
          const records = await apiRequest('/students/' + encodeURIComponent(state.selectedStudentId) + '/attendance?limit=30', {
            method: 'GET',
          });
          renderAttendanceHistory(Array.isArray(records) ? records : []);
        } catch (error) {
          renderAttendanceHistory([]);
          setMessage('attendanceFormMessage', error.message, 'error');
        }
      };

      const handleAuthSuccess = async (payload, successMessage) => {
        saveAuth(payload);
        setMessage('registerMessage', '', '');
        setMessage('loginMessage', '', '');
        if (successMessage) {
          setMessage('loginMessage', successMessage, 'success');
        }
        await loadPrivateData();
        await loadAttendanceHistory();
        setActiveSection('overview');
      };

      document.getElementById('registerForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = {
          display_name: form.display_name.value.trim(),
          email: form.email.value.trim(),
          password: form.password.value,
        };

        setMessage('registerMessage', 'Creating owner account…');

        try {
          const payload = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          form.reset();
          await handleAuthSuccess(payload, 'Owner account created and logged in.');
          setMessage('registerMessage', 'Owner account created successfully.', 'success');
        } catch (error) {
          setMessage('registerMessage', error.message, 'error');
        }
      });

      document.getElementById('loginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = {
          email: form.email.value.trim(),
          password: form.password.value,
        };

        setMessage('loginMessage', 'Signing in…');

        try {
          const payload = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          form.reset();
          await handleAuthSuccess(payload, 'Signed in successfully.');
        } catch (error) {
          setMessage('loginMessage', error.message, 'error');
        }
      });

      document.getElementById('studentForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;

        const body = {
          admission_number: form.admission_number.value.trim(),
          first_name: form.first_name.value.trim(),
          last_name: form.last_name.value.trim(),
          middle_name: form.middle_name.value.trim() || undefined,
          date_of_birth: form.date_of_birth.value || undefined,
          gender: form.gender.value || undefined,
          status: form.status.value || undefined,
          primary_guardian_name: form.primary_guardian_name.value.trim() || undefined,
          primary_guardian_phone: form.primary_guardian_phone.value.trim() || undefined,
        };

        setMessage('studentFormMessage', 'Creating student…');

        try {
          await apiRequest('/students', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          form.reset();
          form.status.value = 'active';
          await loadPrivateData();
          setMessage('studentFormMessage', 'Student admitted successfully.', 'success');
        } catch (error) {
          setMessage('studentFormMessage', error.message, 'error');
        }
      });

      document.getElementById('attendanceForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const studentId = form.student_id.value;
        const attendanceDate = form.attendance_date.value;

        if (!studentId || !attendanceDate) {
          setMessage('attendanceFormMessage', 'Student and attendance date are required.', 'error');
          return;
        }

        const body = {
          status: form.status.value,
          notes: form.notes.value.trim() || undefined,
          last_modified_at: new Date().toISOString(),
        };

        setMessage('attendanceFormMessage', 'Saving attendance…');

        try {
          state.selectedStudentId = studentId;
          await apiRequest('/students/' + encodeURIComponent(studentId) + '/attendance/' + encodeURIComponent(attendanceDate), {
            method: 'PUT',
            body: JSON.stringify(body),
          });
          await loadAttendanceHistory();
          setMessage('attendanceFormMessage', 'Attendance saved successfully.', 'success');
        } catch (error) {
          setMessage('attendanceFormMessage', error.message, 'error');
        }
      });

      document.getElementById('subscriptionForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = {
          plan_code: form.plan_code.value,
          status: form.status.value || undefined,
          seats_allocated: Number(form.seats_allocated.value || '0'),
          billing_phone_number: form.billing_phone_number.value.trim() || undefined,
        };

        setMessage('subscriptionFormMessage', 'Creating subscription…');

        try {
          await apiRequest('/billing/subscriptions', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          await loadPrivateData();
          setMessage('subscriptionFormMessage', 'Subscription saved successfully.', 'success');
        } catch (error) {
          setMessage('subscriptionFormMessage', error.message, 'error');
        }
      });

      document.getElementById('invoiceForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const dueLocal = form.due_at_local.value;
        const body = {
          description: form.description.value.trim(),
          total_amount_minor: String(form.total_amount_minor.value).trim(),
          due_at: dueLocal ? new Date(dueLocal).toISOString() : undefined,
          billing_phone_number: form.billing_phone_number.value.trim() || undefined,
        };

        setMessage('invoiceFormMessage', 'Creating invoice…');

        try {
          await apiRequest('/billing/invoices', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          form.reset();
          await loadPrivateData();
          setMessage('invoiceFormMessage', 'Invoice created successfully.', 'success');
        } catch (error) {
          setMessage('invoiceFormMessage', error.message, 'error');
        }
      });

      elements.studentSearchInput.addEventListener('change', async () => {
        await loadPrivateData();
      });

      document.getElementById('studentsRefreshButton').addEventListener('click', async () => {
        setMessage('studentsListMessage', 'Refreshing students…');
        try {
          await loadPrivateData();
          setMessage('studentsListMessage', 'Student register refreshed.', 'success');
        } catch (error) {
          setMessage('studentsListMessage', error.message, 'error');
        }
      });

      document.getElementById('attendanceRefreshButton').addEventListener('click', async () => {
        setMessage('attendanceFormMessage', 'Refreshing attendance…');
        await loadAttendanceHistory();
        setMessage('attendanceFormMessage', 'Attendance history refreshed.', 'success');
      });

      elements.attendanceStudentSelect.addEventListener('change', async (event) => {
        state.selectedStudentId = event.target.value || null;
        await loadAttendanceHistory();
      });

      elements.logoutButton.addEventListener('click', async () => {
        try {
          if (state.auth?.access_token) {
            await apiRequest('/auth/logout', { method: 'POST' });
          }
        } catch (error) {
        } finally {
          clearAuth();
          state.subscription = null;
          state.students = [];
          state.invoices = [];
          state.usageSummary = null;
          state.selectedStudentId = null;
          syncAuthUi();
          renderAll();
          setActiveSection('overview');
        }
      });

      elements.heroPrimaryButton.addEventListener('click', () => {
        setActiveSection(state.user ? 'billing' : 'overview');
        if (!state.user) {
          window.scrollTo({ top: document.getElementById('authArea').offsetTop - 20, behavior: 'smooth' });
        }
      });

      elements.heroSecondaryButton.addEventListener('click', () => {
        setActiveSection('ops');
      });

      navButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setActiveSection(button.dataset.section);
        });
      });

      document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        if (target.dataset.studentAction === 'select') {
          state.selectedStudentId = target.dataset.studentId || null;
          renderAttendanceStudentOptions();
          setActiveSection('attendance');
          await loadAttendanceHistory();
        }
      });

      const bootstrap = async () => {
        try {
          const stored = loadStoredAuth();
          if (stored) {
            state.auth = stored.tokens;
            state.user = stored.user;

            try {
              await loadPrivateData();
            } catch (error) {
              try {
                await refreshTokens();
                await loadPrivateData();
              } catch (nestedError) {
                clearAuth();
              }
            }
          }
        } finally {
          syncAuthUi();
          renderAll();
          await loadPublicSignals();
          if (state.user) {
            await loadPrivateData();
            await loadAttendanceHistory();
          }
        }
      };

      bootstrap();
      setInterval(loadPublicSignals, 20000);
    </script>
  </body>
</html>`;
