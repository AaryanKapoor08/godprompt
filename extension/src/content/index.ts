// PromptPilot content script — injected into ChatGPT, Claude, and Gemini

const platform = detectPlatform()

if (platform) {
  console.info({ platform }, '[PromptPilot] Content script loaded')
} else {
  console.info('[PromptPilot] Content script loaded on unrecognized platform')
}

function detectPlatform(): 'chatgpt' | 'claude' | 'gemini' | null {
  const host = window.location.hostname

  if (host === 'chatgpt.com' || host === 'chat.openai.com') {
    return 'chatgpt'
  }
  if (host === 'claude.ai') {
    return 'claude'
  }
  if (host === 'gemini.google.com') {
    return 'gemini'
  }

  return null
}
