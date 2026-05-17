export type LearnerLookupItem = {
  id: string;
  admissionNumber: string;
  name: string;
  classLabel?: string | null;
  guardianPhone?: string | null;
};

export async function fetchLearnerLookup(input: {
  tenantSlug: string;
  query: string;
  limit?: number;
}): Promise<LearnerLookupItem[]> {
  const params = new URLSearchParams({
    tenantSlug: input.tenantSlug,
    search: input.query.trim(),
    limit: String(input.limit ?? 10),
  });
  const response = await fetch(`/api/admissions/students?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Learner search is unavailable.");
  }

  const payload = (await response.json()) as Array<{
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    class_name?: string | null;
    stream_name?: string | null;
    primary_guardian_phone?: string | null;
  }>;

  return payload.map((student) => ({
    id: student.id,
    admissionNumber: student.admission_number,
    name: `${student.first_name} ${student.last_name}`.trim(),
    classLabel: [student.class_name, student.stream_name].filter(Boolean).join(" ") || null,
    guardianPhone: student.primary_guardian_phone ?? null,
  }));
}
