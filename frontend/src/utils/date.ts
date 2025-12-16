/**
 * Format an ISO date string to a localized string
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}
