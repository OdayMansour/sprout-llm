import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '../types'

export const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
} as const

export type ModelKey = keyof typeof MODELS

function getClient(apiKey: string) {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (usage?: { inputTokens: number; outputTokens: number }) => void
  onError: (err: Error) => void
}

export async function generateTitle(apiKey: string, question: string, model: string): Promise<string> {
  const client = getClient(apiKey)
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 15,
      messages: [
        {
          role: 'user',
          content: `Give a 3-5 word topic label for this question. Reply with only the label, no punctuation:\n\n${question}`,
        },
      ],
    })
    const block = response.content[0]
    if (block.type === 'text') return block.text.trim()
  } catch {
    // silently fall back — title is cosmetic, never crash for it
  }
  return ''
}

export async function streamChat(
  apiKey: string,
  messages: Message[],
  callbacks: StreamCallbacks,
  forkContext?: string,
  abortSignal?: AbortSignal,
  model: string = MODELS.haiku,
) {
  const client = getClient(apiKey)

  // Convert our messages to Anthropic format, skipping streaming placeholders
  const apiMessages = messages
    .filter((m) => !m.streaming && m.content.trim())
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  if (apiMessages.length === 0) {
    callbacks.onError(new Error('No messages to send'))
    return
  }

  const baseSystem =
    `You are an educational assistant. Your primary goal is to teach and build understanding — not to agree, validate, or debate.

Calibrate complexity to the conversation's depth:
- First response on a topic: start from first principles, avoid jargon, use plain analogies.
- As the conversation grows (more exchanges, follow-up questions): gradually introduce more technical detail, precise terminology, and nuance.
- If the user demonstrates prior knowledge in their phrasing, match their level — don't over-explain what they already know.

Style:
- Explain the "why", not just the "what".
- Use concrete examples and analogies before abstract definitions.
- When a question has a genuinely complex or contested answer, say so and explain the competing views rather than picking a side.
- Keep responses focused. Don't pad with summaries or unnecessary caveats.`

  const system = forkContext
    ? `${baseSystem}\n\nThis conversation was forked. The user selected a specific passage from a previous response and is asking a question about that passage.\n\n<highlighted_passage>\n${forkContext}\n</highlighted_passage>\n\nIMPORTANT: The user's question is specifically about the highlighted passage above — not about the broader conversation topic. Focus your answer on explaining or expanding on the highlighted passage itself. Do not simply continue the previous conversation topic.`
    : baseSystem

  try {
    const stream = client.messages.stream(
      { model, max_tokens: 4096, messages: apiMessages, system },
      { signal: abortSignal },
    )

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        callbacks.onChunk(event.delta.text)
      }
    }

    const final = await stream.finalMessage()
    callbacks.onDone({
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    })
  } catch (err) {
    // Treat user-initiated aborts as a clean stop, not an error
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onDone()
      return
    }
    callbacks.onError(err instanceof Error ? err : new Error(String(err)))
  }
}
