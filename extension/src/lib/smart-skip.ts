// Smart skip — determines if a prompt is too short/trivial to enhance

export function shouldSkipEnhancement(prompt: string): boolean {
  const words = prompt.trim().split(/\s+/)
  return words.length < 3 || words[0] === ''
}
