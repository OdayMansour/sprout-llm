import { useState, useEffect, useRef, type KeyboardEvent } from 'react'

interface Props {
  selectedText: string
  anchorX: number
  anchorY: number  // bottom of the selection rect
  onFork: (question: string) => void
  onDismiss: () => void
}

export function ForkPopup({ selectedText: _selectedText, anchorX, anchorY, onFork, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [question, setQuestion] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Focus textarea when expanded
  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  // Dismiss on outside click (use touchend + mousedown for mobile + desktop)
  useEffect(() => {
    function handlePointer(e: globalThis.MouseEvent | globalThis.TouchEvent) {
      const target = 'touches' in e ? e.touches[0]?.target : (e as globalThis.MouseEvent).target
      if (popupRef.current && !popupRef.current.contains(target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
    }
  }, [onDismiss])

  // Dismiss on Escape
  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitCustom()
    }
  }

  function submitCustom() {
    const q = question.trim()
    if (!q) return
    onFork(q)
  }

  // Place the popup below the selection, clamped to viewport
  const COMPACT_H = 44
  const EXPANDED_H = 160
  const GAP = 6
  const popupH = expanded ? EXPANDED_H : COMPACT_H
  const popupWidth = expanded ? Math.min(280, window.innerWidth - 24) : 'auto'

  const rawLeft = typeof popupWidth === 'number'
    ? Math.max(12, Math.min(anchorX - popupWidth / 2, window.innerWidth - popupWidth - 12))
    : Math.max(12, anchorX - 110) // rough center for auto-width

  const top = anchorY + GAP + popupH > window.innerHeight - 12
    ? anchorY - popupH - GAP   // flip above if not enough room below
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
        // Expanded: textarea + fork button
        <div className="bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* Compact row stays visible at top */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-700">
            <ForkIcon />
            <button
              onClick={() => onFork('Explain this')}
              className="flex-1 text-left px-2 py-1 text-xs text-amber-700 font-medium hover:text-amber-600 transition-colors"
            >
              Explain this
            </button>
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
              onKeyDown={handleKeyDown}
              placeholder="Ask something specific… (Enter to fork)"
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            />
            <button
              onClick={submitCustom}
              disabled={!question.trim()}
              className="self-end px-4 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Fork →
            </button>
          </div>
        </div>
      ) : (
        // Compact pill: Explain this | ··· | ×
        <div className="inline-flex items-center bg-gray-800 border border-gray-600 rounded-full shadow-xl overflow-hidden">
          <button
            onClick={() => onFork('Explain this')}
            className="flex items-center gap-1.5 pl-3 pr-2.5 py-2.5 text-xs font-medium text-amber-700 hover:bg-gray-700 transition-colors"
          >
            <ForkIcon />
            Explain this
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

function ForkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="#b45309">
      <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
    </svg>
  )
}
