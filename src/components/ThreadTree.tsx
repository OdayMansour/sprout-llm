import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useConversation } from '../context/ConversationContext'
import type { Session, Thread } from '../types'

// ── Token & cost helpers ────────────────────────────────────────────────────

// USD per million tokens — update when Anthropic changes pricing
const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'claude-haiku-4-5':  { inputPerM: 1.00, outputPerM: 5.00  },
  'claude-sonnet-4-6': { inputPerM: 3.00, outputPerM: 15.00 },
  'claude-opus-4-6':   { inputPerM: 5.00, outputPerM: 25.00 },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = MODEL_PRICING[model]
  if (!p) return null
  return (inputTokens / 1_000_000) * p.inputPerM + (outputTokens / 1_000_000) * p.outputPerM
}

function fmtCost(usd: number): string {
  if (usd < 0.001) return '< $0.001'
  if (usd < 0.01)  return `$${usd.toFixed(3)}`
  if (usd < 10)    return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(1)}`
}

function fmtK(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k'
}

function shortModelName(model: string): string {
  // "claude-haiku-4-5" → "haiku", "claude-sonnet-4-6" → "sonnet"
  return model.replace(/^claude-/, '').split('-')[0]
}

/** Messages in `thread` whose IDs don't appear in the parent thread — i.e. native to this thread. */
function nativeMessages(thread: Thread, allThreads: Record<string, Thread>) {
  if (!thread.parentThreadId) return thread.messages
  const parent = allThreads[thread.parentThreadId]
  if (!parent) return thread.messages
  const parentIds = new Set(parent.messages.map((m) => m.id))
  return thread.messages.filter((m) => !parentIds.has(m.id))
}

/** Per-model token totals for all native exchanges in a session. */
function sessionTokensByModel(
  session: Session,
  allThreads: Record<string, Thread>,
): Record<string, { input: number; output: number }> {
  const byModel: Record<string, { input: number; output: number }> = {}
  for (const thread of Object.values(allThreads)) {
    if (thread.sessionId !== session.id) continue
    for (const msg of nativeMessages(thread, allThreads)) {
      if (!msg.tokenUsage) continue
      const key = msg.tokenUsage.model
      if (!byModel[key]) byModel[key] = { input: 0, output: 0 }
      byModel[key].input += msg.tokenUsage.inputTokens
      byModel[key].output += msg.tokenUsage.outputTokens
    }
  }
  return byModel
}

function TrashIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
    </svg>
  )
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  function show() {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    // Place tooltip to the right of the sidebar item, vertically centred
    setPos({ x: rect.right + 8, y: rect.top + rect.height / 2 })
  }

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)} className="truncate flex-1 min-w-0">
      {children}
      {pos && createPortal(
        <div
          className="px-2 py-1 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs shadow-xl pointer-events-none whitespace-nowrap"
          style={{ position: 'fixed', top: pos.y, left: pos.x, transform: 'translateY(-50%)', zIndex: 9999 }}
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  )
}

interface TreeNodeProps {
  thread: Thread
  depth: number
  allThreads: Record<string, Thread>
}

function TreeNode({ thread, depth, allThreads }: TreeNodeProps) {
  const { state, setActiveThread, deleteThread } = useConversation()
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  const isActive = state.activeThreadId === thread.id
  const isForked = depth > 0

  const children = Object.values(allThreads).filter(
    (t) => t.parentThreadId === thread.id,
  )

  const fullLabel =
    thread.parentThreadId === null
      ? (thread.title ?? 'Main thread')
      : thread.forkContext ?? 'Fork'

  const label =
    thread.parentThreadId === null
      ? fullLabel
      : thread.forkContext
      ? thread.forkContext.length > 28
        ? thread.forkContext.slice(0, 28) + '…'
        : thread.forkContext
      : 'Fork'

  const msgCount = thread.messages.filter((m) => m.role === 'user').length

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      deleteThread(thread.id)
    } else {
      setConfirming(true)
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={() => setActiveThread(thread.id)}
          className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
            isActive
              ? 'bg-gray-700 text-gray-100'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {depth > 0 && (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-amber-500">
              <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
            </svg>
          )}
          {depth === 0 && (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-blue-400">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z" />
            </svg>
          )}
          <Tooltip text={fullLabel}><span className="text-xs">{label}</span></Tooltip>
          {msgCount > 0 && (
            <span className="text-[10px] text-gray-500 flex-shrink-0">{msgCount}</span>
          )}
        </button>

        {isForked && (
          <button
            onClick={handleDeleteClick}
            title={confirming ? 'Click again to confirm' : 'Delete thread'}
            className={`flex-shrink-0 p-1 mr-1 rounded transition-all ${
              confirming
                ? 'text-red-400 opacity-100'
                : 'opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400'
            }`}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {children.length > 0 && (
        <div className="relative">
          <div
            className="absolute left-0 top-0 bottom-0 w-px bg-gray-700"
            style={{ left: `${8 + depth * 16 + 5}px` }}
          />
          {children.map((child) => (
            <TreeNode
              key={child.id}
              thread={child}
              depth={depth + 1}
              allThreads={allThreads}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function formatSessionLabel(createdAt: number): string {
  const date = new Date(createdAt)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (isToday) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`
}

interface SessionGroupProps {
  session: Session
  allThreads: Record<string, Thread>
  activeSessionId: string
  isLast: boolean
}

function SessionGroup({ session, allThreads, activeSessionId, isLast }: SessionGroupProps) {
  const { deleteSession } = useConversation()
  const isActive = session.id === activeSessionId
  const [expanded, setExpanded] = useState(isActive)
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  // Auto-expand when this session becomes active
  useEffect(() => {
    if (isActive) setExpanded(true)
  }, [isActive])

  const rootThread = allThreads[session.rootThreadId]
  if (!rootThread) return null

  const sessionThreads = Object.values(allThreads).filter(
    (t) => t.sessionId === session.id,
  )
  const msgCount = sessionThreads.reduce(
    (sum, t) => sum + t.messages.filter((m) => m.role === 'user').length,
    0,
  )

  const sessionLabel = rootThread.title ?? formatSessionLabel(session.createdAt)
  const tokensByModel = sessionTokensByModel(session, allThreads)
  const tokenEntries = Object.entries(tokensByModel)

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      deleteSession(session.id)
    } else {
      setConfirming(true)
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <div className={!isLast ? 'mb-1' : ''}>
      <div className="group flex items-start">
        <button
          onClick={() => setExpanded((e) => !e)}
          className={`flex-1 min-w-0 flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
            isActive
              ? 'text-gray-200'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            className={`flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Tooltip text={sessionLabel}><span className="text-[11px] font-medium">{sessionLabel}</span></Tooltip>
              {msgCount > 0 && (
                <span className="text-[10px] text-gray-600 flex-shrink-0">{msgCount}q</span>
              )}
            </div>
            {tokenEntries.length > 0 && (() => {
              let totalCost: number | null = 0
              for (const [model, { input, output }] of tokenEntries) {
                const c = calcCost(model, input, output)
                if (c === null) { totalCost = null; break }
                totalCost += c
              }
              return (
                <div className="flex flex-wrap gap-x-2 mt-0.5">
                  {tokenEntries.map(([model, { input, output }]) => (
                    <span key={model} className="text-[10px] text-gray-600 whitespace-nowrap">
                      {shortModelName(model)}{' '}
                      <span className="text-gray-500">{fmtK(input)}↑</span>{' '}
                      <span className="text-gray-500">{fmtK(output)}↓</span>
                    </span>
                  ))}
                  {totalCost !== null && (
                    <span className="text-[10px] text-gray-600 whitespace-nowrap">· {fmtCost(totalCost)}</span>
                  )}
                </div>
              )
            })()}
          </div>
        </button>

        <button
          onClick={handleDeleteClick}
          title={confirming ? 'Click again to confirm' : 'Delete session'}
          className={`flex-shrink-0 p-1.5 mt-0.5 mr-1 rounded transition-all ${
            confirming
              ? 'text-red-400 opacity-100'
              : 'opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400'
          }`}
        >
          <TrashIcon size={13} />
        </button>
      </div>

      {expanded && (
        <div className="mt-0.5">
          <TreeNode
            thread={rootThread}
            depth={0}
            allThreads={allThreads}
          />
        </div>
      )}
    </div>
  )
}

export function ThreadTree() {
  const { state, newSession } = useConversation()
  const sessionCount = state.sessions.length

  // Sessions newest-first
  const sortedSessions = [...state.sessions].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700/50">
      <div className="px-3 py-3 border-b border-gray-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Sessions
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={newSession}
          title="New conversation"
          className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-800"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.75 1h10.5c.966 0 1.75.784 1.75 1.75v3a1.75 1.75 0 0 1-1.75 1.75H2.75A1.75 1.75 0 0 1 1 5.75v-3C1 1.784 1.784 1 2.75 1ZM2.5 2.75v3c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-3a.25.25 0 0 0-.25-.25H2.75a.25.25 0 0 0-.25.25Zm0 6.5a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4.25-.75a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm-4.25 3.5a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4.25-.75a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sortedSessions.map((session, idx) => (
          <SessionGroup
            key={session.id}
            session={session}
            allThreads={state.threads}
            activeSessionId={state.activeSessionId}
            isLast={idx === sortedSessions.length - 1}
          />
        ))}
      </div>
    </div>
  )
}
