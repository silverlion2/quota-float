const inFlightDeliveries = new Set<string>();

export async function deliverNotificationOnce(
  key: string,
  wasDelivered: () => boolean,
  markDelivered: () => void,
  deliver: () => Promise<boolean>,
): Promise<boolean> {
  if (wasDelivered() || inFlightDeliveries.has(key)) return false;
  inFlightDeliveries.add(key);
  try {
    const delivered = await deliver().catch(() => false);
    if (delivered) markDelivered();
    return delivered;
  } finally {
    inFlightDeliveries.delete(key);
  }
}
