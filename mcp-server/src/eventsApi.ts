const baseUrl = process.env.EVENTS_API_URL ?? "http://localhost:3001";

export class EventToolError extends Error {
  override name = "EventToolError";
}

export async function eventsApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(`${baseUrl}/api/events${path}`, init);
    if (!response.ok) {
      const message =
        response.status >= 500 || response.status === 429
          ? "The events system is unavailable."
          : "The events system could not complete the request.";
      throw new EventToolError(message, {
        cause: new Error(`Events API returned HTTP ${response.status}`),
      });
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof EventToolError) throw error;
    throw new EventToolError("The events system is unavailable.", {
      cause: error,
    });
  }
}
