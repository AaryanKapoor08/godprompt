import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildUserMessage, callGoogleAPI, listGoogleModels } from '../../src/lib/llm-client'
import { buildContextUserMessage } from '../../src/lib/gemma-legacy/text-branch'

describe('Google API client helpers', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('filters and normalizes listed models for generation', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['streamGenerateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    }), { status: 200 }))

    const models = await listGoogleModels('AIzaTestKey')

    expect(models).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
  })

  it('maps legacy gemma-4 ids to gemma-3-27b-it', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Rewritten prompt' }] } }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemma-4')

    expect(text).toBe('Rewritten prompt')
    const calledUrl = String(mockFetch.mock.calls[0][0])
    expect(calledUrl).toContain('/models/gemma-3-27b-it:generateContent')
  })

  it('surfaces a 404 model error for provider-policy escalation', async () => {
    mockFetch.mockResolvedValueOnce(new Response('model not found', { status: 404 }))

    await expect(
      callGoogleAPI('AIzaTestKey', 'system', 'user', 'unknown-model')
    ).rejects.toThrow('Google API returned 404')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const firstUrl = String(mockFetch.mock.calls[0][0])
    expect(firstUrl).toContain('/models/unknown-model:generateContent')
  })

  it('surfaces blocked responses when no text is returned', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      promptFeedback: { blockReason: 'SAFETY' },
      candidates: [{ finishReason: 'SAFETY' }],
    }), { status: 200 }))

    await expect(
      callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')
    ).rejects.toThrow('Google API returned no text output (blocked (SAFETY))')
  })

  it('retries when output is truncated to one word', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Provide' }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Give me a 4-phase Java learning roadmap with projects.' }] } }],
      }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')

    expect(text).toBe('Give me a 4-phase Java learning roadmap with projects.')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('rejects blocked partial text outputs', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Provide' }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Provide' }] } }],
      }), { status: 200 }))

    await expect(
      callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')
    ).rejects.toThrow('Google API returned unusable output (finish reason: SAFETY)')
  })

  it('uses header auth and disables thinking for Gemini 2.5 Flash rewrites', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Rewritten prompt' }] } }],
    }), { status: 200 }))

    await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemini-2.5-flash')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'AIzaTestKey',
    })

    const body = JSON.parse(String(init.body))
    expect(body.generationConfig).toMatchObject({
      temperature: 0.2,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    })
    expect(body.systemInstruction).toEqual({
      parts: [{ text: 'system prompt' }],
    })
  })

  it('retries Flash once and then surfaces retryable failures for provider fallback', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mockFetch
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))

    await expect(
      callGoogleAPI('AIzaTestKey', 'system', 'user', 'gemini-2.5-flash')
    ).rejects.toThrow('Google API returned 503')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const secondUrl = String(mockFetch.mock.calls[1][0])
    expect(secondUrl).toContain('/models/gemini-2.5-flash:generateContent')
    expect(infoSpy).toHaveBeenCalledWith({
      provider: 'google',
      model: 'gemini-2.5-flash',
      status: 503,
      attempt: 1,
      maxAttempts: 2,
      delayMs: 300,
    }, '[PromptGod] Google request failed with 503; retrying same model after short backoff')
    expect(infoSpy).toHaveBeenCalledWith({
      provider: 'google',
      model: 'gemini-2.5-flash',
      status: 503,
      attempt: 2,
      maxAttempts: 2,
    }, '[PromptGod] Google request attempts exhausted; surfacing failure for provider fallback')
  })

  it('uses Gemma-compatible request shape without systemInstruction', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Rewritten prompt' }] } }],
    }), { status: 200 }))

    await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemma-3-27b-it')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))

    expect(body.systemInstruction).toBeUndefined()
    expect(body.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'Instruction:\nsystem prompt\n\nTask:\nuser prompt' }],
      },
    ])
  })

  it('sanitizes Gemma analysis leakage down to the final prompt', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: '* User Prompt: "how to learn java"\n* Platform: ChatGPT\n* Draft: roadmap\nPrompt: Give me a focused roadmap to learn Java.\n[DIFF: roadmap structure, practical focus]',
          }],
        },
      }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemma-3-27b-it')

    expect(text).toBe('Give me a focused roadmap to learn Java.\n[DIFF: roadmap structure, practical focus]')
  })

  it('falls back to a sharpened source prompt when Gemma softens a launch prompt into generic project-brief language', async () => {
    const rawPrompt = 'I will upload the launch brief, meeting notes, a draft customer FAQ, and product screenshots. Please use these documents to create actionable launch preparation materials. Specifically, identify the primary launch risks, any inconsistencies or contradictions within the provided documents, potential customer misunderstandings, and team assumptions that lack evidence. Based on this analysis, provide:\n\n1. A practical launch readiness checklist.\n2. A concise internal risk memo.\n3. A draft customer-facing FAQ that is clear and natural-sounding.\n\nIf the files present conflicting information, please highlight these discrepancies directly. Avoid inventing missing details or masking uncertainty with vague language. Draft a clear summary I can share internally.'
    const userMessage = buildUserMessage(
      rawPrompt,
      'chatgpt',
      { isNewConversation: true, conversationLength: 0 }
    )

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: 'Please analyze the attached launch brief, meeting notes, draft customer FAQ, and product screenshots to proactively identify potential issues. Deliverables include: a launch readiness checklist, an internal risk memo, and a refined customer FAQ. Focus on identifying launch risks, inconsistencies across documents, potential customer confusion, and unsupported team assumptions. Clearly flag any conflicting information found within the files, and provide a concise summary of your findings for internal distribution. Avoid speculation or ambiguous language.\n[DIFF: refined wording, deliverables]',
          }],
        },
      }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system prompt', userMessage, 'gemma-3-27b-it')

    expect(text).toBe(
      'Use the launch brief, meeting notes, a draft customer FAQ, and product screenshots as the source material to create actionable launch preparation materials. Specifically, identify the primary launch risks, any inconsistencies or contradictions within the provided documents, potential customer misunderstandings, and team assumptions that lack evidence. Then produce a practical launch readiness checklist, a concise internal risk memo, and a draft customer-facing FAQ that is clear and natural-sounding. If the files present conflicting information, please highlight these discrepancies directly. Avoid inventing missing details or masking uncertainty with vague language. Draft a clear summary I can share internally.\n[DIFF: refined wording, deliverables]'
    )
  })

  it('uses the same Gemma fallback for text branch rewrite requests', async () => {
    const selectedText = 'I will upload the launch brief, meeting notes, a draft customer FAQ, and product screenshots. Please use these documents to create actionable launch preparation materials. Specifically, identify the primary launch risks, any inconsistencies or contradictions within the provided documents, potential customer misunderstandings, and team assumptions that lack evidence. Based on this analysis, provide:\n\n1. A practical launch readiness checklist.\n2. A concise internal risk memo.\n3. A draft customer-facing FAQ that is clear and natural-sounding.\n\nIf the files present conflicting information, please highlight these discrepancies directly. Avoid inventing missing details or masking uncertainty with vague language. Draft a clear summary I can share internally.'
    const userMessage = buildContextUserMessage(selectedText)

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: 'Please analyze the attached launch brief, meeting notes, draft customer FAQ, and product screenshots to proactively identify potential issues. Deliverables include: a launch readiness checklist, an internal risk memo, and a refined customer FAQ. Focus on identifying launch risks, inconsistencies across documents, potential customer confusion, and unsupported team assumptions. Clearly flag any conflicting information found within the files, and provide a concise summary of your findings for internal distribution. Avoid speculation or ambiguous language.',
          }],
        },
      }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system prompt', userMessage, 'gemma-3-27b-it')

    expect(text).toBe(
      'Use the launch brief, meeting notes, a draft customer FAQ, and product screenshots as the source material to create actionable launch preparation materials. Specifically, identify the primary launch risks, any inconsistencies or contradictions within the provided documents, potential customer misunderstandings, and team assumptions that lack evidence. Then produce a practical launch readiness checklist, a concise internal risk memo, and a draft customer-facing FAQ that is clear and natural-sounding. If the files present conflicting information, please highlight these discrepancies directly. Avoid inventing missing details or masking uncertainty with vague language. Draft a clear summary I can share internally.'
    )
  })

  it('sanitizes Gemini Flash wrapper tags down to the rewritten prompt', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: '<user_query>\nExplain the in-depth process that occurs after a user submits a prompt to ChatGPT, specifically detailing where and how LangChain integrates into this workflow. Focus on the interaction points and the value LangChain adds.\n</user_query>',
          }],
        },
      }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemini-2.5-flash')

    expect(text).toBe('Explain the in-depth process that occurs after a user submits a prompt to ChatGPT, specifically detailing where and how LangChain integrates into this workflow. Focus on the interaction points and the value LangChain adds.')
  })

  it('flattens generic instruction markup from Gemini Flash into plain text', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: '<instruction>\nExplain where LangChain fits into the flow after a user submits a prompt to ChatGPT.\n\nFocus on the following aspects:\n<list>\n<item>The initial processing of the prompt by ChatGPT.</item>\n<item>The typical points of intervention for LangChain within a larger application architecture.</item>\n</list>\n</instruction>',
          }],
        },
      }],
    }), { status: 200 }))

    const text = await callGoogleAPI('AIzaTestKey', 'system prompt', 'user prompt', 'gemini-2.5-flash')

    expect(text).toBe('Explain where LangChain fits into the flow after a user submits a prompt to ChatGPT.\n\nFocus on the following aspects:\n- The initial processing of the prompt by ChatGPT.\n- The typical points of intervention for LangChain within a larger application architecture.')
  })
})
