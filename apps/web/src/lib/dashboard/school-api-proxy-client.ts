import { getCsrfToken } from "@/lib/auth/csrf-client";

type ApiEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "meta" in value
  );
}

export async function requestSchoolApiProxy<T>(
  path: string,
  options?: {
    unwrapEnvelope?: boolean;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: BodyInit | Record<string, unknown> | null;
  },
): Promise<T> {
  const method = options?.method ?? "GET";
  const isFormData =
    typeof FormData !== "undefined" && options?.body instanceof FormData;
  const hasBody = options?.body !== null && options?.body !== undefined;
  const requestBody =
    !hasBody
      ? undefined
      : isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (method !== "GET") {
    headers["x-shulehub-csrf"] = await getCsrfToken();
  }

  if (hasBody && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    ...(requestBody !== undefined ? { body: requestBody } : {}),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed: ${response.status}`);
  }

  const json = (await response.json()) as T | ApiEnvelope<T>;

  if (options?.unwrapEnvelope === false) {
    return json as T;
  }

  return isEnvelope<T>(json) ? json.data : (json as T);
}
