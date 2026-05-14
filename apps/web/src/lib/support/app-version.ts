export function getSupportAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "web-client";
}
