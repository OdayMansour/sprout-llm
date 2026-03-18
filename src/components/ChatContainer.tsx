import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react'
import { useConversation } from '../context/ConversationContext'
import { MessageBubble } from './MessageBubble'
import { ForkPopup } from './ForkPopup'
import { BreadcrumbNav } from './BreadcrumbNav'
import { streamChat, generateTitle } from '../utils/api'
import type { Message } from '../types'

interface Props {
  apiKey: string
  model: string
}

interface PendingFork {
  selectedText: string
  startOffset: number
  endOffset: number
  anchorX: number
  anchorY: number
  messageId: string
}

interface RetryInfo {
  threadId: string
  assistantMsgId: string
  messagesForApi: Message[]
  forkContext?: string
  content: string
  needsTitle: boolean
}

export function ChatContainer({ apiKey, model }: Props) {
  const {
    state,
    activeThread,
    addUserMessage,
    addAssistantMessage,
    appendStream,
    finishStream,
    removeMessage,
    createFork,
    setThreadTitle,
  } = useConversation()

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null)
  const [pendingFork, setPendingFork] = useState<PendingFork | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread.messages])

  // Clear transient state when thread changes
  useEffect(() => {
    setPendingFork(null)
    setError(null)
    setRetryInfo(null)
  }, [state.activeThreadId])

  // Core streaming function — shared by sendMessage and retryLast
  const doStream = useCallback(
    async (
      threadId: string,
      assistantMsgId: string,
      messagesForApi: Message[],
      forkContext: string | undefined,
      content: string,
      needsTitle: boolean,
    ) => {
      setError(null)
      setRetryInfo(null)
      setIsStreaming(true)

      const controller = new AbortController()
      abortControllerRef.current = controller

      await streamChat(apiKey, messagesForApi, {
        onChunk: (chunk) => appendStream(threadId, assistantMsgId, chunk),
        onDone: (usage) => {
          finishStream(
            threadId,
            assistantMsgId,
            usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model } : undefined,
          )
          setIsStreaming(false)
          abortControllerRef.current = null
          if (needsTitle) {
            generateTitle(apiKey, content, model).then((title) => {
              if (title) setThreadTitle(threadId, title)
            })
          }
        },
        onError: (err) => {
          finishStream(threadId, assistantMsgId)
          setIsStreaming(false)
          abortControllerRef.current = null
          setError(err.message)
          setRetryInfo({ threadId, assistantMsgId, messagesForApi, forkContext, content, needsTitle })
        },
      }, forkContext, controller.signal, model)
    },
    [apiKey, model, appendStream, finishStream, setThreadTitle],
  )

  const sendMessage = useCallback(
    async (content: string, threadId: string, priorMessages?: Message[], forkContext?: string) => {
      if (!content.trim() || isStreaming) return

      addUserMessage(threadId, content)
      const assistantMsg = addAssistantMessage(threadId)

      // Use provided prior messages (e.g. from a just-created fork whose thread
      // isn't in state yet) or fall back to what's currently in state
      const contextMessages =
        priorMessages ?? state.threads[threadId]?.messages ?? []
      // When forking, inject the highlighted passage into the API message so the
      // LLM knows exactly what the question is about, regardless of how terse
      // the user's question is (e.g. "Tell me more", "Why is this?").
      const apiContent = forkContext
        ? `My question is specifically about this highlighted passage: "${forkContext}"\n\n${content}`
        : content
      const messagesForApi = [
        ...contextMessages.filter((m) => !m.streaming),
        { id: 'tmp', role: 'user' as const, content: apiContent, forks: [], streaming: false },
      ]

      // Is this the first user message in a root thread with no title yet?
      const thread = state.threads[threadId]
      const isRootThread = thread?.parentThreadId === null
      const isFirstMessage = (thread?.messages.filter((m) => m.role === 'user').length ?? 0) === 0
      const needsTitle = isRootThread && isFirstMessage && !thread?.title

      await doStream(threadId, assistantMsg.id, messagesForApi, forkContext, content, needsTitle)
    },
    [isStreaming, state.threads, addUserMessage, addAssistantMessage, doStream],
  )

  const retryLast = useCallback(async () => {
    if (!retryInfo || isStreaming) return
    const { threadId, assistantMsgId, messagesForApi, forkContext, content, needsTitle } = retryInfo
    // Swap out the failed (empty/partial) assistant message for a fresh placeholder
    removeMessage(threadId, assistantMsgId)
    const newAssistantMsg = addAssistantMessage(threadId)
    await doStream(threadId, newAssistantMsg.id, messagesForApi, forkContext, content, needsTitle)
  }, [retryInfo, isStreaming, removeMessage, addAssistantMessage, doStream])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const content = input.trim()
    if (!content || isStreaming) return
    setInput('')
    sendMessage(content, state.activeThreadId)
  }

  function handleTextSelect(
    selectedText: string,
    startOffset: number,
    endOffset: number,
    anchorX: number,
    anchorY: number,
    messageId: string,
  ) {
    // Don't show fork popup if the message is still streaming
    const message = activeThread.messages.find((m) => m.id === messageId)
    if (message?.streaming) return
    setPendingFork({ selectedText, startOffset, endOffset, anchorX, anchorY, messageId })
  }

  function handleFork(question: string) {
    if (!pendingFork) return

    const { newThreadId, inheritedMessages } = createFork(
      state.activeThreadId,
      pendingFork.messageId,
      pendingFork.selectedText,
      pendingFork.startOffset,
      pendingFork.endOffset,
      question,
    )

    setPendingFork(null)
    window.getSelection()?.removeAllRanges()

    // Pass inheritedMessages directly so we don't depend on the state update
    // having been applied yet (React batches the CREATE_FORK dispatch).
    // Also pass the highlighted text as forkContext so the LLM knows what passage
    // is being referenced.
    sendMessage(question, newThreadId, inheritedMessages, pendingFork.selectedText)
  }

  const isEmpty = activeThread.messages.length === 0
  const isForkedThread = activeThread.parentThreadId !== null

  return (
    <div className="flex flex-col h-full relative">
      <BreadcrumbNav />

      {/* Fork context banner */}
      {isForkedThread && activeThread.forkContext && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-400/20 flex items-start gap-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="#f59e0b"
            className="flex-shrink-0 mt-0.5"
          >
            <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
          </svg>
          <span className="text-xs text-amber-700">
            Forked from: "
            {activeThread.forkContext.length > 100
              ? activeThread.forkContext.slice(0, 100) + '…'
              : activeThread.forkContext}
            "
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto w-full">
        {isEmpty ? (
          <EmptyState isForked={isForkedThread} />
        ) : (
          activeThread.messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              pendingSelection={
                pendingFork?.messageId === message.id
                  ? { startOffset: pendingFork.startOffset, endOffset: pendingFork.endOffset }
                  : undefined
              }
              forkContext={
                // Show the highlighted passage as a quote on the fork question message.
                // The forked thread starts with inherited parent messages, so the fork
                // question is identified by matching forkQuestion content, not by index.
                isForkedThread &&
                message.role === 'user' &&
                message.content === activeThread.forkQuestion
                  ? activeThread.forkContext ?? undefined
                  : undefined
              }
              onTextSelect={handleTextSelect}
            />
          ))
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM8 9a.75.75 0 0 0 .75-.75V3a.75.75 0 0 0-1.5 0v5.25A.75.75 0 0 0 8 9Zm.75 2.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
          </svg>
          <span className="flex-1 min-w-0 break-words">{error}</span>
          {retryInfo && (
            <button
              onClick={retryLast}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-red-600/80 text-white hover:bg-red-500 transition-colors font-medium"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
              </svg>
              Retry
            </button>
          )}
          <button
            onClick={() => { setError(null); setRetryInfo(null) }}
            className="flex-shrink-0 text-red-600 hover:text-red-800"
          >
            ×
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-4 md:px-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-2xl mx-auto w-full">
        <div className="relative flex items-end gap-2 bg-gray-800 border border-gray-600 rounded-xl p-2 focus-within:border-gray-500 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? 'Waiting for response…'
                : 'Message Claude… (Shift+Enter for newline)'
            }
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none min-h-[24px] max-h-[160px] overflow-y-auto py-1 px-1"
          />
          {isStreaming ? (
            <button
              onClick={() => abortControllerRef.current?.abort()}
              title="Stop generating"
              className="flex-shrink-0 p-2 rounded-lg bg-red-600/80 text-white hover:bg-red-500 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex-shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.989 8 .064 2.68a1.342 1.342 0 0 1 1.85-1.462l13.402 5.744a1.13 1.13 0 0 1 0 2.076L1.913 14.782a1.343 1.343 0 0 1-1.85-1.463L.99 8Zm.603-5.288L2.38 7.25h4.87a.75.75 0 0 1 0 1.5H2.38l-.788 4.538L13.929 8Z" />
              </svg>
            </button>
          )}
        </div>
        <div className="mt-1.5 px-1 flex items-center gap-2">
          <p className="text-[10px] text-gray-600">
            Highlight any text in a response to fork a new conversation
          </p>
        </div>
        </div>
      </div>

      {/* Fork popup */}
      {pendingFork && (
        <ForkPopup
          selectedText={pendingFork.selectedText}
          anchorX={pendingFork.anchorX}
          anchorY={pendingFork.anchorY}
          onFork={handleFork}
          onDismiss={() => {
            setPendingFork(null)
            window.getSelection()?.removeAllRanges()
          }}
        />
      )}
    </div>
  )
}

function EmptyState({ isForked }: { isForked: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 16 16" fill="#60a5fa">
          <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2.5a1 1 0 0 0-.8.4l-1.9 2.533A.5.5 0 0 1 0 15V2Z" />
        </svg>
      </div>
      {isForked ? (
        <>
          <h3 className="text-sm font-medium text-gray-300">Forked thread</h3>
          <p className="text-xs text-gray-500 max-w-xs">
            This is a fork — your question has been sent. Continue exploring this
            direction, then navigate back to the main thread when you&apos;re done.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-sm font-medium text-gray-300">Start a conversation</h3>
          <p className="text-xs text-gray-500 max-w-xs">
            Ask Claude anything. You can highlight any part of a response to fork a
            new thread and explore it in depth — like a Wikipedia rabbit hole.
          </p>
        </>
      )}
    </div>
  )
}
