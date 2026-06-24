/** User-safe flight errors — log details server-side only. */
export function clientFlightError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.startsWith('No airport found') || msg.startsWith('No flights found')) {
      return msg;
    }
  }
  return 'Flight search unavailable. Try again later.';
}

export const SERVICE_UNAVAILABLE = {
  directions: 'Directions service unavailable.',
  pois: 'Stop search is temporarily unavailable.',
  flights: 'Flight search unavailable. Try again later.',
  weather: 'Weather unavailable.',
} as const;
