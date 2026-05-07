export class InMemoryMpesaReplayProtectionService {
  private readonly deliveries = new Set<string>();

  async registerDelivery(tenantId: string, deliveryId: string): Promise<boolean> {
    const key = `${tenantId}:${deliveryId}`;

    if (this.deliveries.has(key)) {
      return false;
    }

    this.deliveries.add(key);
    return true;
  }

  reset(): void {
    this.deliveries.clear();
  }
}
