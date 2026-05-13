"use client";

import { useState } from "react";
import { MonitorSmartphone, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";

type SessionRow = {
  id: string;
  device: string;
  ip: string;
  lastSeen: string;
  status: "Current" | "Active";
};

const initialSessions: SessionRow[] = [
  { id: "s-1", device: "Chrome on Windows", ip: "102.22.14.8", lastSeen: "Just now", status: "Current" },
  { id: "s-2", device: "Safari on iPad", ip: "102.22.14.11", lastSeen: "Yesterday 18:20", status: "Active" },
];

export function SessionManagementPanel() {
  const [sessions, setSessions] = useState(initialSessions);

  function revoke(sessionId: string) {
    setSessions((current) => current.filter((session) => session.id !== sessionId));
  }

  function revokeAllOtherSessions() {
    setSessions((current) => current.filter((session) => session.status === "Current"));
  }

  return (
    <DataTable
      title="Active sessions"
      subtitle="Review signed-in devices and revoke old access immediately."
      columns={[
        {
          id: "device",
          header: "Device",
          render: (row) => (
            <span className="inline-flex items-center gap-2 font-semibold">
              <MonitorSmartphone className="h-4 w-4 text-muted" />
              {row.device}
            </span>
          ),
        },
        { id: "ip", header: "IP", render: (row) => row.ip },
        { id: "lastSeen", header: "Last seen", render: (row) => row.lastSeen },
        {
          id: "status",
          header: "Status",
          render: (row) => <StatusPill label={row.status} tone="ok" />,
        },
        {
          id: "actions",
          header: "Actions",
          render: (row) =>
            row.status === "Current" ? (
              <Button variant="secondary" size="sm" onClick={revokeAllOtherSessions}>
                Revoke others
              </Button>
            ) : (
              <Button variant="danger" size="sm" onClick={() => revoke(row.id)}>
                <Power className="h-4 w-4" />
                Revoke
              </Button>
            ),
          className: "text-right",
          headerClassName: "text-right",
        },
      ]}
      rows={sessions}
      getRowKey={(row) => row.id}
    />
  );
}
