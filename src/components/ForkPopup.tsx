import { useState, useEffect, useRef, type KeyboardEvent } from 'react'

interface Props {
  selectedText: string
  anchorX: number
  anchorY: number
  onAskHere: (question: string) => void
  onFork: (question: string) => void
  onDismiss: () => void
}

export function ForkPopup({ anchorX, anchorY, onAskHere, onFork, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [question, setQuestion] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  useEffect(() => {
    function handlePointer(e: globalThis.MouseEvent | globalThis.TouchEvent) {
      const target = 'touches' in e ? e.touches[0]?.target : (e as globalThis.MouseEvent).target
      if (popupRef.current && !popupRef.current.contains(target as Node)) onDismiss()
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
    }
  }, [onDismiss])

  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  const DEFAULT_QUESTION = 'Explain this'
  const COMPACT_H = 44
  const EXPANDED_H = 168
  const GAP = 6
  const popupH = expanded ? EXPANDED_H : COMPACT_H
  const popupWidth = expanded ? Math.min(300, window.innerWidth - 24) : 'auto'

  const rawLeft =
    typeof popupWidth === 'number'
      ? Math.max(12, Math.min(anchorX - popupWidth / 2, window.innerWidth - popupWidth - 12))
      : Math.max(12, anchorX - 130)

  const top =
    anchorY + GAP + popupH > window.innerHeight - 12
      ? anchorY - popupH - GAP
      : anchorY + GAP

  const style: React.CSSProperties = {
    position: 'fixed',
    left: rawLeft,
    top: Math.max(12, top),
    width: popupWidth,
    zIndex: 1000,
  }

  return (
    <div ref={popupRef} style={style}>
      {expanded ? (
        <div className="bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-gray-700">
            <span className="text-xs text-gray-400 font-medium flex-1">Selected text</span>
            <button
              onClick={() => { setExpanded(false); setQuestion('') }}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Collapse"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
          <div className="p-2 flex flex-col gap-2">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onAskHere(question.trim() || DEFAULT_QUESTION)
                }
              }}
              placeholder="Ask something… (Enter = ask here)"
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onAskHere(question.trim() || DEFAULT_QUESTION)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-700 border border-gray-600 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <SparkleIcon />
                Ask here
              </button>
              <button
                onClick={() => onFork(question.trim() || DEFAULT_QUESTION)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-700 border border-gray-600 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <ForkIcon />
                New thread
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="inline-flex items-center bg-gray-800 border border-gray-600 rounded-full shadow-xl overflow-hidden">
          <button
            onClick={() => onAskHere(DEFAULT_QUESTION)}
            className="flex items-center gap-1.5 pl-3 pr-2.5 py-2.5 text-xs font-medium text-gray-300 hover:text-gray-100 hover:bg-gray-700 transition-colors"
          >
            <SparkleIcon />
            Ask here
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={() => onFork(DEFAULT_QUESTION)}
            className="flex items-center gap-1.5 px-2.5 py-2.5 text-xs text-gray-300 hover:text-gray-100 hover:bg-gray-700 transition-colors"
            title="Explore in a new thread"
          >
            <ForkIcon />
            New thread ↗
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={() => setExpanded(true)}
            className="px-3 py-2.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors font-mono tracking-widest"
            title="Ask something specific"
          >
            ···
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={onDismiss}
            className="px-2.5 py-2.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="#2dd4bf">
      <path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828l.645-1.937zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.734 1.734 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.734 1.734 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.734 1.734 0 0 0 3.407 2.31l.387-1.162zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L10.863.1z" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="#f59e0b">
      <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
    </svg>
  )
}
