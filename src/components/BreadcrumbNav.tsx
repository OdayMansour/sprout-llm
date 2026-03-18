import { useConversation } from '../context/ConversationContext'
import type { Thread } from '../types'

export function BreadcrumbNav() {
  const { state, getThreadPath, setActiveThread, activeThread } = useConversation()

  const path = getThreadPath(state.activeThreadId)
  const isForked = activeThread.parentThreadId !== null

  function getThreadLabel(thread: Thread, index: number): string {
    if (thread.parentThreadId === null) return 'Main thread'
    // Prefer the highlighted passage — more meaningful than the question
    const label = thread.forkContext || thread.forkQuestion
    if (label) return label.length > 30 ? label.slice(0, 30) + '…' : label
    return `Fork ${index}`
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/50 bg-gray-900/80 backdrop-blur-sm min-h-[44px] flex-shrink-0">
      {/* Back button — visible only in forked threads */}
      {isForked && (
        <button
          onClick={() => setActiveThread(activeThread.parentThreadId!)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors flex-shrink-0 mr-1"
          title="Go back to parent thread"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.78 3.22a.75.75 0 0 1 0 1.06L6.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" />
          </svg>
          <span className="text-xs font-medium">Back</span>
        </button>
      )}

      {/* Breadcrumb trail */}
      <div className="flex items-center gap-1 overflow-x-auto min-w-0">
        {path.map((thread, i) => (
          <div key={thread.id} className="flex items-center gap-1 flex-shrink-0">
            {i > 0 && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="#6b7280" className="flex-shrink-0">
                <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
              </svg>
            )}
            <button
              onClick={() => setActiveThread(thread.id)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
                thread.id === state.activeThreadId
                  ? 'bg-gray-700 text-gray-100 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {getThreadLabel(thread, i)}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
