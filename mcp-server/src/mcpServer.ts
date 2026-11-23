import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { EventToolError, eventsApi } from "./eventsApi.ts";

type EventRecord = {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
};

const eventId = z.number().int().positive();

const upcomingEventsInput = z
  .strictObject({
    from: z.iso
      .date()
      .optional()
      .describe("First UTC calendar date to include (YYYY-MM-DD)."),
    to: z.iso
      .date()
      .optional()
      .describe("Last UTC calendar date to include (YYYY-MM-DD)."),
    location: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Matches any part of the event's location, ignoring case."),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "The to date must be on or after the from date.",
    path: ["to"],
  });

const createEventInput = z.strictObject({
  title: z.string().trim().min(3).describe("The event title."),
  date: z.iso
    .datetime()
    .describe(
      "The event date and time in UTC. Include seconds and a trailing Z, for example 2026-12-31T19:00:00Z.",
    ),
  location: z.string().trim().min(1).describe("The event location."),
  description: z.string().trim().optional().describe("The event description."),
});

const updateEventInput = createEventInput
  .partial()
  .extend({ id: eventId.describe("The ID of the existing event.") })
  .refine(
    (input) =>
      Object.entries(input).some(
        ([field, value]) => field !== "id" && value !== undefined,
      ),
    "Provide at least one event field to update",
  );

function eventWriteHeaders() {
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

async function eventToolResult(
  run: () => Promise<EventRecord | Omit<EventRecord, "description">[]>,
): Promise<CallToolResult> {
  try {
    const result = await run();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: error instanceof EventToolError ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "events-api", version: "1.0.0" });

  server.registerTool(
    "get_upcoming_events",
    {
      description:
        "Get upcoming events, soonest first. For a date range such as next week, pass from and to as inclusive UTC dates. Pass location for a particular place. The tool applies all filters before the limit, which defaults to 10. Each event includes its ID, title, date, and location.",
      inputSchema: upcomingEventsInput,
    },
    ({ from, to, location, limit }) =>
      eventToolResult(async () => {
        const events = await eventsApi<EventRecord[]>("/upcoming");
        const locationQuery = location?.toLowerCase();

        const matchingEvents = events.filter((event) => {
          if (
            locationQuery &&
            !event.location.toLowerCase().includes(locationQuery)
          ) {
            return false;
          }
          if (!from && !to) return true;

          const date = event.date.slice(0, 10);
          return (!from || date >= from) && (!to || date <= to);
        });

        return matchingEvents
          .slice(0, limit)
          .map(({ id, title, date, location }) => ({
            id,
            title,
            date,
            location,
          }));
      }),
  );

  server.registerTool(
    "get_event",
    {
      description:
        "Get all details of one event by its ID, including the description.",
      inputSchema: z.object({
        id: eventId.describe("The ID of the event"),
      }),
    },
    ({ id }) =>
      eventToolResult(async () => {
        const event = await eventsApi<EventRecord | null>(`/${id}`);
        if (!event) {
          throw new EventToolError(`No event with id ${id} exists.`);
        }
        return event;
      }),
  );

  server.registerTool(
    "create_event",
    {
      description: "Create a single new event.",
      inputSchema: createEventInput,
    },
    (input) =>
      eventToolResult(() =>
        eventsApi<EventRecord>("", {
          method: "POST",
          headers: eventWriteHeaders(),
          body: JSON.stringify(input),
        }),
      ),
  );

  server.registerTool(
    "update_event",
    {
      description:
        "Update one existing event. Supply its numeric ID and at least one field to change. Omitted fields stay as they are. If the ID is unknown, use the read tools to identify the event or ask the user to clarify.",
      inputSchema: updateEventInput,
    },
    ({ id, ...changes }) =>
      eventToolResult(async () => {
        const event = await eventsApi<EventRecord | null>(`/${id}`, {
          method: "PUT",
          headers: eventWriteHeaders(),
          body: JSON.stringify(changes),
        });
        if (event === null) {
          throw new EventToolError(`No event with id ${id} exists.`);
        }
        return event;
      }),
  );

  return server;
}
