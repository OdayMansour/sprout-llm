import { useState } from 'react'

interface Props {
  onApiKey: (key: string) => void
}

export function ApiKeyInput({ onApiKey }: Props) {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (key.trim()) onApiKey(key.trim())
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-400/30 mb-4">
            <svg width="28" height="28" viewBox="0 0 16 16" fill="#60a5fa">
              <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Sprout</h1>
          <p className="text-sm text-gray-400 mt-2">
            Chat with Claude, fork conversations from any passage,
            <br />
            and navigate them like Wikipedia pages.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Anthropic API Key
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {show ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-3.864 0-6.15-2.925-6.847-4.404A1.367 1.367 0 0 1 1 9c0-.476.128-.917.339-1.355.04-.083.084-.17.132-.256L.31 6.457A.75.75 0 0 1 .143 2.31Zm3.093 6.05A5.386 5.386 0 0 0 2.5 9a5.386 5.386 0 0 0 .736 1.64l1.07.776A3.496 3.496 0 0 1 8 12.5a3.496 3.496 0 0 1 2.694-1.084l1.07.776A5.386 5.386 0 0 0 13.5 9a5.386 5.386 0 0 0-.736-1.64l-1.07-.776A3.496 3.496 0 0 1 8 5.5a3.496 3.496 0 0 1-2.694 1.084l-1.07-.776Z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!key.trim()}
              className="w-full py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Start chatting
            </button>
          </form>

          <p className="mt-4 text-[11px] text-gray-500 text-center">
            Your API key is stored in localStorage and never sent to our servers.
            <br />
            Get a key at{' '}
            <span className="text-gray-400">console.anthropic.com</span>
          </p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: '✦', label: 'Highlight to fork', desc: 'Select any text in a response' },
            { icon: '⎇', label: 'Navigate threads', desc: 'Breadcrumbs + sidebar tree' },
            { icon: '↩', label: 'Return anytime', desc: 'Forks keep full context' },
          ].map((f) => (
            <div key={f.label} className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 text-center">
              <div className="text-lg mb-1">{f.icon}</div>
              <div className="text-xs font-medium text-gray-300">{f.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
