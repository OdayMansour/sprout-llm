# Work Progress

## Status: Complete (v2 — Multi-session)

## What was built
A full-stack React/TypeScript chat app ("Sprout") with conversation branching and multi-session history.

### Feature set
- **Chat with Claude** (claude-haiku-4-5) via streaming
- **Fork conversations** by highlighting text in any assistant response → fork popup → question → new thread with full parent context inherited
- **Visual fork indicators** on parent thread: highlighted passage in amber + fork icon badge; click to navigate
- **Wikipedia-like navigation**: breadcrumb nav at top, collapsible sidebar session/thread tree
- **Multi-session history**: clicking "New conversation" creates a new session; all old sessions remain visible in the sidebar as collapsible groups (collapsed by default, newest first)
- **Persistence**: all sessions/threads/messages saved to localStorage under key `sprout`
- **Migration**: old single-session localStorage data is automatically migrated to the new multi-session format on first load
- **API key flow**: landing page collects key, stored in localStorage
- **PWA**: manifest.json + service worker for installability on mobile (prevents localStorage eviction)
- **Educational system prompt**: LLM starts from basics and increases complexity with conversation depth

## Project structure
```
src/
  types/index.ts              — Thread (+ sessionId), Message, ForkMark, Session, ConversationState
  context/ConversationContext.tsx — state management (useReducer + localStorage); NEW_SESSION action
  utils/api.ts                — streamChat() wrapper for Anthropic SDK; educational system prompt
  components/
    App.tsx                   — layout, sidebar toggle, API key gate
    ChatContainer.tsx         — messages + input + fork creation
    MessageBubble.tsx         — renders messages with fork highlights + text selection
    ForkPopup.tsx             — popup for creating forks
    BreadcrumbNav.tsx         — thread path navigation
    ThreadTree.tsx            — collapsible sidebar: sessions as groups, threads as trees
    ApiKeyInput.tsx           — landing page
public/
  manifest.json               — PWA manifest
  sw.js                       — service worker (passthrough)
  icon-192.png / icon-512.png — PWA icons (must be created by user)
```

## Key implementation details
- **Multi-session model**: `ConversationState` holds `sessions[]` + flat `threads{}` map. Each `Thread` has a `sessionId`. Each `Session` has a `rootThreadId`.
- **Session sidebar**: Sessions displayed newest-first. Active session auto-expands. Click session header to toggle collapse. Switching to a thread in another session auto-expands that session.
- **Fork ancestry bug fix**: `createFork()` walks up the thread hierarchy to find the true origin thread containing the forked message ID (inherited messages keep their original IDs).
- **Forked threads inherit context**: all messages up to the forked message are copied into the new thread.
- **Fork timing fix**: `createFork()` returns `inheritedMessages` so `sendMessage` can use them before React re-renders.
- **Text offset calculation**: walks DOM text nodes for character offsets stored in `ForkMark`.

## Dev server
```bash
npm run dev   # runs on :5173
```

## Potential future improvements
- Per-thread streaming state (currently one global flag blocks all threads)
- Markdown rendering in assistant messages
- Ability to delete/rename sessions
- Export/import conversation trees
