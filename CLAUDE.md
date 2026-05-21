# CLAUDE.md

Project-level instructions for coding agents. These apply to **any** task in this
repo, independent of any specific implementation plan.

---

## Getting Unstuck (anti-flailing protocol)

When something doesn't work — a failing test, a build error, a wrong output —
switch from building mode into diagnosis mode. The goal is to fix the *cause*,
which means every attempt tests a specific hypothesis, never a guess.

### Diagnose before you touch anything
Before changing a line, answer three questions:
1. **What am I actually trying to accomplish?** (the goal, not the symptom)
2. **Why is it failing?** Read the error, read the relevant code, and form a
   specific hypothesis about the cause. "I think X is happening because Y."
3. **What change would fix *that cause*, and how will I know it worked?**

If you can't state a hypothesis, you don't yet understand the problem — keep
reading the code and the error until you can. Investigating is progress;
guessing is not.

### Capture the last-known-good point first
Before your first fix attempt on a sticky problem, record the last working state
(commit hash or a clear description) at the top of the debug log. This is the
point you'll return to if you escalate, so capture it while it's still green.

### Keep a debug log, and read it before each attempt
For any problem that survives your first fix, open a gitignored scratch file
(`.debug-log.md` at the repo root) and track it there:

```
## Problem: <one line — what's broken>
Goal: <what success looks like>
Last-known-good: <commit/state to revert to if I get stuck>

### Attempt 1
Hypothesis: <why I believe it's failing>
Change: <what I did>
Result: <what actually happened>
Ruled out: <what this tells me is NOT the cause>

### Attempt 2
...
```

**Read this log before every new attempt.** Each new hypothesis must be
*consistent with everything already ruled out*. Before acting, check: does this
attempt rule out a cause the previous attempts haven't already eliminated?

### Know when you're learning vs. flailing — and escalate the moment it's flailing
Use your judgment on how many attempts a problem warrants — some are worth more
digging than others. Anchor that judgment to one test: **am I still learning?**

- **Still learning** = each attempt rules out a real cause and narrows the
  search. Keep going; you're converging.
- **Flailing** = you're retrying variations of an idea already disproved, the
  "ruled out" line is repeating itself, or you can't state what a new attempt
  would teach you that you don't already know. The instant you notice this,
  **stop** — another attempt won't help.

This is the real limit: not a fixed count, but the point where attempts stop
producing new information. In practice that's usually small (often 2–4). If
you're past that and still going, you've crossed from diagnosis into grinding.

### When you stop: revert, then report
1. **Revert to the last-known-good point** recorded in the log, so you hand back
   a clean, working tree (not a broken one). The log is gitignored, so it
   survives the revert — keep it.
2. **Come to me** with: the problem and the goal, the hypotheses tried and what
   each ruled out (point me at `.debug-log.md`), and your current best theory
   about the cause plus what you'd want to try or learn next.

### What this looks like in practice
- A test fails → read the assertion and the code under test, hypothesize why,
  fix that, re-run. Usually one pass, no log needed.
- It fails again differently → capture last-known-good, log it, form the next
  hypothesis from what attempt 1 revealed.
- Attempts stop teaching you anything new → revert to green, escalate with the
  log. Don't grind.

### Add the log to .gitignore
Ensure `.debug-log.md` is gitignored so it never lands in a commit.

---

## Acceptance Testing Protocol

`npm run lint`, `npm run typecheck`, and `npm run test` are necessary but not
sufficient. Many acceptance criteria require browser or integration verification
that automated tests cannot cover. Follow these rules for every PR:

### Test everything the criterion says, not a representative subset
When a criterion lists multiple conditions (e.g. "missing file, wrong MIME,
oversize"), test each one separately and record evidence for each. When a method
has multiple code paths wired up, verify each path — not just the easiest one.
A single passing example does not prove the others work.

### Browser criteria require a running app
Any criterion that says "renders," "survives reload," "visibly changes," or
describes user interaction requires starting the dev server and verifying in
the browser. Capture evidence: the curl output, the rendered HTML, the network
request, or a description of the observed behavior. A passing `npm run test`
does not satisfy a browser criterion.

### Record evidence per criterion, not per PR
The completion report must show evidence for each numbered criterion
individually. "All tests pass" is valid evidence only for the criterion that
says "tests pass" — not for criteria about visual rendering, API responses,
or interaction behavior.

### Test the full surface of what you built, not just what the plan asks
If you wire up three API methods but the plan only asks you to test one, test
all three. The plan's acceptance criteria are the minimum bar, not the scope
of verification. Anything you wrote code for should be confirmed working.

---

## Code Conventions

The code-style conventions for this repo live in `code-conventions.md`. Read and
follow them for all code you write here — file-top intent comments,
self-documenting names, consistent function shape, real (non-speculative) reuse,
leaning on the platform before adding dependencies, and cross-codebase
consistency.
