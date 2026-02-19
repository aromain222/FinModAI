/**
 * API Health Monitoring
 * 
 * Tracks success/failure rates per provider to recommend best data source
 */

type HealthStatus = 'healthy' | 'degraded' | 'down';

interface ProviderHealth {
  provider: string;
  successCount: number;
  failureCount: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  status: HealthStatus;
  successRate: number;
}

export class APIHealthMonitor {
  private health: Map<string, ProviderHealth> = new Map();

  /**
   * Record a successful API call
   */
  recordSuccess(provider: string): void {
    const current = this.getOrCreate(provider);
    current.successCount++;
    current.lastSuccess = Date.now();
    this.updateStatus(provider);
  }

  /**
   * Record a failed API call
   */
  recordFailure(provider: string, error?: string): void {
    const current = this.getOrCreate(provider);
    current.failureCount++;
    current.lastFailure = Date.now();
    this.updateStatus(provider);

    if (error) {
      console.warn(`[APIHealth] ${provider} failure: ${error}`);
    }
  }

  /**
   * Get health status for a provider
   */
  getHealth(provider: string): ProviderHealth {
    return this.getOrCreate(provider);
  }

  /**
   * Get all provider health statuses
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Get recommended provider from a list based on health
   */
  getRecommendedProvider(providers: string[]): string | null {
    const healthyProviders = providers
      .map(p => this.getHealth(p))
      .filter(h => h.status === 'healthy')
      .sort((a, b) => b.successRate - a.successRate);

    if (healthyProviders.length > 0) {
      return healthyProviders[0].provider;
    }

    // If no healthy providers, try degraded ones
    const degradedProviders = providers
      .map(p => this.getHealth(p))
      .filter(h => h.status === 'degraded')
      .sort((a, b) => b.successRate - a.successRate);

    if (degradedProviders.length > 0) {
      return degradedProviders[0].provider;
    }

    // Last resort: return first provider even if down
    return providers[0] || null;
  }

  /**
   * Reset health stats for a provider
   */
  reset(provider: string): void {
    this.health.delete(provider);
  }

  /**
   * Reset all health stats
   */
  resetAll(): void {
    this.health.clear();
  }

  private getOrCreate(provider: string): ProviderHealth {
    if (!this.health.has(provider)) {
      this.health.set(provider, {
        provider,
        successCount: 0,
        failureCount: 0,
        lastSuccess: null,
        lastFailure: null,
        status: 'healthy',
        successRate: 100,
      });
    }
    return this.health.get(provider)!;
  }

  private updateStatus(provider: string): void {
    const health = this.health.get(provider);
    if (!health) return;

    const total = health.successCount + health.failureCount;
    if (total === 0) {
      health.successRate = 100;
      health.status = 'healthy';
      return;
    }

    health.successRate = (health.successCount / total) * 100;

    if (health.successRate >= 80) {
      health.status = 'healthy';
    } else if (health.successRate >= 50) {
      health.status = 'degraded';
    } else {
      health.status = 'down';
    }
  }
}

// Singleton instance
export const apiHealthMonitor = new APIHealthMonitor();

/**
 * Wrapper to track API call health
 */
export async function trackAPICall<T>(
  provider: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const result = await fn();
    apiHealthMonitor.recordSuccess(provider);
    return result;
  } catch (error: any) {
    apiHealthMonitor.recordFailure(provider, error?.message);
    throw error;
  }
}
