export type ResetSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export async function readResetToken(
  searchParams: ResetSearchParams | undefined,
) {
  const params = await searchParams;
  const token = params?.token;

  return Array.isArray(token) ? (token[0] ?? "") : (token ?? "");
}
