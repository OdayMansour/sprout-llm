export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  model: string
}

export interface ForkMark {
  id: string
  // The ID of the thread that was forked from this passage
  threadId: string
  // The highlighted text that triggered the fork
  selectedText: string
  // Character offsets within the message content
  startOffset: number
  endOffset: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  // Fork marks embedded in this message (only on assistant messages)
  forks: ForkMark[]
  // Whether this message is still being streamed
  streaming?: boolean
  // Token usage recorded when this message finished streaming (assistant messages only)
  tokenUsage?: TokenUsage
}

export interface Thread {
  id: string
  // Which session this thread belongs to
  sessionId: string
  // Auto-generated topic label (set after first reply in a root thread)
  title?: string
  // Root thread has no parent
  parentThreadId: string | null
  // Which fork mark in the parent thread created this thread
  parentForkMarkId: string | null
  // The message in the parent thread that was forked from
  parentMessageId: string | null
  // Snippet of the selected text that created this fork (for display)
  forkContext: string | null
  // The user's question that started this fork
  forkQuestion: string | null
  messages: Message[]
  createdAt: number
}

export interface Session {
  id: string
  rootThreadId: string
  createdAt: number
}

export interface ConversationState {
  sessions: Session[]
  threads: Record<string, Thread>
  activeSessionId: string
  activeThreadId: string
}
