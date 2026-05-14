let csrfTokenPromise: Promise<string> | null = null;

export async function getCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { token?: string }
          | null;

        if (!response.ok || !payload?.token) {
          throw new Error("Unable to start a secure request.");
        }

        csrfTokenPromise = null;
        return payload.token;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }

  return csrfTokenPromise;
}
