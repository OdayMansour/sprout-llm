import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { ConversationState, Session, Thread, Message, ForkMark, TokenUsage } from '../types'

function createSessionAndRoot(): { session: Session; rootThread: Thread } {
  const sessionId = uuid()
  const rootThreadId = uuid()
  const session: Session = { id: sessionId, rootThreadId, createdAt: Date.now() }
  const rootThread: Thread = {
    id: rootThreadId,
    sessionId,
    parentThreadId: null,
    parentForkMarkId: null,
    parentMessageId: null,
    forkContext: null,
    forkQuestion: null,
    messages: [],
    createdAt: Date.now(),
  }
  return { session, rootThread }
}

/** BFS to collect a thread ID and all its descendant thread IDs. */
function getDescendantIds(threadId: string, threads: Record<string, Thread>): Set<string> {
  const result = new Set<string>()
  const queue = [threadId]
  while (queue.length > 0) {
    const id = queue.shift()!
    result.add(id)
    for (const t of Object.values(threads)) {
      if (t.parentThreadId === id) queue.push(t.id)
    }
  }
  return result
}

function initialState(): ConversationState {
  const saved = localStorage.getItem('sprout')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      // Migration from old format (had rootThreadId at top level, no sessions array)
      if (!parsed.sessions) {
        const sessionId = 'session-legacy'
        const rootThreadId = parsed.rootThreadId as string
        const migratedThreads: Record<string, Thread> = Object.fromEntries(
          Object.entries(parsed.threads as Record<string, Thread>).map(([id, t]) => [
            id,
            { ...t, sessionId },
          ]),
        )
        return {
          sessions: [{ id: sessionId, rootThreadId, createdAt: Date.now() }],
          threads: migratedThreads,
          activeSessionId: sessionId,
          activeThreadId: parsed.activeThreadId as string,
        }
      }
      return parsed as ConversationState
    } catch {
      // ignore corrupt data
    }
  }
  const { session, rootThread } = createSessionAndRoot()
  return {
    sessions: [session],
    threads: { [rootThread.id]: rootThread },
    activeSessionId: session.id,
    activeThreadId: rootThread.id,
  }
}

type Action =
  | { type: 'SET_ACTIVE_THREAD'; threadId: string }
  | { type: 'ADD_MESSAGE'; threadId: string; message: Message }
  | { type: 'APPEND_STREAM'; threadId: string; messageId: string; chunk: string }
  | { type: 'FINISH_STREAM'; threadId: string; messageId: string; tokenUsage?: TokenUsage }
  | { type: 'REMOVE_MESSAGE'; threadId: string; messageId: string }
  | {
      type: 'CREATE_FORK'
      parentThreadId: string
      parentMessageId: string
      forkMark: ForkMark
      newThread: Thread
    }
  | { type: 'NEW_SESSION'; session: Session; rootThread: Thread }
  | { type: 'SET_THREAD_TITLE'; threadId: string; title: string }
  | { type: 'DELETE_THREAD'; threadId: string }
  | { type: 'DELETE_SESSION'; sessionId: string }

function reducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case 'SET_ACTIVE_THREAD': {
      const thread = state.threads[action.threadId]
      if (!thread) return state
      return {
        ...state,
        activeThreadId: action.threadId,
        activeSessionId: thread.sessionId,
      }
    }

    case 'ADD_MESSAGE': {
      const thread = state.threads[action.threadId]
      if (!thread) return state
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.threadId]: {
            ...thread,
            messages: [...thread.messages, action.message],
          },
        },
      }
    }

    case 'APPEND_STREAM': {
      const thread = state.threads[action.threadId]
      if (!thread) return state
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.threadId]: {
            ...thread,
            messages: thread.messages.map((m) =>
              m.id === action.messageId
                ? { ...m, content: m.content + action.chunk }
                : m,
            ),
          },
        },
      }
    }

    case 'FINISH_STREAM': {
      const thread = state.threads[action.threadId]
      if (!thread) return state
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.threadId]: {
            ...thread,
            messages: thread.messages.map((m) =>
              m.id === action.messageId
                ? { ...m, streaming: false, ...(action.tokenUsage ? { tokenUsage: action.tokenUsage } : {}) }
                : m,
            ),
          },
        },
      }
    }

    case 'REMOVE_MESSAGE': {
      const thread = state.threads[action.threadId]
      if (!thread) return state
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.threadId]: {
            ...thread,
            messages: thread.messages.filter((m) => m.id !== action.messageId),
          },
        },
      }
    }

    case 'CREATE_FORK': {
      // Add fork mark to the parent message
      const parentThread = state.threads[action.parentThreadId]
      if (!parentThread) return state
      const updatedParentThread: Thread = {
        ...parentThread,
        messages: parentThread.messages.map((m) =>
          m.id === action.parentMessageId
            ? { ...m, forks: [...m.forks, action.forkMark] }
            : m,
        ),
      }
      return {
        ...state,
        activeThreadId: action.newThread.id,
        activeSessionId: action.newThread.sessionId,
        threads: {
          ...state.threads,
          [action.parentThreadId]: updatedParentThread,
          [action.newThread.id]: action.newThread,
        },
      }
    }

    case 'SET_THREAD_TITLE': {
      const thread = state.threads[action.threadId]
      if (!thread) return state
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.threadId]: { ...thread, title: action.title },
        },
      }
    }

    case 'NEW_SESSION': {
      return {
        ...state,
        sessions: [...state.sessions, action.session],
        threads: {
          ...state.threads,
          [action.rootThread.id]: action.rootThread,
        },
        activeSessionId: action.session.id,
        activeThreadId: action.rootThread.id,
      }
    }

    case 'DELETE_THREAD': {
      const thread = state.threads[action.threadId]
      // Only non-root threads can be deleted individually
      if (!thread || thread.parentThreadId === null) return state

      const toDelete = getDescendantIds(action.threadId, state.threads)

      const newThreads: Record<string, Thread> = {}
      for (const [id, t] of Object.entries(state.threads)) {
        if (toDelete.has(id)) continue
        // Strip the fork mark that pointed to the deleted thread from the parent
        if (id === thread.parentThreadId) {
          newThreads[id] = {
            ...t,
            messages: t.messages.map((m) => ({
              ...m,
              forks: m.forks.filter((f) => f.id !== thread.parentForkMarkId),
            })),
          }
        } else {
          newThreads[id] = t
        }
      }

      const wasActive = toDelete.has(state.activeThreadId)
      return {
        ...state,
        threads: newThreads,
        activeThreadId: wasActive ? thread.parentThreadId : state.activeThreadId,
        activeSessionId: wasActive ? thread.sessionId : state.activeSessionId,
      }
    }

    case 'DELETE_SESSION': {
      const newSessions = state.sessions.filter((s) => s.id !== action.sessionId)
      const newThreads = Object.fromEntries(
        Object.entries(state.threads).filter(([, t]) => t.sessionId !== action.sessionId),
      )

      // Deleting a non-active session — simple removal
      if (state.activeSessionId !== action.sessionId) {
        return { ...state, sessions: newSessions, threads: newThreads }
      }

      // Deleting the active session — switch to most recent remaining session
      if (newSessions.length > 0) {
        const next = [...newSessions].sort((a, b) => b.createdAt - a.createdAt)[0]
        return {
          ...state,
          sessions: newSessions,
          threads: newThreads,
          activeSessionId: next.id,
          activeThreadId: newThreads[next.rootThreadId].id,
        }
      }

      // Last session deleted — spin up a fresh empty one
      const { session: fresh, rootThread: freshRoot } = createSessionAndRoot()
      return {
        sessions: [fresh],
        threads: { [freshRoot.id]: freshRoot },
        activeSessionId: fresh.id,
        activeThreadId: freshRoot.id,
      }
    }
  }
}

function persistMiddleware(
  reducer: (s: ConversationState, a: Action) => ConversationState,
) {
  return (state: ConversationState, action: Action): ConversationState => {
    const next = reducer(state, action)
    // Don't persist mid-stream to avoid thrash
    if (action.type !== 'APPEND_STREAM') {
      localStorage.setItem('sprout', JSON.stringify(next))
    }
    return next
  }
}

interface ConversationContextValue {
  state: ConversationState
  activeThread: Thread
  setActiveThread: (threadId: string) => void
  addUserMessage: (threadId: string, content: string) => Message
  addAssistantMessage: (threadId: string) => Message
  appendStream: (threadId: string, messageId: string, chunk: string) => void
  finishStream: (threadId: string, messageId: string, tokenUsage?: TokenUsage) => void
  removeMessage: (threadId: string, messageId: string) => void
  createFork: (
    parentThreadId: string,
    parentMessageId: string,
    selectedText: string,
    startOffset: number,
    endOffset: number,
    question: string,
  ) => { forkMarkId: string; newThreadId: string; inheritedMessages: Message[] }
  getThreadPath: (threadId: string) => Thread[]
  setThreadTitle: (threadId: string, title: string) => void
  newSession: () => void
  deleteThread: (threadId: string) => void
  deleteSession: (sessionId: string) => void
}

const ConversationContext = createContext<ConversationContextValue | null>(null)

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(persistMiddleware(reducer), undefined, initialState)

  const activeThread = state.threads[state.activeThreadId]!

  const setActiveThread = useCallback((threadId: string) => {
    dispatch({ type: 'SET_ACTIVE_THREAD', threadId })
  }, [])

  const addUserMessage = useCallback((threadId: string, content: string): Message => {
    const message: Message = {
      id: uuid(),
      role: 'user',
      content,
      forks: [],
    }
    dispatch({ type: 'ADD_MESSAGE', threadId, message })
    return message
  }, [])

  const addAssistantMessage = useCallback((threadId: string): Message => {
    const message: Message = {
      id: uuid(),
      role: 'assistant',
      content: '',
      forks: [],
      streaming: true,
    }
    dispatch({ type: 'ADD_MESSAGE', threadId, message })
    return message
  }, [])

  const appendStream = useCallback(
    (threadId: string, messageId: string, chunk: string) => {
      dispatch({ type: 'APPEND_STREAM', threadId, messageId, chunk })
    },
    [],
  )

  const finishStream = useCallback((threadId: string, messageId: string, tokenUsage?: TokenUsage) => {
    dispatch({ type: 'FINISH_STREAM', threadId, messageId, tokenUsage })
  }, [])

  const removeMessage = useCallback((threadId: string, messageId: string) => {
    dispatch({ type: 'REMOVE_MESSAGE', threadId, messageId })
  }, [])

  const createFork = useCallback(
    (
      parentThreadId: string,
      parentMessageId: string,
      selectedText: string,
      startOffset: number,
      endOffset: number,
      question: string,
    ) => {
      const forkMarkId = uuid()
      const newThreadId = uuid()

      const forkMark: ForkMark = {
        id: forkMarkId,
        threadId: newThreadId,
        selectedText,
        startOffset,
        endOffset,
      }

      // Find the true origin thread: the highest ancestor that contains this message ID.
      // Inherited messages keep their original IDs, so if the selected message was copied
      // from a grandparent, the fork belongs there — not in the current thread.
      let trueParentThreadId = parentThreadId
      let cursor = state.threads[parentThreadId]
      while (cursor?.parentThreadId) {
        const ancestor = state.threads[cursor.parentThreadId]
        if (ancestor?.messages.some((m) => m.id === parentMessageId)) {
          trueParentThreadId = cursor.parentThreadId
          cursor = ancestor
        } else {
          break
        }
      }

      const parentThread = state.threads[trueParentThreadId]!
      const parentMessage = parentThread.messages.find((m) => m.id === parentMessageId)!

      // Build context for the new thread: all messages up to and including the forked message
      const contextMessages = parentThread.messages.slice(
        0,
        parentThread.messages.indexOf(parentMessage) + 1,
      )

      const inheritedMessages = contextMessages.map((m) => ({
        ...m,
        forks: [],
        streaming: false,
      }))

      const newThread: Thread = {
        id: newThreadId,
        sessionId: parentThread.sessionId,
        parentThreadId: trueParentThreadId,
        parentForkMarkId: forkMarkId,
        parentMessageId,
        forkContext: selectedText,
        forkQuestion: question,
        // Inherit the parent conversation context
        messages: inheritedMessages,
        createdAt: Date.now(),
      }

      dispatch({
        type: 'CREATE_FORK',
        parentThreadId: trueParentThreadId,
        parentMessageId,
        forkMark,
        newThread,
      })

      // Return inherited messages so the caller can use them immediately
      // (before state re-render makes the new thread available via state.threads)
      return { forkMarkId, newThreadId, inheritedMessages }
    },
    [state.threads],
  )

  const getThreadPath = useCallback(
    (threadId: string): Thread[] => {
      const path: Thread[] = []
      let current: Thread | undefined = state.threads[threadId]
      while (current) {
        path.unshift(current)
        current = current.parentThreadId ? state.threads[current.parentThreadId] : undefined
      }
      return path
    },
    [state.threads],
  )

  const setThreadTitle = useCallback((threadId: string, title: string) => {
    dispatch({ type: 'SET_THREAD_TITLE', threadId, title })
  }, [])

  const newSession = useCallback(() => {
    const { session, rootThread } = createSessionAndRoot()
    dispatch({ type: 'NEW_SESSION', session, rootThread })
  }, [])

  const deleteThread = useCallback((threadId: string) => {
    dispatch({ type: 'DELETE_THREAD', threadId })
  }, [])

  const deleteSession = useCallback((sessionId: string) => {
    dispatch({ type: 'DELETE_SESSION', sessionId })
  }, [])

  return (
    <ConversationContext.Provider
      value={{
        state,
        activeThread,
        setActiveThread,
        addUserMessage,
        addAssistantMessage,
        appendStream,
        finishStream,
        removeMessage,
        createFork,
        getThreadPath,
        setThreadTitle,
        newSession,
        deleteThread,
        deleteSession,
      }}
    >
      {children}
    </ConversationContext.Provider>
  )
}

export function useConversation() {
  const ctx = useContext(ConversationContext)
  if (!ctx) throw new Error('useConversation must be used within ConversationProvider')
  return ctx
}
