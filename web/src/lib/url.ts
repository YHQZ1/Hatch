/**
 * The value itself if it is an http or https URL, otherwise null.
 * Links built from data the server or a build produced (repository URLs, app
 * addresses, URLs in build logs) go through this, so that a value such as
 * `javascript:...` can never become a clickable link.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
