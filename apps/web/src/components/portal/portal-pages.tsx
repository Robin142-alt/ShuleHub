"use client";

import { useState, type ReactNode } from "react";
import { SmartphoneCharging } from "lucide-react";

import { ActivityListCard, SimpleListCard } from "@/components/experience/activity-list-card";
import { ChartCard } from "@/components/experience/chart-card";
import { MetricGrid } from "@/components/experience/metric-grid";
import { PortalShell } from "@/components/portal/portal-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import {
  copyTextToClipboard,
  downloadTextFile,
  openPrintDocument,
} from "@/lib/dashboard/export";
import type { ExperienceNotificationItem } from "@/lib/experiences/types";
import {
  getPortalWorkspace,
  portalAcademicRows,
  portalAttendanceRows,
  portalAttendanceTrend,
  portalFeeHistory,
  portalMessages,
  type PortalViewer,
} from "@/lib/experiences/portal-data";
import { toPortalPath } from "@/lib/routing/experience-routes";

type PortalRouteMode = "hosted" | "public";

function buildPortalSectionHref(
  viewer: PortalViewer,
  section: Parameters<typeof toPortalPath>[0],
  routeMode: PortalRouteMode,
) {
  if (routeMode === "public") {
    return section === "dashboard" ? `/portal/${viewer}` : `/portal/${viewer}/${section}`;
  }

  return toPortalPath(section);
}

function mapPortalHref(
  viewer: PortalViewer,
  href: string,
  routeMode: PortalRouteMode,
) {
  const normalized = href.replace(/^\/+/, "");
  const section = normalized.length === 0 ? "dashboard" : normalized;

  return buildPortalSectionHref(
    viewer,
    section as Parameters<typeof toPortalPath>[0],
    routeMode,
  );
}

function PortalPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Parent & student portal</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}

function PortalDashboard({ viewer }: { viewer: PortalViewer }) {
  const { metrics } = getPortalWorkspace(viewer);

  return (
    <div className="space-y-6">
      <MetricGrid items={metrics} />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="space-y-6">
          <SimpleListCard
            title="Student overview"
            subtitle={viewer === "parent" ? "A quick family-facing view of who needs attention today." : "A clean student view without school-office complexity."}
            items={[
              { id: "student-1", title: "Aisha Njeri", subtitle: "Grade 7 Hope • Class teacher Ms. Njoroge", value: "Present" },
              { id: "student-2", title: "Brian Kamau", subtitle: "Grade 4 Light • CAT starts next week", value: viewer === "parent" ? "Balance due" : "Revision" },
            ]}
          />
          <DataTable
            title="Recent payments"
            subtitle="The latest posted family transactions."
            columns={[
              { id: "date", header: "Date", render: (row) => row.date },
              { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
              { id: "method", header: "Method", render: (row) => row.method },
              { id: "reference", header: "Reference", render: (row) => row.reference },
              { id: "status", header: "Status", render: (row) => row.status },
            ]}
            rows={portalFeeHistory}
            getRowKey={(row) => row.id}
          />
        </div>
        <div className="space-y-6">
          <SimpleListCard
            title="Upcoming exams"
            subtitle="What the family should prepare for next."
            items={[
              { id: "exam-1", title: "Grade 7 Mid-term CAT", subtitle: "Starts Monday at 08:00", value: "5 days" },
              { id: "exam-2", title: "Science project review", subtitle: "Submission window closes Friday", value: "3 days" },
            ]}
          />
          <ActivityListCard
            title="Messages"
            subtitle="Announcements, reminders, and teacher communication."
            items={portalMessages}
          />
        </div>
      </div>
    </div>
  );
}

function PortalFeesPage({ viewer }: { viewer: PortalViewer }) {
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  async function shareStatement() {
    const statementText = [
      "ShuleHub family statement",
      "",
      ...portalFeeHistory.map(
        (row) => `${row.date} | ${row.amount} | ${row.method} | ${row.reference} | ${row.status}`,
      ),
    ].join("\n");

    await copyTextToClipboard(statementText);
    setShareStatus("Statement copied for sharing.");
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Fees"
        description="Current balance, payment history, and clear M-PESA instructions."
        actions={<Button onClick={() => void shareStatement()}>Share statement</Button>}
      />
      {shareStatus ? (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-foreground">
          {shareStatus}
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <DataTable
          title="Payment history"
          subtitle="Posted transactions for the current fee account."
          columns={[
            { id: "date", header: "Date", render: (row) => row.date },
            { id: "amount", header: "Amount", render: (row) => row.amount, className: "text-right font-semibold", headerClassName: "text-right" },
            { id: "method", header: "Method", render: (row) => row.method },
            { id: "reference", header: "Reference", render: (row) => row.reference },
            { id: "status", header: "Status", render: (row) => row.status },
          ]}
          rows={portalFeeHistory}
          getRowKey={(row) => row.id}
        />
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-foreground">
              <SmartphoneCharging className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">M-PESA payment instructions</p>
              <p className="mt-1 text-sm text-muted">Friendly enough for parents, still operationally accurate.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {[
              "Go to M-PESA > Lipa na M-PESA > Pay Bill.",
              "Business number: 174379",
              "Account number: ADM SH-24011",
              "Use the learner admission number exactly as shown.",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-warning/20 bg-warning/5 px-4 py-4">
            <p className="text-sm leading-6 text-foreground">
              {viewer === "parent"
                ? "If the payment is not reflected in 10 minutes, use the Messages page to contact bursary support."
                : "Students can view balance status here, but only linked family payers should settle fees."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PortalAcademicsPage() {
  function printReportCard() {
    openPrintDocument({
      eyebrow: "Portal academics",
      title: "Learner report card",
      subtitle: "Current performance shared with the family portal.",
      rows: portalAcademicRows.map((row) => ({
        label: `${row.subject} • ${row.teacher}`,
        value: `${row.score} (${row.grade})`,
      })),
      footer: "This report card view is generated from the current portal academics workspace.",
    });
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Academics"
        description="Results, report cards, and teacher comments presented without school-office complexity."
        actions={
          <Button variant="secondary" onClick={printReportCard}>
            Download report card
          </Button>
        }
      />
      <DataTable
        title="Results"
        subtitle="Latest CBC-aligned subject performance."
        columns={[
          { id: "subject", header: "Subject", render: (row) => row.subject },
          { id: "teacher", header: "Teacher", render: (row) => row.teacher },
          { id: "score", header: "Score", render: (row) => row.score, className: "text-right font-semibold", headerClassName: "text-right" },
          { id: "grade", header: "Grade", render: (row) => row.grade },
        ]}
        rows={portalAcademicRows}
        getRowKey={(row) => row.id}
      />
      <SimpleListCard
        title="Teacher comments"
        subtitle="Feedback parents and learners can understand quickly."
        items={[
          { id: "comment-1", title: "Mathematics", subtitle: "Aisha is participating confidently and should keep revising word problems." },
          { id: "comment-2", title: "English", subtitle: "Reading fluency improved this month. Continue daily comprehension practice." },
        ]}
      />
    </div>
  );
}

function PortalAttendancePage() {
  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Attendance"
        description="Daily attendance and simple trend visibility for families."
        actions={
          <StatusPill
            label="This month"
            tone="ok"
          />
        }
      />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <ChartCard
          title="Attendance trend"
          subtitle="Recent weekly attendance performance."
          points={portalAttendanceTrend}
        />
        <DataTable
          title="Daily attendance"
          subtitle="Recent classroom attendance records."
          columns={[
            { id: "date", header: "Date", render: (row) => row.date },
            { id: "state", header: "State", render: (row) => <StatusPill label={row.state} tone={row.state === "Present" ? "ok" : "warning"} /> },
            { id: "note", header: "Note", render: (row) => row.note },
          ]}
          rows={portalAttendanceRows}
          getRowKey={(row) => row.id}
        />
      </div>
    </div>
  );
}

function PortalMessagesPage() {
  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Messages"
        description="Announcements, SMS history, and family communication in one calm center."
      />
      <ActivityListCard
        title="School messages"
        subtitle="Recent notices and action-oriented reminders."
        items={portalMessages}
      />
    </div>
  );
}

function PortalDownloadsPage() {
  function downloadAll() {
    downloadTextFile({
      filename: "portal-downloads.txt",
      content: [
        "ShuleHub portal downloads",
        "",
        "Current fee statement",
        "Term report card",
        "Exam timetable",
      ].join("\n"),
    });
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Downloads"
        description="Important documents ready to save or print."
        actions={
          <Button variant="secondary" onClick={downloadAll}>
            Download all
          </Button>
        }
      />
      <SimpleListCard
        title="Available files"
        subtitle="Common family downloads in one place."
        items={[
          { id: "download-1", title: "Current fee statement", subtitle: "Updated after the latest matched M-PESA payment", value: "PDF" },
          { id: "download-2", title: "Term report card", subtitle: "Teacher comments included", value: "PDF" },
          { id: "download-3", title: "Exam timetable", subtitle: "Upcoming CAT and assessment schedule", value: "PDF" },
        ]}
      />
    </div>
  );
}

function PortalNotificationsPage() {
  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Notifications"
        description="Important fee, attendance, and classroom notices gathered in one list."
      />
      <ActivityListCard
        title="Notification feed"
        subtitle="Recent alerts and reminders for the learner account."
        items={portalMessages}
      />
    </div>
  );
}

export function PortalPages({
  viewer,
  section = "dashboard",
  routeMode = "hosted",
}: {
  viewer: PortalViewer;
  section?: string;
  routeMode?: PortalRouteMode;
}) {
  const { navItems, profile } = getPortalWorkspace(viewer);
  const activeHref =
    section === "dashboard"
      ? buildPortalSectionHref(viewer, "dashboard", routeMode)
      : buildPortalSectionHref(
          viewer,
          section as Parameters<typeof toPortalPath>[0],
          routeMode,
        );
  const scopedNavItems = navItems.map((item) => ({
    ...item,
    href: mapPortalHref(viewer, item.href, routeMode),
  }));
  const notifications: ExperienceNotificationItem[] = portalMessages.map(
    (message): ExperienceNotificationItem => ({
      id: message.id,
      title: message.title,
      detail: message.detail,
      timeLabel: message.timeLabel,
      tone: message.tone,
      href: mapPortalHref(viewer, "/notifications", routeMode),
    }),
  );

  return (
    <PortalShell
      brand={{ title: "ShuleHub Portal", subtitle: viewer === "parent" ? "Family portal" : "Student portal" }}
      navItems={scopedNavItems}
      activeHref={activeHref}
      topLabel={viewer === "parent" ? "Family portal" : "Student portal"}
      title={section === "dashboard" ? "Family dashboard" : section.charAt(0).toUpperCase() + section.slice(1)}
      subtitle="Mobile-friendly, calm, and clear enough for families to use without training."
      status={{ label: "School synced", tone: "ok" }}
      profile={profile}
      notifications={notifications}
      actions={<StatusPill label="Balance visible" tone="ok" />}
    >
      {section === "dashboard" ? <PortalDashboard viewer={viewer} /> : null}
      {section === "fees" ? <PortalFeesPage viewer={viewer} /> : null}
      {section === "academics" ? <PortalAcademicsPage /> : null}
      {section === "attendance" ? <PortalAttendancePage /> : null}
      {section === "messages" ? <PortalMessagesPage /> : null}
      {section === "downloads" ? <PortalDownloadsPage /> : null}
      {section === "notifications" ? <PortalNotificationsPage /> : null}
    </PortalShell>
  );
}
