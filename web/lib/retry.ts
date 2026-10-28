// Right after a deploy, GitHub Pages' CDN can answer the first range request for the tile archive
// with the whole file, which PMTiles rejects; a moment later it serves ranges again. PMTiles keeps
// a failed header in its cache, so the second try needs a fresh archive.

export const RETRY_DELAY = 1000; // ms

/** Run `attempt`, and once more after RETRY_DELAY if it fails; `reset` drops what cached the failure. */
export async function retryOnce<T>(attempt: () => Promise<T>, reset: () => void): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      reset();
      if (tries === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
}
