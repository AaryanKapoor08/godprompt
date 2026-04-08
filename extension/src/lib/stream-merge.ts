/**
 * Merge an incoming streamed chunk into the full text buffer.
 *
 * Some providers send pure deltas, others occasionally send cumulative
 * snapshots or replayed prefixes. This keeps the buffer monotonic and avoids
 * duplicated text in the composer.
 */
export function mergeStreamChunk(current: string, incoming: string): string {
  if (!incoming) {
    return current
  }

  if (!current) {
    return incoming
  }

  // Incoming is a full cumulative snapshot that already contains current.
  if (incoming.startsWith(current)) {
    return incoming
  }

  // Incoming is an older replayed prefix/snapshot.
  if (current.startsWith(incoming)) {
    return current
  }

  // Standard overlap reconciliation: append only the non-overlapping suffix.
  const maxOverlap = Math.min(current.length, incoming.length)
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (current.endsWith(incoming.slice(0, overlap))) {
      return current + incoming.slice(overlap)
    }
  }

  // No overlap found — treat as regular delta append.
  return current + incoming
}
