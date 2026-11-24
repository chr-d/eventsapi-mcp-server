const baseUrl = process.env.EVENTS_API_URL ?? "http://localhost:3001";

export class EventToolError extends Error {
  override name = "EventToolError";
}

export function eventWriteHeaders() {
  const token = process.env.EVENTS_API_TOKEN;
  if (!token) {
    throw new EventToolError("The events system is unavailable.", {
      cause: new Error("EVENTS_API_TOKEN is required to write events"),
    });
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function requestEventsApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${baseUrl}/api/events${path}`, init);
  } catch (error) {
    throw new EventToolError("The events system is unavailable.", {
      cause: error,
    });
  }
}

function checkEventsApiResponse(response: Response): void {
  if (response.ok) return;

  const message =
    response.status >= 500 || response.status === 429
      ? "The events system is unavailable."
      : "The events system could not complete the request.";
  throw new EventToolError(message, {
    cause: new Error(`Events API returned HTTP ${response.status}`),
  });
}

export async function eventsApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await requestEventsApi(path, init);
  checkEventsApiResponse(response);

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new EventToolError("The events system is unavailable.", {
      cause: error,
    });
  }
}

export async function deleteEvent(id: number): Promise<void> {
  const response = await requestEventsApi(`/${id}`, {
    method: "DELETE",
    headers: eventWriteHeaders(),
  });

  if (response.status === 404) {
    throw new EventToolError("The event no longer exists.");
  }
  checkEventsApiResponse(response);
  if (response.status !== 204) {
    throw new EventToolError(
      "The events system returned an unexpected response.",
    );
  }
}
