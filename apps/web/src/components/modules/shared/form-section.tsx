"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="border-b border-border pb-4">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}
