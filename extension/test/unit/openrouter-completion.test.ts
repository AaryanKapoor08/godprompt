import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenRouterCompletionAPI } from '../../src/lib/llm-client'

describe('callOpenRouterCompletionAPI', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('extracts text from a non-stream OpenRouter completion response', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Rewrite this prompt more clearly.',
          },
        },
      ],
    }), { status: 200 }))

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')

    expect(text).toBe('Rewrite this prompt more clearly.')
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.stream).toBe(false)
    expect(body.reasoning).toEqual({ enabled: false })
  })

  it('throws when the non-stream response has no usable text', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{}] }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')
    ).rejects.toThrow('OpenRouter completion returned no text output')
  })

  it('rejects OpenRouter reasoning leakage instead of passing it through as a rewrite', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: `We need to rewrite the user's prompt as a prompt for the next AI, preserving intent and constraints.

Thus rewrite the prompt as a directive to the next AI.`,
          },
        },
      ],
    }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-nano-30b-a3b:free')
    ).rejects.toThrow('OpenRouter completion returned reasoning instead of rewritten prompt')
  })

  it('rejects wrapper framing where the rewrite addresses a third-party AI assistant', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'You are an AI assistant helping with a customer escalation. An enterprise customer reports their data export is missing approximately half the rows. Your task is to create a clear, step-by-step plan to investigate and resolve this issue before replying to the customer.',
          },
        },
      ],
    }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')
    ).rejects.toThrow('OpenRouter completion returned wrapper framing instead of rewritten prompt')
  })

  it('rejects rewrites that open with a second-person task brief', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Your task is to draft a customer escalation triage plan that distinguishes known facts from guesses and orders the next checks by who owns each step.',
          },
        },
      ],
    }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-nano-30b-a3b:free')
    ).rejects.toThrow('OpenRouter completion returned wrapper framing instead of rewritten prompt')
  })

  it('rejects rewrites that contain the meta self-reference about the next AI', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Use the API logs and support tickets for a hard triage pass. Output only the plan as a rewritten prompt for the next AI to follow.',
          },
        },
      ],
    }), { status: 200 }))

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')
    ).rejects.toThrow('OpenRouter completion returned wrapper framing instead of rewritten prompt')
  })

  it('rejects near-identical echoes of the source prompt with trivial word swaps', async () => {
    const sourceText = 'we got this ugly customer escalation thing and i need a clear plan before i reply to anyone enterprise customer says their data export is missing like half the rows but support also says the customer filtered the date wrong maybe and eng pasted some db counts that kinda prove export job ran but product says the new permissions change could hide rows from viewers'
    // Output differs by only two trivial word swaps ("ugly"->"messy", "kinda"->"basically") — same structure, same length-class.
    const echoedOutput = 'we got this messy customer escalation thing and i need a clear plan before i reply to anyone enterprise customer says their data export is missing like half the rows but support also says the customer filtered the date wrong maybe and eng pasted some db counts that basically prove export job ran but product says the new permissions change could hide rows from viewers'

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: echoedOutput,
          },
        },
      ],
    }), { status: 200 }))

    const userMessage = `Rewrite this source prompt.\n"""\n${sourceText}\n"""`

    await expect(
      callOpenRouterCompletionAPI('sk-or-v1-test', 'system', userMessage, 'nvidia/nemotron-3-super-120b-a12b:free')
    ).rejects.toThrow('OpenRouter completion returned near-identical rewrite (echo of source)')
  })

  it('accepts a genuine restructuring rewrite even when many source terms are preserved', async () => {
    const sourceText = 'we got this ugly customer escalation thing and i need a clear plan before i reply to anyone enterprise customer says their data export is missing like half the rows but support also says the customer filtered the date wrong maybe and eng pasted some db counts that kinda prove export job ran but product says the new permissions change could hide rows from viewers'
    // Genuine rewrite: same factual terms preserved, but reordered, condensed, and rephrased.
    const genuineRewrite = 'Draft a triage plan for an enterprise customer escalation about a data export missing roughly half the rows. Distinguish facts from guesses across these candidates: data loss, permissions visibility change, bad customer filter, export timeout, customer confusion. Use the Zendesk thread, three Slack threads, the customer success Loom, the customer-supplied CSV, internal export job logs, and the permissions screenshot as evidence. List the next five checks in order with owners and exact queries, plus a careful customer reply and a separate internal update.'

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: genuineRewrite,
          },
        },
      ],
    }), { status: 200 }))

    const userMessage = `Rewrite this source prompt.\n"""\n${sourceText}\n"""`

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', userMessage, 'nvidia/nemotron-3-super-120b-a12b:free')

    expect(text).toBe(genuineRewrite)
  })

  it('skips the echo guard when the user message has no extractable source block', async () => {
    const sourceText = 'we got this ugly customer escalation thing and i need a clear plan before i reply to anyone enterprise customer says their data export is missing like half the rows'

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: sourceText,
          },
        },
      ],
    }), { status: 200 }))

    // No """...""" wrapping — extractRewriteSourceText returns empty, echo check is skipped.
    const userMessageWithoutDelimiters = `Rewrite this source prompt: ${sourceText}`

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', userMessageWithoutDelimiters, 'nvidia/nemotron-3-super-120b-a12b:free')

    expect(text).toBe(sourceText)
  })

  it('strips simple OpenRouter prompt labels without touching valid prompt text', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Rewritten prompt: Use the API logs and support tickets for a hard triage pass.',
          },
        },
      ],
    }), { status: 200 }))

    const text = await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')

    expect(text).toBe('Use the API logs and support tickets for a hard triage pass.')
  })

  it('includes model id, finish reason, and reasoning hint in the no-text error so chain attribution survives', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: '',
            reasoning: 'Let me think about how to rewrite this prompt step by step before producing output...',
          },
        },
      ],
    }), { status: 200 }))

    let caught: unknown = null
    try {
      await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    const message = (caught as Error).message
    expect(message).toContain('OpenRouter completion returned no text output')
    expect(message).toContain('nvidia/nemotron-3-super-120b-a12b:free')
    expect(message).toContain('finish=length')
    expect(message).toContain('hasContent=false')
    expect(message).toContain('hasReasoning=true')
  })

  it('includes refusal text in the no-text error when the model refused with no content', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: null,
            refusal: 'I cannot rewrite that prompt because it appears to violate policy.',
          },
        },
      ],
    }), { status: 200 }))

    let caught: unknown = null
    try {
      await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-nano-30b-a3b:free')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    const message = (caught as Error).message
    expect(message).toContain('OpenRouter completion returned no text output')
    expect(message).toContain('nvidia/nemotron-3-nano-30b-a3b:free')
    expect(message).toContain('refusal=I cannot rewrite that prompt')
  })

  it('surfaces top-level OpenRouter error metadata when the response is 200 with no choices', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 'provider_failure',
        message: 'Upstream provider timed out',
      },
      choices: [],
    }), { status: 200 }))

    let caught: unknown = null
    try {
      await callOpenRouterCompletionAPI('sk-or-v1-test', 'system', 'user', 'nvidia/nemotron-3-super-120b-a12b:free')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    const message = (caught as Error).message
    expect(message).toContain('OpenRouter completion returned no text output')
    expect(message).toContain('error=provider_failure: Upstream provider timed out')
    expect(message).toContain('choices=0')
  })
})
