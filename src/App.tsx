import { useState } from 'react'
import { ConversationProvider } from './context/ConversationContext'
import { ChatContainer } from './components/ChatContainer'
import { ThreadTree } from './components/ThreadTree'
import { ApiKeyInput } from './components/ApiKeyInput'
import { MODELS, type ModelKey } from './utils/api'

function AppContent() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('anthropic-api-key') ?? ''
  })
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [modelKey, setModelKey] = useState<ModelKey>(() => {
    return (localStorage.getItem('model-key') as ModelKey) ?? 'haiku'
  })

  function handleModelChange(key: ModelKey) {
    localStorage.setItem('model-key', key)
    setModelKey(key)
  }

  function handleApiKey(key: string) {
    localStorage.setItem('anthropic-api-key', key)
    setApiKey(key)
  }

  if (!apiKey) {
    return <ApiKeyInput onApiKey={handleApiKey} />
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, inline panel on desktop */}
      <div
        className={[
          'fixed md:relative inset-y-0 left-0',
          'flex-shrink-0 overflow-hidden',
          'transition-all duration-200',
          'z-40 md:z-auto',
          sidebarOpen
            ? 'translate-x-0 w-72 md:w-90'
            : '-translate-x-full md:translate-x-0 w-72 md:w-0',
        ].join(' ')}
      >
        <ThreadTree />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 bg-gray-900/50 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            title="Toggle sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-300">Sprout</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-md border border-gray-700 overflow-hidden text-[11px]">
              {(['haiku', 'sonnet'] as ModelKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => handleModelChange(key)}
                  className={`px-2.5 py-1 transition-colors font-medium ${
                    modelKey === key
                      ? 'bg-amber-600 text-white'
                      : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/60'
                  }`}
                >
                  {key === 'haiku' ? 'Haiku' : 'Sonnet'}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('anthropic-api-key')
                setApiKey('')
              }}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              title="Change API key"
            >
              key
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ChatContainer apiKey={apiKey} model={MODELS[modelKey]} />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ConversationProvider>
      <AppContent />
    </ConversationProvider>
  )
}
