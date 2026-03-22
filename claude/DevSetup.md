# Load PromptPilot in Chrome — 2 Minutes

## First Time (do once)

1. Open Chrome
2. Type `chrome://extensions` in the address bar, hit Enter
3. Top-right corner: flip **Developer mode** ON
4. Leave this tab open — you'll come back here

## After Every Build

We haven't built anything yet. Once we start Phase 1, you'll run:

```
cd extension
pnpm build
```

This creates a `dist/` folder. Then:

5. Back on `chrome://extensions`, click **Load unpacked**
6. Navigate to the `dist/` folder inside your project, select it
7. Done. Extension is live in your browser.

## Seeing Changes

After you edit code and rebuild:

- Go to `chrome://extensions`
- Find PromptPilot
- Click the 🔄 refresh icon on the card
- Reload the ChatGPT/Claude/Gemini tab

That's it. No deploy. No store. No approval process. Changes are instant.

## During `pnpm dev` (watch mode)

Once we set up watch mode, it auto-rebuilds on every file save. You just:

- Save your file
- Click refresh on `chrome://extensions`
- Reload the platform tab

## When You're Done Building (way later)

Publishing to Chrome Web Store is a separate thing we do at the end. It's how strangers install it. During development, "Load unpacked" is all you need.

---

**TL;DR:** Build → Load unpacked → Refresh. That's the whole loop.
