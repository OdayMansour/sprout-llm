# llm-branching-chats

Highlight any part of a Claude response and branch off into a new sub-conversation — without losing the thread you came from.

---

Most chat interfaces are a single linear thread. The moment a response sparks a follow-up question, you either interrupt the current conversation or lose context trying to start a new one. This app lets you highlight any passage in a response and fork it into its own focused thread, while the original conversation stays intact. Navigate between threads via breadcrumbs and a sidebar tree, and jump back to any point in the hierarchy at any time.

## Features

- **Fork from any response** — select text, click "Explain this" or ask something custom, and a new thread opens with that passage as context
- **Tree navigation** — sidebar shows all sessions and their forked threads; breadcrumb bar shows where you are in the hierarchy
- **Inherited context** — forked threads carry the parent conversation history so Claude always has full context
- **Streaming responses** — real-time output via the Anthropic SDK
- **Persistent sessions** — all conversations saved to localStorage

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- `@anthropic-ai/sdk` (streaming, `claude-haiku-4-5`, `claude-sonnet-4-6`)
- `uuid`, localStorage

## Getting started

```bash
npm install
npm run dev
```

Enter your Anthropic API key in the UI when prompted. The key is stored in localStorage and never sent anywhere except the Anthropic API.
Add to Homescreen as a Progressive Web App to let your API key persist for longer than 7 days. 
