/** Strips query string and fragment; analytics only needs the path. */
export function normalizePath(path: string): string {
  const cut = path.split(/[?#]/)[0] || "/";
  return cut.startsWith("/") ? cut : `/${cut}`;
}

/** Reduces referrer to its hostname to avoid storing full external URLs. */
export function normalizeReferrer(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
}
