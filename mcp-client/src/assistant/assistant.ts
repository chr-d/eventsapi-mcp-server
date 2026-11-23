import Anthropic from "@anthropic-ai/sdk";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z, ZodError } from "zod";

const client = new Anthropic();
const model = process.env.LLM_MODEL ?? "claude-haiku-5-5";
const MAX_STEPS = 5;
const mcpUrl = new URL(
  process.env.MCP_SERVER_URL ?? "http://localhost:3002/mcp",
);
const toolArguments = z.record(z.string(), z.unknown());

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export class IncompleteReplyError extends Error {
  override name = "IncompleteReplyError";
}

export async function askAssistant(
  question: string,
  history: ConversationMessage[] = [],
): Promise<string> {
  const mcp = new Client(
    { name: "events-assistant", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );

  try {
    await mcp.connect(new StreamableHTTPClientTransport(mcpUrl));
    const { tools: remoteTools } = await mcp.listTools();
    const tools: Anthropic.Tool[] = remoteTools.map(
      ({ name, description, inputSchema }) => ({
        name,
        description,
        input_schema: inputSchema,
      }),
    );

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: question },
    ];

    for (let step = 1; step <= MAX_STEPS; step++) {
      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        system: `You answer questions about events using your tools. Today is ${new Date().toDateString()}. Use prior conversation to understand the latest request, including answers to earlier questions. Answer only event-related requests. Base event details and confirmations on tool results from the current request. If a tool reports that the events system is unavailable, explain that the information could not be retrieved.`,
        tools,
        messages,
      });
      console.log(`Step ${step}: token usage`, message.usage);
      messages.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "end_turn") {
        const reply = message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        if (!reply.trim()) {
          throw new IncompleteReplyError(
            "Assistant ended the turn without a text reply",
          );
        }
        return reply;
      }
      if (message.stop_reason !== "tool_use") {
        throw new IncompleteReplyError(
          `Unexpected stop reason: ${message.stop_reason}`,
        );
      }

      const toolUses = message.content.filter(
        (block) => block.type === "tool_use",
      );
      const results = await Promise.all(
        toolUses.map(
          async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
            console.log(`Step ${step}: ${toolUse.name}`, toolUse.input);
            try {
              const result = await mcp.callTool({
                name: toolUse.name,
                arguments: toolArguments.parse(toolUse.input),
              });
              return {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: result.content
                  .filter((block) => block.type === "text")
                  .map((block) => block.text)
                  .join("\n"),
                is_error: result.isError === true,
              };
            } catch (err) {
              console.error(`Step ${step}: ${toolUse.name} failed`, err);
              return {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content:
                  err instanceof ZodError
                    ? "Invalid input for the event tool."
                    : "The event tool could not complete the request.",
                is_error: true,
              };
            }
          },
        ),
      );
      messages.push({ role: "user", content: results });
    }

    throw new IncompleteReplyError(
      `Assistant reached the step limit (${MAX_STEPS})`,
    );
  } finally {
    await mcp.close();
  }
}
