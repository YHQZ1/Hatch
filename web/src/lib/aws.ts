/**
 * Whether the user has connected an AWS account. Connecting arrives with
 * Phase 2 (docs/05-roadmap.md); until then nothing can be connected, and the
 * parts of the UI that depend on it show a plain placeholder. Phase 2 replaces
 * this with the real connection, and the placeholders follow from it.
 */
export function useAwsConnection(): { connected: boolean } {
  return { connected: false };
}
