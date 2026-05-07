import type { LucideIcon } from "lucide-react";

export type ExperienceIcon = LucideIcon;

export type SchoolExperienceRole = "principal" | "bursar" | "teacher" | "admin";
export type PortalViewer = "parent" | "student";

export interface ExperienceNavItem {
  id: string;
  label: string;
  href: string;
  icon: ExperienceIcon;
  badge?: string;
  group?: string;
}

export interface ExperienceNotificationItem {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  tone: "ok" | "warning" | "critical";
  href?: string;
}

export interface ExperienceMetric {
  id: string;
  label: string;
  value: string;
  helper: string;
  trend?: string;
}

export interface ExperienceChartPoint {
  label: string;
  value: number;
}

export interface ExperienceActivityItem {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  tone: "ok" | "warning" | "critical";
}

export interface ExperienceListItem {
  id: string;
  title: string;
  subtitle: string;
  value?: string;
  tone?: "ok" | "warning" | "critical";
}

export interface ExperienceProfile {
  name: string;
  roleLabel: string;
  contextLabel: string;
}
