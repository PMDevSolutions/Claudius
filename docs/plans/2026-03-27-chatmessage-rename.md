# ChatMessage Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename `MessageBubble` to `ChatMessage` for naming consistency with other `Chat*` components.

**Architecture:** Pure rename/refactor. No logic changes. Rename the component, file, test file, and update all imports.

**Tech Stack:** React, TypeScript, Vitest

---

### Task 1: Rename component file

**Files:**
- Rename: `widget/src/components/MessageBubble.tsx` -> `widget/src/components/ChatMessage.tsx`

**Step 1: Create ChatMessage.tsx with renamed exports**

Copy `MessageBubble.tsx` to `ChatMessage.tsx`. Rename:
- Interface: `MessageBubbleProps` -> `ChatMessageProps`
- Component: `MessageBubble` -> `ChatMessage`
- `memo` display name: `MessageBubble` -> `ChatMessage`

**Step 2: Delete old MessageBubble.tsx**

**Step 3: Run tests to verify they fail (imports broken)**

Run: `cd widget && pnpm test -- --run`
Expected: FAIL - cannot find `MessageBubble`

### Task 2: Update test file

**Files:**
- Rename: `widget/src/components/__tests__/MessageBubble.test.tsx` -> `widget/src/components/__tests__/ChatMessage.test.tsx`

**Step 1: Create ChatMessage.test.tsx**

Copy test file, update:
- Import: `from "../MessageBubble"` -> `from "../ChatMessage"`
- References: `MessageBubble` -> `ChatMessage`
- Describe block: `"MessageBubble"` -> `"ChatMessage"`

**Step 2: Delete old MessageBubble.test.tsx**

### Task 3: Update ChatWindow import

**Files:**
- Modify: `widget/src/components/ChatWindow.tsx`

**Step 1: Update import and JSX usage**

Change:
```tsx
import { MessageBubble } from "./MessageBubble";
```
to:
```tsx
import { ChatMessage } from "./ChatMessage";
```

Change JSX `<MessageBubble` to `<ChatMessage` (and closing tag).

### Task 4: Update CLAUDE.md references

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update component table and file listing**

Replace `MessageBubble` with `ChatMessage` in the project structure and component table.

### Task 5: Run tests and verify

**Step 1: Run all widget tests**

Run: `cd widget && pnpm test -- --run`
Expected: All tests PASS

**Step 2: Commit**

```bash
git add -A
git commit -m "refactor: rename MessageBubble to ChatMessage for naming consistency"
```
