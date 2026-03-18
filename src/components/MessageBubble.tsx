import { useRef, useEffect, type MouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Message, ForkMark } from '../types'
import { useConversation } from '../context/ConversationContext'

interface Props {
  message: Message
  /** Highlighted passage that triggered this fork — shown as a quote in the first user message */
  forkContext?: string
  /** Character offsets of the currently-pending fork selection — rendered as an amber highlight */
  pendingSelection?: { startOffset: number; endOffset: number }
  onTextSelect?: (
    selectedText: string,
    startOffset: number,
    endOffset: number,
    anchorX: number,
    anchorY: number,
    messageId: string,
  ) => void
}

/**
 * Inject custom HTML tags into the raw markdown text at stored character offsets.
 * Handles fork marks and the pending selection highlight in one reverse-offset pass
 * so earlier insertions never shift later ones.
 */
function injectHighlights(
  content: string,
  forks: ForkMark[],
  pendingSelection?: { startOffset: number; endOffset: number },
): string {
  type Marker = { start: number; end: number; open: string; close: string }

  const markers: Marker[] = forks.map((f) => ({
    start: f.startOffset,
    end: f.endOffset,
    open: `<fork-mark data-thread-id="${f.threadId}" data-fork-id="${f.id}">`,
    close: `</fork-mark>`,
  }))

  if (pendingSelection) {
    markers.push({
      start: pendingSelection.startOffset,
      end: pendingSelection.endOffset,
      open: `<pending-sel>`,
      close: `</pending-sel>`,
    })
  }

  if (markers.length === 0) return content

  markers.sort((a, b) => b.start - a.start)

  let result = content
  for (const m of markers) {
    const start = Math.max(0, Math.min(m.start, result.length))
    const end = Math.max(start, Math.min(m.end, result.length))
    if (start === end) continue
    result = result.slice(0, end) + m.close + result.slice(end)
    result = result.slice(0, start) + m.open + result.slice(start)
  }

  return result
}

/**
 * After markdown renders to DOM, walk text nodes to compute the rendered-text
 * character offset. Then find the selectedText in the raw content, using the
 * rendered fraction as a hint to disambiguate when text appears multiple times.
 *
 * Falls back to searching a markdown-stripped version of rawContent when the
 * selection spans formatting spans (e.g. bold + normal text), since
 * selection.toString() returns plain text while rawContent contains markers
 * like ** and _.
 */
function findRawOffset(
  container: HTMLElement,
  range: Range,
  rawContent: string,
  selectedText: string,
): [number, number] | null {
  // Walk DOM text nodes to get domStart, domEnd, and total rendered length
  let domStart = 0
  let domEnd = 0
  let domTotal = 0
  let startFound = false
  let endFound = false

  function walk(node: Node, offset: number): number {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0
      if (!startFound && node === range.startContainer) {
        domStart = offset + range.startOffset
        startFound = true
      }
      if (!endFound && node === range.endContainer) {
        domEnd = offset + range.endOffset
        endFound = true
      }
      return offset + len
    }
    let cur = offset
    for (const child of Array.from(node.childNodes)) {
      cur = walk(child, cur)
    }
    return cur
  }
  domTotal = walk(container, 0)
  if (!endFound) domEnd = domTotal

  const fraction = domTotal > 0 ? domStart / domTotal : 0

  // Fast path: selectedText appears verbatim in raw content
  {
    let bestStart = -1
    let bestEnd = -1
    let bestDist = Infinity
    let searchFrom = 0
    while (true) {
      const idx = rawContent.indexOf(selectedText, searchFrom)
      if (idx === -1) break
      const rawFraction = rawContent.length > 0 ? idx / rawContent.length : 0
      const dist = Math.abs(rawFraction - fraction)
      if (dist < bestDist) {
        bestDist = dist
        bestStart = idx
        bestEnd = idx + selectedText.length
      }
      searchFrom = idx + 1
    }
    if (bestStart !== -1) return [bestStart, bestEnd]
  }

  // Fallback: selection spans markdown formatting (e.g. "normal and **bold**").
  // Strip inline markers from rawContent, search there, then map back.
  const { stripped, toRaw } = buildStrippedContent(rawContent)

  let bestIdx = -1
  let bestDist = Infinity
  let searchFrom = 0
  while (true) {
    const idx = stripped.indexOf(selectedText, searchFrom)
    if (idx === -1) break
    const strippedFraction = stripped.length > 0 ? idx / stripped.length : 0
    const dist = Math.abs(strippedFraction - fraction)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = idx
    }
    searchFrom = idx + 1
  }

  if (bestIdx === -1) {
    // Last resort: use domStart/domEnd fractions as raw offsets
    const rawStart = Math.round(fraction * rawContent.length)
    const endFraction = domTotal > 0 ? domEnd / domTotal : 1
    const rawEnd = Math.round(endFraction * rawContent.length)
    return [Math.max(0, rawStart), Math.min(rawContent.length, rawEnd)]
  }

  const rawStart = toRaw[bestIdx]
  const rawEnd = toRaw[Math.min(bestIdx + selectedText.length - 1, toRaw.length - 1)] + 1
  return snapToMarkdownBoundaries(rawContent, rawStart, rawEnd)
}

/**
 * Build a version of raw markdown with inline markers (* _ `) removed,
 * plus an index array mapping each stripped character back to its raw position.
 */
function buildStrippedContent(raw: string): { stripped: string; toRaw: number[] } {
  const toRaw: number[] = []
  let stripped = ''
  let i = 0
  while (i < raw.length) {
    if (raw.startsWith('**', i) || raw.startsWith('__', i)) {
      i += 2
      continue
    }
    if (raw[i] === '*' || raw[i] === '_' || raw[i] === '`') {
      i++
      continue
    }
    toRaw.push(i)
    stripped += raw[i]
    i++
  }
  return { stripped, toRaw }
}

/**
 * Extend [start, end) outward to avoid splitting paired markdown markers
 * like ** or _ that wrap the boundary characters.
 */
function snapToMarkdownBoundaries(raw: string, start: number, end: number): [number, number] {
  let s = start
  while (s > 0) {
    if (s >= 2 && (raw.startsWith('**', s - 2) || raw.startsWith('__', s - 2))) {
      s -= 2
    } else if (raw[s - 1] === '*' || raw[s - 1] === '_' || raw[s - 1] === '`') {
      s -= 1
    } else break
  }
  let e = end
  while (e < raw.length) {
    if (raw.startsWith('**', e) || raw.startsWith('__', e)) {
      e += 2
    } else if (raw[e] === '*' || raw[e] === '_' || raw[e] === '`') {
      e += 1
    } else break
  }
  return [s, e]
}

export function MessageBubble({ message, forkContext, pendingSelection, onTextSelect }: Props) {
  const { setActiveThread, state } = useConversation()
  const containerRef = useRef<HTMLDivElement>(null)
  const lastMouseUpRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Always-current ref so the debounced handler doesn't capture a stale closure
  const processRef = useRef<() => void>(() => {})

  const isUser = message.role === 'user'

  function processSelection() {
    if (isUser || !onTextSelect) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return

    const selectedText = selection.toString().trim()
    const range = selection.getRangeAt(0)
    const container = containerRef.current
    if (!container) return

    // Only respond to selections within this bubble
    if (!container.contains(range.commonAncestorContainer)) return

    const result = findRawOffset(container, range, message.content, selectedText)
    if (!result) return

    const [startOffset, endOffset] = result
    const rect = range.getBoundingClientRect()
    onTextSelect(
      selectedText,
      startOffset,
      endOffset,
      rect.left + rect.width / 2,
      rect.bottom,   // pass bottom so popup appears below the selection
      message.id,
    )
  }

  // Keep the ref current on every render
  useEffect(() => {
    processRef.current = processSelection
  })

  // Mobile: selectionchange fires as the user adjusts touch selection handles.
  // Debounce so the popup appears after the user stops moving the handles.
  // Skip if a mouseup just fired to avoid double-triggering on desktop.
  useEffect(() => {
    function handleSelectionChange() {
      if (Date.now() - lastMouseUpRef.current < 200) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => processRef.current(), 800)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleMouseUp(_e: MouseEvent) {
    lastMouseUpRef.current = Date.now()
    processSelection()
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-stone-800 text-stone-100 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[75%] text-base leading-relaxed">
          {forkContext && (
            <div className="mb-2 pl-3 border-l-2 border-stone-500/60 text-stone-400 text-xs italic line-clamp-3">
              {forkContext.length > 200 ? forkContext.slice(0, 200) + '…' : forkContext}
            </div>
          )}
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    )
  }

  const processedContent = injectHighlights(message.content, message.forks, pendingSelection)

  return (
    <div className="flex justify-start mb-5">
      <div className="w-full">
        <div
          ref={containerRef}
          onMouseUp={handleMouseUp}
          className="text-base leading-relaxed text-gray-100 font-serif select-text cursor-text selection:bg-amber-400/40 selection:text-gray-900"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={markdownComponents(setActiveThread, state.threads)}
          >
            {processedContent}
          </ReactMarkdown>
          {message.streaming && (
            <span className="inline-block w-1.5 h-[1em] ml-0.5 bg-gray-400 animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markdownComponents(
  setActiveThread: (id: string) => void,
  threads: Record<string, import('../types').Thread>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: Record<string, any> = {
    // Pending selection highlight (shown while fork popup is open)
    'pending-sel': ({ children }: any) => (
      <mark className="bg-amber-400/50 text-stone-900 rounded-sm">{children}</mark>
    ),

    // Custom fork-mark element injected before parsing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'fork-mark': ({ children, 'data-thread-id': threadId, 'data-fork-id': _forkId }: any) => {
      const forkedThread = threadId ? threads[threadId] : undefined
      const msgCount = forkedThread?.messages.filter((m) => m.role === 'user').length ?? 0
      return (
        <span className="group relative inline">
          <mark
            className="bg-amber-300/40 text-amber-900 px-0.5 rounded cursor-pointer border-b-2 border-amber-600/60 hover:bg-amber-300/60 transition-colors"
            onClick={() => threadId && setActiveThread(threadId)}
          >
            {children}
          </mark>
          <button
            onClick={() => threadId && setActiveThread(threadId)}
            className="inline-flex items-center gap-1 ml-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-700 border border-amber-600/40 hover:bg-amber-500/30 transition-colors align-middle"
          >
            <ForkIcon />
            {msgCount > 0 && <span>{msgCount}</span>}
          </button>
        </span>
      )
    },

    // Block elements
    p: ({ children }: any) => (
      <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
    ),
    h1: ({ children }: any) => (
      <h1 className="text-xl font-bold text-gray-50 mt-5 mb-2 first:mt-0">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-lg font-semibold text-gray-100 mt-4 mb-2 first:mt-0">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-base font-semibold text-gray-100 mt-3 mb-1.5 first:mt-0">{children}</h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="text-sm font-semibold text-gray-100 mt-3 mb-1 first:mt-0">{children}</h4>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc list-outside pl-5 mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside pl-5 mb-3 space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="leading-relaxed">{children}</li>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-gray-500 pl-4 my-3 text-gray-400 italic">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-gray-700 my-4" />,

    // Inline code
    code: ({ inline, className, children }: any) => {
      if (inline) {
        return (
          <code className="bg-gray-900 text-gray-200 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
            {children}
          </code>
        )
      }
      // Extract language from className like "language-python"
      const lang = className?.replace('language-', '') ?? ''
      return (
        <div className="relative my-3">
          {lang && (
            <div className="flex items-center justify-between px-3 py-1 bg-gray-700 rounded-t-lg border border-gray-600 border-b-0">
              <span className="text-[11px] text-gray-400 font-mono">{lang}</span>
            </div>
          )}
          <pre
            className={`bg-gray-800/80 border border-gray-600 p-3 overflow-x-auto text-xs font-mono text-gray-200 leading-relaxed ${lang ? 'rounded-b-lg rounded-tr-lg' : 'rounded-lg'}`}
          >
            <code>{children}</code>
          </pre>
        </div>
      )
    },
    pre: ({ children }: any) => <>{children}</>,

    // Links
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-700 hover:text-blue-900 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),

    // Tables (from remark-gfm)
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-gray-600 rounded-lg overflow-hidden text-xs">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-700/50">{children}</thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-gray-700">{children}</tbody>
    ),
    tr: ({ children }: any) => <tr>{children}</tr>,
    th: ({ children }: any) => (
      <th className="px-3 py-2 text-left font-medium text-gray-300 border-b border-gray-600">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-3 py-2 text-gray-300">{children}</td>
    ),

    // Strong / em
    strong: ({ children }: any) => (
      <strong className="font-semibold text-gray-50">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-gray-200">{children}</em>
    ),
  }

  return components
}

function ForkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
    </svg>
  )
}
