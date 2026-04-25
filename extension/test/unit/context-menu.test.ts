import { describe, expect, it } from 'vitest'
import {
  CONTEXT_SELECTION_MAX_CHARS,
  buildContextInjectionTarget,
  createContextEnhanceRequest,
  validateContextSelection,
} from '../../src/service-worker'
import { cleanContextEnhancementOutput } from '../../src/lib/context-enhance-prompt'

describe('text branch selection guards', () => {
  it('rejects missing, empty, and too-short selections', () => {
    expect(validateContextSelection(undefined)).toEqual({
      ok: false,
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
    })
    expect(validateContextSelection('  fix resume  ')).toEqual({
      ok: false,
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
    })
  })

  it('rejects selections above the max length without keeping selected text', () => {
    const result = validateContextSelection('x'.repeat(CONTEXT_SELECTION_MAX_CHARS + 1))

    expect(result).toEqual({
      ok: false,
      code: 'SELECTION_TOO_LONG',
      message: 'Selection is too long. Try a shorter passage.',
    })
    expect(result).not.toHaveProperty('selectedText')
  })

  it('trims valid selected text before handoff', () => {
    expect(validateContextSelection('  improve my resume bullets  ')).toEqual({
      ok: true,
      selectedText: 'improve my resume bullets',
    })
  })
})

describe('text branch request handoff', () => {
  it('creates ready requests for valid selected text', () => {
    const request = createContextEnhanceRequest(
      { ok: true, selectedText: 'improve my resume bullets' },
      'request-1',
      123
    )

    expect(request).toEqual({
      requestId: 'request-1',
      status: 'ready',
      selectedText: 'improve my resume bullets',
      requestedAt: 123,
    })
  })

  it('creates error requests without selected text', () => {
    const request = createContextEnhanceRequest(
      {
        ok: false,
        code: 'SELECTION_TOO_SHORT',
        message: 'Select a little more text to enhance.',
      },
      'request-2',
      456
    )

    expect(request).toEqual({
      requestId: 'request-2',
      status: 'error',
      code: 'SELECTION_TOO_SHORT',
      message: 'Select a little more text to enhance.',
      requestedAt: 456,
    })
    expect(request).not.toHaveProperty('selectedText')
  })

  it('targets the selected frame when Chrome provides a frame id', () => {
    expect(buildContextInjectionTarget(10, 3)).toEqual({
      tabId: 10,
      frameIds: [3],
    })
  })

  it('targets the tab when no frame id is available', () => {
    expect(buildContextInjectionTarget(10)).toEqual({ tabId: 10 })
  })
})

describe('text branch output cleanup', () => {
  it('strips diff tags and normalizes whitespace before returning a result', () => {
    const result = cleanContextEnhancementOutput(
      'Improve my resume bullets .\n[DIFF: clearer objective]',
      'improve resume'
    )

    expect(result).toBe('Improve my resume bullets.')
  })

  it('removes no-change markers from otherwise usable output', () => {
    const result = cleanContextEnhancementOutput(
      '[NO_CHANGE] Review this code for bugs.\n[DIFF: no changes needed]',
      'Review this code for bugs.'
    )

    expect(result).toBe('Review this code for bugs.')
  })

  it('falls back to the original selection when no-change output has no body', () => {
    const result = cleanContextEnhancementOutput('[NO_CHANGE]\n[DIFF: no changes needed]', '  keep this prompt  ')

    expect(result).toBe('Keep this prompt')
  })

  it('removes model-generated original text dumps from selected-text results', () => {
    const result = cleanContextEnhancementOutput(
      `Rewrite the project update into a more professional communication.

Original text:
"Hi everyone, the project is moving forward. fix this project plan and make it sound more professional"`,
      'Hi everyone, the project is moving forward. fix this project plan and make it sound more professional'
    )

    expect(result).toBe('Rewrite the project update into a more professional communication.')
  })

  it('replaces template-placeholder outputs with a placeholder-free conservative rewrite', () => {
    const result = cleanContextEnhancementOutput(
      'Write a polite status-check email to [recipient] about [project] by [date].',
      'hello there, i wanted to status check thanks alot, checked'
    )

    expect(result).toBe('Hello there, I wanted to check in on the status. Thanks a lot, checked')
    expect(result).not.toContain('[recipient]')
    expect(result).not.toContain('[project]')
    expect(result).not.toContain('[date]')
    expect(result).not.toMatch(/\?/)
  })

  it('treats brace and angle placeholders as invalid context output', () => {
    const braceResult = cleanContextEnhancementOutput(
      'Draft a follow-up using {{details}} and {context}.',
      'follow up with them'
    )
    const angleResult = cleanContextEnhancementOutput(
      'Draft a follow-up for <recipient> about <topic>.',
      'follow up with them'
    )

    expect(braceResult).toBe('Follow up with them')
    expect(braceResult).not.toContain('{{details}}')
    expect(braceResult).not.toContain('{context}')
    expect(angleResult).toBe('Follow up with them')
    expect(angleResult).not.toContain('<recipient>')
    expect(angleResult).not.toContain('<topic>')
  })

  it('replaces clarifying-question outputs with a no-question conservative rewrite', () => {
    const result = cleanContextEnhancementOutput(
      'Who is the recipient, and what project should I mention?',
      'hello there, i wanted to status check'
    )

    expect(result).toBe('Hello there, I wanted to check in on the status')
    expect(result).not.toMatch(/\?/)
  })

  it('replaces answered-task outputs for rough prompts with a conservative rewrite', () => {
    const result = cleanContextEnhancementOutput(
      'The complaints suggest three buckets: product bugs, confusing UX, and user error. The most urgent items should be investigated this week.',
      'analyze customer complaints, bug notes, and screenshots and draft a practical internal update'
    )

    expect(result).toBe('Analyze customer complaints, bug notes, and screenshots and draft a practical internal update')
  })

  it('keeps valid prompt rewrites for rough AI prompt selections', () => {
    const output = 'Analyze customer complaints, bug notes, and screenshots to categorize issues as product bugs, confusing UX, or user error. Identify likely patterns, highlight where evidence is lacking, prioritize the most urgent items, and draft a concise internal update with recommended next steps.'
    const result = cleanContextEnhancementOutput(
      output,
      'look at support complaints and figure out whats bug vs confusing ux and make internal update'
    )

    expect(result).toBe(output)
  })

  it('restores sendable-draft intent when a prompt rewrite drops it', () => {
    const result = cleanContextEnhancementOutput(
      'Analyze the provided complaints to identify the core underlying issue, distinguish between user error and systemic problems, and determine the key action items to communicate to the team today.',
      'read these complaints and just tell me what the real problem is, what is user error, and what i should send the team today'
    )

    expect(result).toBe(
      'Analyze the provided complaints to identify the core underlying issue, distinguish between user error and systemic problems, and determine the key action items to communicate to the team today. Draft a clear update I can send to the team today.'
    )
  })

  it('keeps sendable-draft rewrites unchanged when the deliverable is preserved', () => {
    const output = 'Analyze the provided complaints to identify the core underlying issue, distinguish between user error and systemic problems, and draft a clear update I can send to the team today with the key action items.'
    const result = cleanContextEnhancementOutput(
      output,
      'read these complaints and just tell me what the real problem is, what is user error, and what i should send the team today'
    )

    expect(result).toBe(output)
  })

  it('keeps valid launch-triage prompt rewrites with file references and deliverables unchanged', () => {
    const output = 'Use the launch brief, meeting notes, draft customer FAQ, and product screenshots as the source material for a hard launch-readiness triage. Identify the primary launch risks, inconsistencies across the documents, likely customer misunderstandings, and team assumptions that are not supported by evidence. Then produce a practical launch-readiness checklist, a concise internal risk memo, a clear customer-facing FAQ, and a summary I can share internally. Highlight any conflicting information directly, avoid inventing missing details, and keep the output sharp and practical.'
    const result = cleanContextEnhancementOutput(
      output,
      'I will upload the launch brief, meeting notes, a draft customer FAQ, and product screenshots. Please use these documents to create actionable launch preparation materials. Specifically, identify the primary launch risks, any inconsistencies or contradictions within the provided documents, potential customer misunderstandings, and team assumptions that lack evidence. Based on this analysis, provide:\n\n1. A practical launch readiness checklist.\n2. A concise internal risk memo.\n3. A draft customer-facing FAQ that is clear and natural-sounding.\n\nIf the files present conflicting information, please highlight these discrepancies directly. Avoid inventing missing details or masking uncertainty with vague language. Draft a clear summary I can share internally.'
    )

    expect(result).toBe(output)
  })

  it('removes leading first-person prompt-brief framing when the remaining text is already a direct rewrite', () => {
    const result = cleanContextEnhancementOutput(
      `I am providing a collection of launch-related documents, including a half-finished FAQ, support tickets, screenshots, sales call notes, refund reasons, Slack scraps, and two potentially contradictory documents.

My primary need is a blunt, no-nonsense analysis, treating this as a critical launch and incident triage.

Use the provided files as direct source material. Do not assume prior knowledge or jump to unsupported conclusions. Clearly distinguish between confirmed facts, educated guesses, missing evidence, contradictions, user confusion, and actual product breakage. If documents conflict, specify the exact points of disagreement and identify unsupported claims. If there are multiple potential failure paths, rank them by priority rather than simply listing them. If evidence is insufficient, state that explicitly instead of glossing over it.

Following this analysis, provide the following in plain text only:

1. A prioritized launch checklist.
2. A concise internal risk memo.
3. The single highest-value item to verify today to prevent potential issues.

Ensure the output is sharp, practical, non-fluffy, and natural-sounding. Do not invent numbers, names, dates, or express unearned confidence. If information is missing, state "missing."`,
      'i am providing launch docs and need a blunt launch triage prompt with a checklist memo and one thing to verify today'
    )

    expect(result).toBe(
      `Use the provided files as direct source material. Do not assume prior knowledge or jump to unsupported conclusions. Clearly distinguish between confirmed facts, educated guesses, missing evidence, contradictions, user confusion, and actual product breakage. If documents conflict, specify the exact points of disagreement and identify unsupported claims. If there are multiple potential failure paths, rank them by priority rather than simply listing them. If evidence is insufficient, state that explicitly instead of glossing over it.

Following this analysis, provide the following in plain text only:

1. A prioritized launch checklist.
2. A concise internal risk memo.
3. The single highest-value item to verify today to prevent potential issues.

Ensure the output is sharp, practical, non-fluffy, and natural-sounding. Do not invent numbers, names, dates, or express unearned confidence. If information is missing, state "missing."`
    )
  })

  it('restores missing internal-summary intent for launch-triage prompt rewrites', () => {
    const result = cleanContextEnhancementOutput(
      'Use the launch brief, meeting notes, draft customer FAQ, and product screenshots as the source material for a hard launch-readiness triage. Identify the primary launch risks, inconsistencies across the documents, likely customer misunderstandings, and team assumptions that are not supported by evidence. Then produce a practical launch-readiness checklist, a concise internal risk memo, and a clear customer-facing FAQ. Highlight any conflicting information directly, avoid inventing missing details, and keep the output sharp and practical.',
      'I will upload the launch brief, meeting notes, a draft customer FAQ, and product screenshots. Please use these documents to create actionable launch preparation materials. Specifically, identify the primary launch risks, any inconsistencies or contradictions within the provided documents, potential customer misunderstandings, and team assumptions that lack evidence. Based on this analysis, provide:\n\n1. A practical launch readiness checklist.\n2. A concise internal risk memo.\n3. A draft customer-facing FAQ that is clear and natural-sounding.\n\nIf the files present conflicting information, please highlight these discrepancies directly. Avoid inventing missing details or masking uncertainty with vague language. Draft a clear summary I can share internally.'
    )

    expect(result).toBe(
      'Use the launch brief, meeting notes, draft customer FAQ, and product screenshots as the source material for a hard launch-readiness triage. Identify the primary launch risks, inconsistencies across the documents, likely customer misunderstandings, and team assumptions that are not supported by evidence. Then produce a practical launch-readiness checklist, a concise internal risk memo, and a clear customer-facing FAQ. Highlight any conflicting information directly, avoid inventing missing details, and keep the output sharp and practical. Draft a clear summary I can share internally.'
    )
  })

  it('removes a trailing duplicate summary paragraph from a rewritten prompt', () => {
    const result = cleanContextEnhancementOutput(
      `I have a collection of support complaints, screenshots, and incomplete notes. This material contains a mix of factual issues, user experience confusion, and potential bugs.

First, process this raw input in stages:

1. Separate the content into distinct categories: facts, assumptions, missing information, contradictions, and emotional claims.

2. Based on this analysis, identify the 3 most likely root cause buckets for the issues. For each bucket, describe what specific evidence would make it more or less likely.

3. Finally, draft a concise internal update for engineering, design, and support teams. This update should clearly state what happened, the impact, what is currently known, what is still unknown, proposed next steps, clear ownership for those steps, and the risks if no action is taken this week. Do not invent details or make assumptions if the source material is insufficient.

Analyze these support complaints and bug notes to distinguish actual issues from user confusion. Identify likely root causes and draft a concise team update. Prioritize critical information, specify missing evidence, outline immediate checks, and detail the risks of inaction this week.`,
      'sort these complaints and notes into facts assumptions missing info contradictions and emotional claims, then identify 3 root cause buckets and draft an internal update with next steps and risks this week'
    )

    expect(result).not.toContain('Analyze these support complaints and bug notes')
    expect(result).toContain('1. Separate the content into distinct categories')
    expect(result).toContain('3. Finally, draft a concise internal update')
  })

  it('removes a trailing duplicate summary line from a rewritten prompt', () => {
    const result = cleanContextEnhancementOutput(
      `Analyze these customer complaints and bug notes to identify the core underlying issue, distinguish between user confusion and actual problems, determine what critical evidence is missing, and prioritize immediate checks. Then, draft a concise internal update based on these findings that I can send today.
Analyze these complaints to identify what is actually broken, what stems from user confusion, and what message should be sent to the team today. Prioritize the biggest problems first.`,
      'read these complaints and tell me what is actually broken, what is user confusion, what evidence is missing, and what update i should send the team today'
    )

    expect(result).toBe(
      'Analyze these customer complaints and bug notes to identify the core underlying issue, distinguish between user confusion and actual problems, determine what critical evidence is missing, and prioritize immediate checks. Then, draft a concise internal update based on these findings that I can send today.'
    )
  })

  it('removes a paraphrased trailing summary when it only repeats covered prompt constraints', () => {
    const result = cleanContextEnhancementOutput(
      `Review these customer complaints and bug reports to determine what is genuinely failing, what users are misunderstanding, which evidence gaps still need verification, and draft a concise internal update I can send to the team today.
Use these complaints and notes to work out what is actually broken, what comes from user confusion, and what message the team should get today. Focus on the most urgent items first.`,
      'read these complaints and tell me what is actually broken, what is user confusion, what evidence is missing, and what update i should send the team today'
    )

    expect(result).toBe(
      'Review these customer complaints and bug reports to determine what is genuinely failing, what users are misunderstanding, which evidence gaps still need verification, and draft a concise internal update I can send to the team today.'
    )
  })

  it('keeps a trailing summary line when it restores original hard constraints the main rewrite dropped', () => {
    const output = `Analyze these support complaints and bug notes to identify what is actually broken, what comes from user confusion, and draft a clear team update.
Analyze these complaints to identify what is actually broken, what comes from user confusion, and draft the team update in under 150 words for today.`
    const result = cleanContextEnhancementOutput(
      output,
      'read these complaints and tell me what is actually broken, what is user confusion, and draft a team update under 150 words for today'
    )

    expect(result).toBe(output)
  })

  it('keeps a final paragraph when it adds a genuinely new constraint', () => {
    const output = `Analyze these support complaints and bug notes to distinguish actual issues from user confusion. Identify likely root causes and draft a concise team update.

Keep the final update under 150 words and use flat bullets.`
    const result = cleanContextEnhancementOutput(
      output,
      'look through support complaints and tell me whats actually broken vs user confusion, then write a short update for the team'
    )

    expect(result).toBe(output)
  })
})
