Complete the current phase by doing ALL of the following automatically:

1. Read `claude/Progress.md` to determine the current phase number and name.
2. Read `claude/github.md` to see the existing commit history format.
3. Mark ALL checkpoints for the current phase as `[x]` in `claude/Progress.md`.
4. Change the phase status from `[not started]` to `[complete]`.
5. Add a Notes line summarizing what was built.
6. Increment `**Current Phase:**` to the next number.
7. Get the latest commit hash with `git log --oneline -1`.
8. Add a new section in `claude/github.md` for this phase (matching the existing format) with the commit hash, message, and branch. Move the completed phase's row out of the "Upcoming" table.
9. Add a "What was done" summary listing the key changes.
10. Stage `claude/Progress.md` and `claude/github.md`.
11. Commit with message: `docs: add Phase N to commit history tracker` (use the actual phase number).
12. Run `git log --oneline -3` to confirm.

Do NOT create the feature commit — only the docs/tracker update. The feature commit should already exist.
