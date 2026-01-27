/**
 * Concurrency Limiter
 * p-limit style concurrency control without external dependencies
 */

type Task<T> = () => Promise<T>;

interface Limit {
  <T>(fn: Task<T>): Promise<T>;
  activeCount: number;
  pendingCount: number;
}

/**
 * Create a concurrency limiter
 * @param concurrency Maximum number of concurrent tasks
 * @returns Limit function that wraps tasks to enforce concurrency
 */
export function limit(concurrency: number): Limit {
  if (concurrency < 1) throw new Error('Concurrency must be >= 1');

  let active = 0;
  const queue: Array<{ fn: Task<any>; resolve: (value: any) => void; reject: (error: any) => void }> = [];

  const run = async () => {
    if (active >= concurrency || queue.length === 0) return;

    const item = queue.shift();
    if (!item) return;

    active++;
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      active--;
      // Process next item in queue
      run();
    }
  };

  const limited = <T>(fn: Task<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      run();
    });
  };

  Object.defineProperty(limited, 'activeCount', {
    get: () => active,
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(limited, 'pendingCount', {
    get: () => queue.length,
    enumerable: true,
    configurable: false,
  });

  return limited as Limit;
}

