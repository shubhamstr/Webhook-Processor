/**
 * Time utility functions for Indian Standard Time (IST, UTC+05:30).
 *
 * Ensures all timestamps stored in PostgreSQL (TIMESTAMP WITHOUT TIME ZONE)
 * and returned by the APIs strictly adhere to Indian Standard Time (IST).
 */

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds

/**
 * Returns a JavaScript Date object shifted by +05:30 so that its UTC representation
 * matches the exact Indian Standard Time (e.g. 2026-11-27T00:15:00.000Z).
 * When Prisma serializes this Date into a PostgreSQL TIMESTAMP WITHOUT TIME ZONE column,
 * PostgreSQL stores the exact IST date and time string without conversion.
 */
export function getISTDate(date: Date | number = new Date()): Date {
  const baseTime = typeof date === 'number' ? date : date.getTime();
  return new Date(baseTime + IST_OFFSET_MS);
}

/**
 * Returns an ISO-formatted string with the explicit +05:30 IST offset.
 * Example: "2026-11-27T00:15:00.000+05:30"
 */
export function getISTISOString(date: Date | number = new Date()): string {
  const baseTime = typeof date === 'number' ? date : date.getTime();
  const istDate = new Date(baseTime + IST_OFFSET_MS);
  return istDate.toISOString().replace('Z', '+05:30');
}

/**
 * Formats a Date or timestamp string into human-readable IST display.
 * Example: "27 Nov 2026, 12:15:00 am IST"
 */
export function formatIST(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return `${d.toLocaleString('en-IN', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })} IST`;
}
