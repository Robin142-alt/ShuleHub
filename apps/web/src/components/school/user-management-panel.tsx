"use client";

import { useState } from "react";
import { Send, ShieldBan, UserCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Invited" | "Suspended";
};

const initialUsers: ManagedUser[] = [
  { id: "u-1", name: "Mary Wanjiku", email: "principal@school.ac.ke", role: "Principal", status: "Active" },
  { id: "u-2", name: "Peter Otieno", email: "bursar@school.ac.ke", role: "Bursar", status: "Active" },
  { id: "u-3", name: "Grace Njoroge", email: "teacher@school.ac.ke", role: "Teacher", status: "Invited" },
];

export function UserManagementPanel() {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function inviteUser() {
    setMessage(null);

    if (!name.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      setMessage("Enter a name and valid email before sending an invitation.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/auth/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          email: email.trim(),
          role,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to create invitation.");
      }

      setUsers((current) => [
        {
          id: `invite-${Date.now()}`,
          name: name.trim(),
          email: email.trim(),
          role: role.charAt(0).toUpperCase() + role.slice(1),
          status: "Invited",
        },
        ...current,
      ]);
      setName("");
      setEmail("");
      setRole("teacher");
      setMessage("Invitation queued for delivery.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create invitation.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSuspended(userId: string) {
    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              status: user.status === "Suspended" ? "Active" : "Suspended",
            }
          : user,
      ),
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-foreground">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Invite user</h3>
            <p className="text-sm text-muted">Create access without exposing passwords.</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <input
            className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
            placeholder="name@school.ac.ke"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select
            className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="principal">Principal</option>
            <option value="bursar">Bursar</option>
            <option value="teacher">Teacher</option>
            <option value="storekeeper">Storekeeper</option>
            <option value="librarian">Librarian</option>
            <option value="parent">Parent</option>
          </select>
          <Button block onClick={() => void inviteUser()} disabled={busy}>
            <Send className="h-4 w-4" />
            {busy ? "Sending..." : "Send invitation"}
          </Button>
          {message ? <p className="text-sm text-muted">{message}</p> : null}
        </div>
      </Card>

      <DataTable
        title="Tenant users"
        subtitle="Invite, suspend, and recover tenant access from one controlled surface."
        columns={[
          { id: "name", header: "Name", render: (row) => <span className="font-semibold">{row.name}</span> },
          { id: "email", header: "Email", render: (row) => row.email },
          { id: "role", header: "Role", render: (row) => row.role },
          {
            id: "status",
            header: "Status",
            render: (row) => (
              <StatusPill
                label={row.status}
                tone={row.status === "Suspended" ? "critical" : row.status === "Invited" ? "warning" : "ok"}
              />
            ),
          },
          {
            id: "actions",
            header: "Actions",
            render: (row) => (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleSuspended(row.id)}>
                  {row.status === "Suspended" ? <UserCheck className="h-4 w-4" /> : <ShieldBan className="h-4 w-4" />}
                  {row.status === "Suspended" ? "Activate" : "Suspend"}
                </Button>
              </div>
            ),
            className: "text-right",
            headerClassName: "text-right",
          },
        ]}
        rows={users}
        getRowKey={(row) => row.id}
      />
    </div>
  );
}
