"use client";

import { useEffect, useState } from "react";

import { getCsrfToken } from "@/lib/auth/csrf-client";
import type { ExperienceAudience } from "@/lib/auth/experience-audience";
import type { ExperienceGatewaySession } from "@/lib/auth/server-session";

type LoginInput = {
  identifier: string;
  password: string;
  verificationCode?: string;
  tenantSlug?: string | null;
};

type SessionResponse = {
  redirectTo?: string;
  session: ExperienceGatewaySession;
  user: ExperienceGatewaySession["user"];
};

async function parseResponse(response: Response) {
  const json = (await response.json().catch(() => null)) as
    | { message?: string }
    | SessionResponse
    | null;

  if (!response.ok) {
    throw new Error(
      json && "message" in json && json.message
        ? json.message
        : "Unable to complete the authentication request.",
    );
  }

  return json as SessionResponse;
}

export function useExperienceSession(
  audience: ExperienceAudience,
  options?: {
    tenantSlug?: string | null;
    autoLoad?: boolean;
  },
) {
  const [session, setSession] = useState<ExperienceGatewaySession | null>(null);
  const [user, setUser] = useState<ExperienceGatewaySession["user"] | null>(null);
  const [isLoading, setIsLoading] = useState(options?.autoLoad ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!options?.autoLoad) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const query = new URLSearchParams({
          audience,
        });

        if (options?.tenantSlug) {
          query.set("tenantSlug", options.tenantSlug);
        }

        const response = await fetch(`/api/auth/me?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
        });

        if (!response.ok) {
          if (!cancelled) {
            setSession(null);
            setUser(null);
          }
          return;
        }

        const payload = (await response.json()) as SessionResponse;

        if (!cancelled) {
          setSession(payload.session);
          setUser(payload.user);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the current session.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [audience, options?.autoLoad, options?.tenantSlug]);

  const login = async (input: LoginInput) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": await getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          audience,
          ...input,
          tenantSlug: input.tenantSlug ?? options?.tenantSlug ?? null,
        }),
      });
      const payload = await parseResponse(response);
      setSession(payload.session);
      setUser(payload.user);
      return payload;
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in right now.";
      setError(message);
      throw loginError;
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": await getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify({ audience }),
      });
      setSession(null);
      setUser(null);
      setError(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const refresh = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shulehub-csrf": await getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          audience,
          tenantSlug: options?.tenantSlug ?? null,
        }),
      });
      const payload = await parseResponse(response);
      setSession(payload.session);
      setUser(payload.user);
      setError(null);
      return payload;
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the current session.";
      setError(message);
      throw refreshError;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    session,
    user,
    isLoading,
    isSubmitting,
    error,
    login,
    logout,
    refresh,
    clearError: () => setError(null),
  };
}
