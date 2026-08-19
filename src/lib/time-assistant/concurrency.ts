/**
 * Bounded parallel map.
 *
 * Azure DevOps is queried once per project, so an unbounded `Promise.all` over
 * a large workspace would burst dozens of requests and get throttled. Results
 * keep the input order.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const item = items[currentIndex];
      if (item === undefined) continue;

      results[currentIndex] = await mapper(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}
