import { v4 as uuid } from 'uuid'
import type { ForkSuggestion } from '../types'

const OPEN = '<fork-suggest>'
const CLOSE = '</fork-suggest>'

/**
 * Parse <fork-suggest>…</fork-suggest> tags from LLM-streamed content.
 * Returns the clean content (tags stripped, inner text preserved) and an array
 * of ForkSuggestion objects with character offsets into the clean content.
 */
export function parseSuggestions(raw: string): {
  content: string
  suggestions: ForkSuggestion[]
} {
  const suggestions: ForkSuggestion[] = []
  let charsRemoved = 0

  const content = raw.replace(
    /<fork-suggest>([\s\S]*?)<\/fork-suggest>/g,
    (_fullMatch, innerText, rawIndex) => {
      const cleanIndex = rawIndex - charsRemoved
      const trimmed = innerText.trim()
      // Skip empty, very short, very long, or code-containing suggestions
      if (trimmed.length >= 5 && trimmed.length <= 300 && !trimmed.includes('`')) {
        // Account for leading whitespace: cleanIndex points to the start of innerText,
        // but trimmed starts after any leading spaces.
        const leadingSpace = innerText.length - innerText.trimStart().length
        suggestions.push({
          id: uuid(),
          selectedText: trimmed,
          startOffset: cleanIndex + leadingSpace,
          endOffset: cleanIndex + leadingSpace + trimmed.length,
        })
      }
      charsRemoved += OPEN.length + CLOSE.length
      return innerText // keep the text, remove only the tags
    },
  )

  return { content, suggestions }
}
