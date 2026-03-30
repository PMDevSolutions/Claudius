# Auto-PR on Branch Completion - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically push and create a PR when finishing development branches, eliminating the manual 4-option menu.

**Architecture:** Configuration-driven approach using CLAUDE.md project instructions and persistent feedback memory. The existing `finishing-a-development-branch` skill already has full PR creation logic (Option 2) -- we just instruct Claude to auto-select it. No code changes needed.

**Tech Stack:** CLAUDE.md, Claude Code memory system

---

### Task 1: Add Workflow Automation section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (before Environment Variables section)

**Step 1: Add auto-PR instruction**

Add a `## Workflow Automation` section with `### Branch Completion: Auto-PR` subsection that instructs Claude to:
- Skip the 4-option menu
- Automatically push and create PR after tests pass
- Generate PR title/body from commit history
- Report PR URL to user
- Honor explicit overrides (merge locally, keep, discard)

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add auto-PR workflow automation to CLAUDE.md"
```

### Task 2: Save feedback memory

**Files:**
- Create: `~/.claude/projects/.../memory/feedback_auto_pr_on_branch_completion.md`
- Modify: `~/.claude/projects/.../memory/MEMORY.md`

**Step 1: Create memory file with frontmatter**

Record the preference with why (always choosing option 2) and how to apply (auto-push + PR after tests pass).

**Step 2: Add index entry to MEMORY.md**

### Task 3: Verify

**Step 1: Confirm CLAUDE.md reads correctly**

```bash
grep -A 15 "Workflow Automation" CLAUDE.md
```

**Step 2: Confirm memory is indexed**

```bash
cat ~/.claude/projects/.../memory/MEMORY.md
```

---

## How It Works

The `finishing-a-development-branch` skill reads CLAUDE.md instructions before presenting options. With the new instruction, the flow becomes:

1. Tests pass (unchanged)
2. Determine base branch (unchanged)
3. **Skip option menu** -- go directly to push + PR creation
4. Report PR URL to user

**Override mechanism:** User can say "merge locally", "keep the branch", or "discard" at any point to deviate from the default.
