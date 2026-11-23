# Events MCP Server

A TypeScript and Express project that uses Claude to list, look up, create, and update events. It builds on the [Tool Calling API](https://github.com/chr-d/toolcall-api) by moving the event tools into a separate MCP server.

## Run locally

Use Node.js 24 or newer and npm. Start the [Events API](https://github.com/WebDev-WBSCodingSchool/events-api) separately.

### MCP server

From the project root, run:

```sh
cd mcp-server
npm ci
cp .env.example .env
```

In `.env`, point `EVENTS_API_URL` to the running Events API (default `http://localhost:3001`). Set `EVENTS_API_TOKEN` to an Events API bearer token if you want to create or update events.

```sh
npm run dev
```

### MCP client

From the project root, open a second terminal and run:

```sh
cd mcp-client
npm ci
cp .env.example .env
```

Set `ANTHROPIC_API_KEY` in `.env`. The client connects to the MCP server at `http://localhost:3002/mcp` by default. Set `MCP_SERVER_URL` if you run the server at a different address.

```sh
npm run dev
```

## Use the API

Send a natural-language `message` to `POST /assistant`. The client returns a JSON object with a `reply` string.

```sh
curl http://localhost:3000/assistant \
  -H 'Content-Type: application/json' \
  -d '{"message":"What upcoming events are in Berlin?"}'
```

For follow-up questions, send up to 10 prior messages in the optional `history` array, in conversation order. Each entry has a `role` (`user` or `assistant`) and a `content` string. Replace the sample assistant message below with the `reply` from your previous request.

```sh
curl http://localhost:3000/assistant \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Where is that event taking place?",
    "history": [
      {"role": "user", "content": "What upcoming events are in Berlin?"},
      {"role": "assistant", "content": "The next event is the Winter Concert (event ID 42)."}
    ]
  }'
```
