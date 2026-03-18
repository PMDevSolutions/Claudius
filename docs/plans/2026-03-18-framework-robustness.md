# React Framework Robustness Enhancement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 19 new capabilities (5 skills, 3 hooks, 4 scripts, 3 agents, 2 integrations, 2 pipeline enhancements) to make this the most robust React app development framework possible.

**Architecture:** Each addition follows existing patterns — scripts use `#!/usr/bin/env bash` with `set -euo pipefail`, agents are markdown files in `.claude/agents/`, skills are `SKILL.md` files in `.claude/skills/<name>/`, hooks are inline bash in `.claude/settings.json`. All new items integrate with `pipeline.config.json` where applicable.

**Tech Stack:** Bash, Node.js, React, TypeScript, Tailwind CSS, Vitest, Playwright, pnpm

---

## Overview

| # | Type | Name | Priority |
|---|------|------|----------|
| 1 | Script | `check-dead-code.sh` | P1 |
| 2 | Script | `check-security.sh` | P1 |
| 3 | Script | `generate-api-client.sh` | P2 |
| 4 | Script | `check-responsive.sh` | P2 |
| 5 | Skill | State Management Patterns | P1 |
| 6 | Skill | Form Handling Patterns | P1 |
| 7 | Skill | Authentication Flows | P2 |
| 8 | Skill | Animation/Motion Patterns | P3 |
| 9 | Skill | SEO & Metadata | P2 |
| 10 | Hook | Post-build Lighthouse CI | P1 |
| 11 | Hook | Pre-commit bundle size guard | P2 |
| 12 | Hook | Post-test mutation testing reminder | P3 |
| 13 | Agent | Error Boundary Architect | P2 |
| 14 | Agent | Migration Specialist | P2 |
| 15 | Agent | Internationalization Engineer | P3 |
| 16 | Integration | Sentry/Error Monitoring MCP | P3 |
| 17 | Integration | Deploy Preview on PR | P3 |
| 18 | Pipeline | Phase 8.5: Responsive Verification | P2 |
| 19 | Pipeline | Mutation Testing in Quality Gate | P3 |

---

## Task 1: Dead Code Detection Script

**Files:**
- Create: `scripts/check-dead-code.sh`
- Modify: `CLAUDE.md` (add to scripts section)
- Modify: `.claude/pipeline.config.json` (add deadCode config)

**Step 1: Add config to pipeline.config.json**

Add to `.claude/pipeline.config.json` after the `"tokenSync"` block:

```json
"deadCode": {
  "enabled": true,
  "tool": "knip",
  "ignorePatterns": ["**/*.stories.*", "**/*.test.*", "**/*.e2e.*"],
  "reportUnusedExports": true,
  "reportUnusedDependencies": true,
  "reportUnusedFiles": true
}
```

**Step 2: Create the script**

Create `scripts/check-dead-code.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# check-dead-code.sh — Find unused exports, files, dependencies
# Uses knip (https://knip.dev) for TypeScript-aware dead code detection
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Config ---
CONFIG_FILE=".claude/pipeline.config.json"
ENABLED=true
JSON_OUTPUT=false

if [ -f "$CONFIG_FILE" ]; then
  ENABLED=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.deadCode?.enabled ?? true)")
fi

# --- Args ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --json) JSON_OUTPUT=true; shift ;;
    --fix) FIX_MODE=true; shift ;;
    *) shift ;;
  esac
done

if [ "$ENABLED" != "true" ]; then
  echo "Dead code detection is disabled in pipeline.config.json"
  exit 0
fi

# --- Check knip installed ---
if ! npx knip --version &>/dev/null; then
  echo "Installing knip..."
  pnpm add -D knip
fi

echo "=== Dead Code Detection ==="
echo ""

# --- Run knip ---
KNIP_OUTPUT=$(npx knip --reporter compact 2>&1) || true
KNIP_EXIT=$?

# --- Parse results ---
UNUSED_FILES=$(echo "$KNIP_OUTPUT" | grep -c "Unused files" || echo "0")
UNUSED_DEPS=$(echo "$KNIP_OUTPUT" | grep -c "Unused dependencies" || echo "0")
UNUSED_EXPORTS=$(echo "$KNIP_OUTPUT" | grep -c "Unused exports" || echo "0")

if [ "$JSON_OUTPUT" = "true" ]; then
  cat <<JSONEOF
{
  "status": "$( [ "$KNIP_EXIT" -eq 0 ] && echo "pass" || echo "fail" )",
  "unusedFiles": $UNUSED_FILES,
  "unusedDependencies": $UNUSED_DEPS,
  "unusedExports": $UNUSED_EXPORTS,
  "rawOutput": $(echo "$KNIP_OUTPUT" | head -50 | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)))")
}
JSONEOF
  exit $KNIP_EXIT
fi

echo "$KNIP_OUTPUT"
echo ""

if [ "$KNIP_EXIT" -eq 0 ]; then
  echo "✓ No dead code detected"
  exit 0
else
  echo "✗ Dead code found — review output above"
  exit 1
fi
```

**Step 3: Make executable and verify**

Run: `chmod +x scripts/check-dead-code.sh`
Run: `head -3 scripts/check-dead-code.sh` to verify shebang

**Step 4: Update CLAUDE.md**

Add to the Development Scripts section after `verify-test-coverage.sh`:

```bash
# Dead code detection (unused exports, files, dependencies)
./scripts/check-dead-code.sh [--json] [--fix]
```

Add to Quick Command Reference under Code Quality:

```bash
./scripts/check-dead-code.sh            # Dead code detection
```

**Step 5: Commit**

```bash
git add scripts/check-dead-code.sh .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add dead code detection script using knip"
```

---

## Task 2: Security Audit Script

**Files:**
- Create: `scripts/check-security.sh`
- Modify: `CLAUDE.md` (add to scripts section)
- Modify: `.claude/pipeline.config.json` (add security config)

**Step 1: Add config to pipeline.config.json**

Add after the `"deadCode"` block:

```json
"security": {
  "enabled": true,
  "auditLevel": "moderate",
  "failOnVulnerability": true,
  "checkLockfile": true
}
```

**Step 2: Create the script**

Create `scripts/check-security.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# check-security.sh — Dependency vulnerability audit
# Runs pnpm audit and checks for known vulnerabilities
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Config ---
CONFIG_FILE=".claude/pipeline.config.json"
AUDIT_LEVEL="moderate"
FAIL_ON_VULN=true
JSON_OUTPUT=false

if [ -f "$CONFIG_FILE" ]; then
  AUDIT_LEVEL=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.security?.auditLevel ?? 'moderate')")
  FAIL_ON_VULN=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.security?.failOnVulnerability ?? true)")
fi

# --- Args ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --json) JSON_OUTPUT=true; shift ;;
    --level) AUDIT_LEVEL="$2"; shift 2 ;;
    --no-fail) FAIL_ON_VULN=false; shift ;;
    *) shift ;;
  esac
done

echo "=== Security Audit ==="
echo ""

TOTAL_ISSUES=0

# --- 1. pnpm audit ---
echo "▸ Running pnpm audit (level: $AUDIT_LEVEL)..."
AUDIT_OUTPUT=$(pnpm audit --audit-level "$AUDIT_LEVEL" 2>&1) || true
AUDIT_EXIT=$?

if [ $AUDIT_EXIT -ne 0 ]; then
  echo "$AUDIT_OUTPUT"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo "  ✓ No vulnerabilities at $AUDIT_LEVEL level or above"
fi

echo ""

# --- 2. Check for common security anti-patterns ---
echo "▸ Checking for security anti-patterns..."

ISSUES=0

# Check for hardcoded secrets
SECRET_PATTERNS='(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*[:=]\s*["\x27][^"\x27]{8,}'
if grep -rn --include="*.ts" --include="*.tsx" --include="*.js" -E "$SECRET_PATTERNS" src/ 2>/dev/null | grep -v ".env" | grep -v "process.env" | grep -v "import.meta.env"; then
  echo "  ✗ Potential hardcoded secrets found"
  ISSUES=$((ISSUES + 1))
else
  echo "  ✓ No hardcoded secrets detected"
fi

# Check for dangerouslySetInnerHTML
DANGEROUS_COUNT=$(grep -rn --include="*.tsx" --include="*.ts" "dangerouslySetInnerHTML" src/ 2>/dev/null | wc -l || echo "0")
if [ "$DANGEROUS_COUNT" -gt 0 ]; then
  echo "  ⚠ Found $DANGEROUS_COUNT use(s) of dangerouslySetInnerHTML — review for XSS"
  grep -rn --include="*.tsx" --include="*.ts" "dangerouslySetInnerHTML" src/ 2>/dev/null | head -5
fi

# Check for eval usage
EVAL_COUNT=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.js" '\beval\s*(' src/ 2>/dev/null | wc -l || echo "0")
if [ "$EVAL_COUNT" -gt 0 ]; then
  echo "  ✗ Found $EVAL_COUNT use(s) of eval() — security risk"
  ISSUES=$((ISSUES + 1))
fi

# Check .env files not in .gitignore
if [ -f ".env" ] && ! grep -q "^\.env$" .gitignore 2>/dev/null; then
  echo "  ✗ .env file exists but not in .gitignore"
  ISSUES=$((ISSUES + 1))
else
  echo "  ✓ .env handling looks correct"
fi

TOTAL_ISSUES=$((TOTAL_ISSUES + ISSUES))
echo ""

# --- 3. Check for outdated dependencies with known CVEs ---
echo "▸ Checking for outdated packages..."
OUTDATED=$(pnpm outdated 2>&1) || true
if [ -n "$OUTDATED" ]; then
  echo "$OUTDATED" | head -20
else
  echo "  ✓ All packages up to date"
fi

echo ""

# --- Summary ---
if [ "$JSON_OUTPUT" = "true" ]; then
  cat <<JSONEOF
{
  "status": "$( [ $TOTAL_ISSUES -eq 0 ] && echo "pass" || echo "fail" )",
  "auditLevel": "$AUDIT_LEVEL",
  "totalIssues": $TOTAL_ISSUES
}
JSONEOF
fi

if [ $TOTAL_ISSUES -eq 0 ]; then
  echo "✓ Security audit passed"
  exit 0
elif [ "$FAIL_ON_VULN" = "true" ]; then
  echo "✗ Security issues found ($TOTAL_ISSUES)"
  exit 1
else
  echo "⚠ Security issues found ($TOTAL_ISSUES) — non-blocking mode"
  exit 0
fi
```

**Step 3: Make executable**

Run: `chmod +x scripts/check-security.sh`

**Step 4: Update CLAUDE.md**

Add to Development Scripts:

```bash
# Security audit (dependency vulnerabilities + anti-patterns)
./scripts/check-security.sh [--json] [--level critical] [--no-fail]
```

**Step 5: Commit**

```bash
git add scripts/check-security.sh .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add security audit script with dependency and anti-pattern checks"
```

---

## Task 3: State Management Skill

**Files:**
- Create: `.claude/skills/state-management/SKILL.md`
- Modify: `CLAUDE.md` (add to skills table)
- Modify: `.claude/skills/README.md` (add entry)

**Step 1: Create the skill**

Create `.claude/skills/state-management/SKILL.md`:

```markdown
---
name: state-management
description: State management patterns for React apps — Zustand, TanStack Query, Context, URL state. Guides architecture decisions for local, global, server, and URL state.
triggers:
  - "state management"
  - "zustand"
  - "tanstack query"
  - "react query"
  - "global state"
  - "server state"
  - "data fetching"
  - "caching"
---

# State Management Patterns

## When to Use This Skill

Use when:
- Setting up state management for a new React app
- Deciding between state solutions
- Implementing data fetching/caching
- Debugging stale state or unnecessary re-renders
- Migrating from Redux or other state libraries

## State Categories Decision Tree

```
What kind of state?
├── UI State (local) → useState / useReducer
│   └── Shared across 2-3 components → Lift state up
├── UI State (global) → Zustand
│   └── Theme, sidebar open, modals, toasts
├── Server State → TanStack Query
│   └── API data, caching, background refetching
├── URL State → useSearchParams / nuqs
│   └── Filters, pagination, sort, tab selection
└── Form State → React Hook Form + Zod
    └── Inputs, validation, submission
```

## 1. Local State — useState / useReducer

**Use for:** Component-scoped UI state that doesn't need sharing.

```tsx
// Simple toggle
const [isOpen, setIsOpen] = useState(false);

// Complex state with multiple transitions — use useReducer
type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: Item[] }
  | { type: 'FETCH_ERROR'; error: string };

interface State {
  items: Item[];
  loading: boolean;
  error: string | null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { items: action.data, loading: false, error: null };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
  }
}
```

**Rule:** If you have 3+ related `useState` calls that change together, switch to `useReducer`.

## 2. Global UI State — Zustand

**Use for:** State shared across many components (theme, auth status, notifications, layout).

### Setup

```bash
pnpm add zustand
```

### Store Pattern

```tsx
// src/stores/use-app-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface AppState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        theme: 'light',
        sidebarOpen: true,
        setTheme: (theme) => set({ theme }),
        toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      }),
      { name: 'app-store' }
    )
  )
);
```

### Usage — Select Only What You Need

```tsx
// GOOD — component re-renders only when theme changes
const theme = useAppStore((s) => s.theme);

// BAD — re-renders on ANY store change
const { theme } = useAppStore();
```

### Zustand Rules
- One store per domain (app, auth, notifications) — not one mega store
- Always use selectors for reads
- Use `persist` middleware for state that survives refresh (theme, user preferences)
- Use `devtools` middleware in development
- Keep actions in the store, not in components
- Never store server data in Zustand — use TanStack Query

## 3. Server State — TanStack Query

**Use for:** All data from APIs. Handles caching, refetching, loading states, error states, optimistic updates.

### Setup

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

### Provider Setup

```tsx
// src/providers/query-provider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,          // 1 min before refetch
      gcTime: 5 * 60 * 1000,         // 5 min cache
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Query Pattern — Custom Hooks

```tsx
// src/hooks/use-users.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query keys — colocate with hooks
const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

// Fetch hook
export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => api.users.list(filters),
  });
}

// Detail hook
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.users.get(id),
    enabled: !!id,
  });
}

// Mutation hook with optimistic update
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserInput) => api.users.update(data),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: userKeys.detail(newData.id) });
      const previous = queryClient.getQueryData(userKeys.detail(newData.id));
      queryClient.setQueryData(userKeys.detail(newData.id), (old: User) => ({
        ...old,
        ...newData,
      }));
      return { previous };
    },
    onError: (_err, newData, context) => {
      queryClient.setQueryData(userKeys.detail(newData.id), context?.previous);
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.id) });
    },
  });
}
```

### TanStack Query Rules
- NEVER store API data in useState or Zustand
- Every API call gets its own custom hook
- Query keys are structured objects (not strings)
- Use `enabled` to conditionally fetch
- Use `staleTime` (not refetchInterval) for most cases
- Optimistic updates for mutations that need instant feedback
- Invalidate related queries after mutations

## 4. URL State — Search Params

**Use for:** Filters, pagination, sort order, active tabs — anything the user should be able to bookmark or share.

### Next.js (App Router)

```tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useUrlState<T extends string>(key: string, defaultValue: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = (searchParams.get(key) as T) ?? defaultValue;

  const setValue = (newValue: T) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newValue === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, newValue);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  return [value, setValue] as const;
}
```

### Vite (with nuqs)

```bash
pnpm add nuqs
```

```tsx
import { useQueryState, parseAsInteger } from 'nuqs';

function ProductList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '' });
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [sort, setSort] = useQueryState('sort', { defaultValue: 'newest' });
}
```

## Anti-Patterns to Avoid

| Anti-Pattern | Instead |
|-------------|---------|
| Storing API data in useState | Use TanStack Query |
| Prop drilling through 4+ levels | Zustand store or composition |
| Context for frequently changing values | Zustand (Context causes full tree re-render) |
| One giant Redux/Zustand store | Split by domain |
| useEffect to sync state | Derive it or use useMemo |
| Fetching in useEffect | TanStack Query |
| Manual loading/error states | TanStack Query gives these for free |
| Duplicating server state in client | Single source: TanStack Query cache |

## Testing State

### Zustand — test the store directly

```tsx
import { useAppStore } from '@/stores/use-app-store';

beforeEach(() => {
  useAppStore.setState({ theme: 'light', sidebarOpen: true });
});

test('toggleSidebar flips the value', () => {
  useAppStore.getState().toggleSidebar();
  expect(useAppStore.getState().sidebarOpen).toBe(false);
});
```

### TanStack Query — use wrapper

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

test('useUsers returns user list', async () => {
  const { result } = renderHook(() => useUsers({}), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(3);
});
```
```

**Step 2: Update CLAUDE.md skills table**

Add row to the React Skills table:

```
| state-management | State architecture: Zustand, TanStack Query, URL state | "state management", "zustand", "data fetching" |
```

**Step 3: Commit**

```bash
git add .claude/skills/state-management/SKILL.md CLAUDE.md
git commit -m "feat: add state management skill (Zustand, TanStack Query, URL state)"
```

---

## Task 4: Form Handling Skill

**Files:**
- Create: `.claude/skills/form-handling/SKILL.md`
- Modify: `CLAUDE.md` (add to skills table)

**Step 1: Create the skill**

Create `.claude/skills/form-handling/SKILL.md`:

```markdown
---
name: form-handling
description: Form patterns with React Hook Form + Zod validation. Covers typed forms, field arrays, multi-step wizards, server actions, and accessible error handling.
triggers:
  - "form"
  - "form handling"
  - "react hook form"
  - "zod"
  - "validation"
  - "form validation"
  - "multi-step form"
  - "wizard"
---

# Form Handling Patterns

## When to Use This Skill

Use when:
- Building any form (login, registration, settings, data entry)
- Adding form validation
- Creating multi-step wizards
- Handling file uploads in forms
- Integrating forms with server actions (Next.js)

## Stack

- **React Hook Form** — Form state, submission, field registration
- **Zod** — Schema validation, type inference
- **@hookform/resolvers** — Connects Zod to RHF

```bash
pnpm add react-hook-form zod @hookform/resolvers
```

## 1. Basic Typed Form

```tsx
// src/schemas/contact.ts
import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  category: z.enum(['general', 'support', 'sales']),
});

export type ContactFormData = z.infer<typeof contactSchema>;
```

```tsx
// src/components/ContactForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contactSchema, type ContactFormData } from '@/schemas/contact';

export function ContactForm({ onSubmit }: { onSubmit: (data: ContactFormData) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      category: 'general',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" {...register('name')} aria-describedby="name-error" />
        {errors.name && (
          <p id="name-error" role="alert">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register('email')} aria-describedby="email-error" />
        {errors.email && (
          <p id="email-error" role="alert">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="message">Message</label>
        <textarea id="message" {...register('message')} aria-describedby="message-error" />
        {errors.message && (
          <p id="message-error" role="alert">{errors.message.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="category">Category</label>
        <select id="category" {...register('category')}>
          <option value="general">General</option>
          <option value="support">Support</option>
          <option value="sales">Sales</option>
        </select>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
```

## 2. Reusable Field Component

```tsx
// src/components/ui/FormField.tsx
import { type FieldError, type UseFormRegisterReturn } from 'react-hook-form';

interface FormFieldProps {
  label: string;
  name: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  type?: string;
  placeholder?: string;
}

export function FormField({
  label,
  name,
  registration,
  error,
  type = 'text',
  placeholder,
}: FormFieldProps) {
  const errorId = `${name}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'rounded-md border px-3 py-2',
          error ? 'border-red-500' : 'border-gray-300'
        )}
        {...registration}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-500">
          {error.message}
        </p>
      )}
    </div>
  );
}
```

## 3. Dynamic Field Arrays

```tsx
import { useFieldArray, useForm } from 'react-hook-form';

const invoiceSchema = z.object({
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().min(1),
    price: z.number().min(0),
  })).min(1, 'At least one item required'),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

function InvoiceForm() {
  const { control, register, handleSubmit } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { items: [{ description: '', quantity: 1, price: 0 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`items.${index}.description`)} />
          <input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
          <input type="number" {...register(`items.${index}.price`, { valueAsNumber: true })} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ description: '', quantity: 1, price: 0 })}>
        Add Item
      </button>
      <button type="submit">Submit</button>
    </form>
  );
}
```

## 4. Multi-Step Wizard

```tsx
// src/hooks/use-multi-step-form.ts
import { useState } from 'react';

export function useMultiStepForm(totalSteps: number) {
  const [step, setStep] = useState(0);

  return {
    step,
    totalSteps,
    isFirstStep: step === 0,
    isLastStep: step === totalSteps - 1,
    next: () => setStep((s) => Math.min(s + 1, totalSteps - 1)),
    back: () => setStep((s) => Math.max(s - 1, 0)),
    goTo: (s: number) => setStep(s),
  };
}
```

```tsx
// Multi-step form with per-step validation
const stepSchemas = [accountSchema, profileSchema, preferencesSchema];

function WizardForm() {
  const { step, isFirstStep, isLastStep, next, back } = useMultiStepForm(3);
  const form = useForm({
    resolver: zodResolver(stepSchemas[step]),
    mode: 'onTouched',
  });

  const onStepSubmit = form.handleSubmit((data) => {
    if (isLastStep) {
      submitAll(data);
    } else {
      next();
    }
  });

  return (
    <form onSubmit={onStepSubmit}>
      {step === 0 && <AccountStep form={form} />}
      {step === 1 && <ProfileStep form={form} />}
      {step === 2 && <PreferencesStep form={form} />}

      <div>
        {!isFirstStep && <button type="button" onClick={back}>Back</button>}
        <button type="submit">{isLastStep ? 'Submit' : 'Next'}</button>
      </div>
    </form>
  );
}
```

## 5. Server Action Integration (Next.js)

```tsx
// src/actions/contact.ts
'use server';
import { contactSchema } from '@/schemas/contact';

export async function submitContact(formData: FormData) {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  // Save to DB
  return { success: true };
}
```

```tsx
// Client form using server action
'use client';
import { useActionState } from 'react';
import { submitContact } from '@/actions/contact';

function ContactForm() {
  const [state, action, isPending] = useActionState(submitContact, null);

  return (
    <form action={action}>
      <input name="name" />
      {state?.errors?.name && <p role="alert">{state.errors.name[0]}</p>}
      <button type="submit" disabled={isPending}>Send</button>
    </form>
  );
}
```

## Accessibility Checklist

- [ ] Every input has a `<label>` with matching `htmlFor`/`id`
- [ ] Error messages use `role="alert"`
- [ ] Inputs use `aria-describedby` pointing to error message `id`
- [ ] Inputs use `aria-invalid={!!error}` when validation fails
- [ ] Submit button shows loading state and is `disabled` during submission
- [ ] Use `noValidate` on `<form>` to prevent browser validation (RHF handles it)
- [ ] Focus moves to first error field on failed submission

## Testing Forms

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('shows validation errors on empty submit', async () => {
  const onSubmit = vi.fn();
  render(<ContactForm onSubmit={onSubmit} />);

  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  expect(await screen.findByText(/name must be/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits valid data', async () => {
  const onSubmit = vi.fn();
  render(<ContactForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText(/name/i), 'John Doe');
  await userEvent.type(screen.getByLabelText(/email/i), 'john@example.com');
  await userEvent.type(screen.getByLabelText(/message/i), 'Hello, this is a test message');
  await userEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
    name: 'John Doe',
    email: 'john@example.com',
    message: 'Hello, this is a test message',
    category: 'general',
  }));
});
```
```

**Step 2: Update CLAUDE.md**

Add to skills table:

```
| form-handling | React Hook Form + Zod: typed forms, field arrays, wizards | "form", "validation", "react hook form" |
```

**Step 3: Commit**

```bash
git add .claude/skills/form-handling/SKILL.md CLAUDE.md
git commit -m "feat: add form handling skill (React Hook Form + Zod patterns)"
```

---

## Task 5: Authentication Flows Skill

**Files:**
- Create: `.claude/skills/auth-flows/SKILL.md`
- Modify: `CLAUDE.md` (add to skills table)

**Step 1: Create the skill**

Create `.claude/skills/auth-flows/SKILL.md`:

```markdown
---
name: auth-flows
description: Authentication patterns for React apps — Auth.js (NextAuth), Clerk, Supabase Auth. Covers session management, protected routes, role-based access, and OAuth flows.
triggers:
  - "authentication"
  - "auth"
  - "login"
  - "sign in"
  - "sign up"
  - "session"
  - "protected route"
  - "authorization"
  - "OAuth"
  - "clerk"
  - "supabase auth"
  - "nextauth"
---

# Authentication Flows

## When to Use This Skill

Use when:
- Adding auth to a React app
- Choosing between auth providers
- Implementing protected routes
- Building role-based access control
- Handling OAuth providers (Google, GitHub, etc.)
- Managing session/token lifecycle

## Decision Tree

```
What's your stack?
├── Next.js App Router
│   ├── Want managed auth (fastest) → Clerk
│   ├── Want self-hosted + flexible → Auth.js v5
│   └── Already using Supabase DB → Supabase Auth
├── Vite / SPA
│   ├── Want managed auth → Clerk
│   └── Already using Supabase → Supabase Auth
└── Any framework
    └── Custom backend → JWT + httpOnly cookies
```

## 1. Auth.js v5 (Next.js App Router)

### Setup

```bash
pnpm add next-auth@beta @auth/core
```

```ts
// src/auth.ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub,
    Google,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }).safeParse(credentials);

        if (!parsed.success) return null;

        const user = await getUserByEmail(parsed.data.email);
        if (!user || !await verifyPassword(parsed.data.password, user.passwordHash)) {
          return null;
        }
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    authorized: async ({ auth }) => !!auth,
    jwt: async ({ token, user }) => {
      if (user) token.role = user.role;
      return token;
    },
    session: async ({ session, token }) => {
      session.user.role = token.role as string;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
});
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

### Middleware (Protected Routes)

```ts
// src/middleware.ts
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/api/protected/:path*'],
};
```

### Server Component Access

```tsx
// Any server component
import { auth } from '@/auth';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <h1>Welcome, {session.user.name}</h1>;
}
```

### Client Component Access

```tsx
'use client';
import { useSession } from 'next-auth/react';

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <Skeleton />;
  if (!session) return <LoginButton />;

  return <span>{session.user.name}</span>;
}
```

## 2. Clerk (Managed Auth)

### Setup

```bash
pnpm add @clerk/nextjs  # or @clerk/clerk-react for Vite
```

```ts
// Next.js: src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher(['/dashboard(.*)', '/settings(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

```tsx
// Components — just use Clerk's built-in
import { SignIn, SignUp, UserButton } from '@clerk/nextjs';

// Protected page
import { auth } from '@clerk/nextjs/server';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  // ...
}
```

## 3. Supabase Auth

### Setup

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

## 4. Role-Based Access Control (RBAC)

```tsx
// src/lib/auth/roles.ts
export const ROLES = {
  admin: ['read', 'write', 'delete', 'manage-users'],
  editor: ['read', 'write'],
  viewer: ['read'],
} as const;

export type Role = keyof typeof ROLES;
export type Permission = (typeof ROLES)[Role][number];

export function hasPermission(role: Role, permission: Permission): boolean {
  return (ROLES[role] as readonly string[]).includes(permission);
}
```

```tsx
// src/components/auth/RequirePermission.tsx
interface RequirePermissionProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequirePermission({ permission, children, fallback = null }: RequirePermissionProps) {
  const { data: session } = useSession();
  if (!session || !hasPermission(session.user.role as Role, permission)) {
    return fallback;
  }
  return children;
}

// Usage
<RequirePermission permission="delete" fallback={<p>Not authorized</p>}>
  <DeleteButton />
</RequirePermission>
```

## Security Rules

- NEVER store tokens in localStorage (XSS vulnerable)
- Use httpOnly cookies for session tokens
- Always validate sessions server-side (never trust client-only checks)
- Implement CSRF protection (Auth.js does this automatically)
- Rate limit auth endpoints
- Hash passwords with bcrypt/argon2 (never store plaintext)
- Set short token expiry with refresh rotation
- Validate redirect URLs to prevent open redirect attacks
```

**Step 2: Update CLAUDE.md and commit**

```bash
git add .claude/skills/auth-flows/SKILL.md CLAUDE.md
git commit -m "feat: add authentication flows skill (Auth.js, Clerk, Supabase)"
```

---

## Task 6: Animation/Motion Skill

**Files:**
- Create: `.claude/skills/animation-motion/SKILL.md`
- Modify: `CLAUDE.md` (add to skills table)

**Step 1: Create the skill**

Create `.claude/skills/animation-motion/SKILL.md`:

```markdown
---
name: animation-motion
description: Animation patterns for React — Framer Motion, CSS transitions, page transitions, micro-interactions, scroll-driven animations, and reduced-motion accessibility.
triggers:
  - "animation"
  - "framer motion"
  - "transition"
  - "micro-interaction"
  - "page transition"
  - "scroll animation"
  - "motion"
  - "animate"
---

# Animation & Motion Patterns

## When to Use This Skill

Use when:
- Adding page transitions or route animations
- Building micro-interactions (hover, click, feedback)
- Creating scroll-driven animations
- Implementing loading states and skeleton screens
- Adding entrance/exit animations to lists or modals

## Decision Tree

```
What kind of animation?
├── Simple hover/focus effects → CSS transitions + Tailwind
├── Enter/exit animations → Framer Motion
├── Page transitions → Framer Motion + AnimatePresence
├── Scroll-driven → CSS scroll-timeline or Framer Motion useScroll
├── Complex orchestration → Framer Motion variants
└── Performance-critical (60fps) → CSS animations or Web Animations API
```

## 1. CSS-First (Tailwind)

Always try CSS first. Framer Motion adds ~30KB to your bundle.

```tsx
// Hover and focus transitions — zero JS
<button className="transition-colors duration-200 hover:bg-blue-600 focus-visible:ring-2">
  Click me
</button>

// Scale on hover
<div className="transition-transform duration-200 hover:scale-105">
  Card content
</div>

// Skeleton loading with pulse
<div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
```

## 2. Framer Motion — Core Patterns

```bash
pnpm add motion
```

### Basic Enter Animation

```tsx
import { motion } from 'motion/react';

// Fades in and slides up on mount
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  Content
</motion.div>
```

### Exit Animation (AnimatePresence)

```tsx
import { AnimatePresence, motion } from 'motion/react';

function Modal({ isOpen, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 rounded-lg bg-white p-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

### List Animations (Staggered)

```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function AnimatedList({ items }: { items: Item[] }) {
  return (
    <motion.ul variants={container} initial="hidden" animate="show">
      {items.map((i) => (
        <motion.li key={i.id} variants={item} layout>
          {i.name}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

### Page Transitions (Next.js App Router)

```tsx
// src/components/PageTransition.tsx
'use client';
import { motion } from 'motion/react';

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// Usage in layout.tsx
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
```

### Scroll-Driven

```tsx
import { useScroll, useTransform, motion } from 'motion/react';

function ParallaxHero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, -150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <motion.div style={{ y, opacity }} className="h-screen">
      <h1>Hero Content</h1>
    </motion.div>
  );
}
```

## 3. Reduced Motion (Accessibility)

ALWAYS respect `prefers-reduced-motion`. This is non-negotiable.

```tsx
// Hook
import { useReducedMotion } from 'motion/react';

function AnimatedCard() {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduce ? 0 : 0.3 }}
    >
      Content
    </motion.div>
  );
}

// CSS fallback
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Performance Rules

- CSS transitions for simple effects (hover, focus, color changes)
- Animate `transform` and `opacity` only (GPU-accelerated, no layout thrashing)
- Never animate `width`, `height`, `top`, `left` — use `transform: translate/scale` instead
- Use `will-change` sparingly and only on elements about to animate
- Keep Framer Motion animations under 300ms for UI feedback, 500ms max for transitions
- Use `layout` prop for layout animations instead of manual width/height
- Lazy-load Framer Motion if only used on specific pages
```

**Step 2: Update CLAUDE.md and commit**

```bash
git add .claude/skills/animation-motion/SKILL.md CLAUDE.md
git commit -m "feat: add animation/motion skill (Framer Motion, CSS transitions, a11y)"
```

---

## Task 7: SEO & Metadata Skill

**Files:**
- Create: `.claude/skills/seo-metadata/SKILL.md`
- Modify: `CLAUDE.md` (add to skills table)

**Step 1: Create the skill**

Create `.claude/skills/seo-metadata/SKILL.md`:

```markdown
---
name: seo-metadata
description: SEO patterns for React apps — Next.js Metadata API, Open Graph, structured data (JSON-LD), sitemap generation, and Core Web Vitals optimization.
triggers:
  - "SEO"
  - "metadata"
  - "open graph"
  - "og image"
  - "sitemap"
  - "structured data"
  - "json-ld"
  - "meta tags"
  - "social sharing"
---

# SEO & Metadata Patterns

## When to Use This Skill

Use when:
- Setting up metadata for a Next.js app
- Adding Open Graph / Twitter Card tags
- Implementing structured data (JSON-LD)
- Generating sitemaps and robots.txt
- Optimizing Core Web Vitals for SEO

## 1. Next.js Metadata API (App Router)

### Static Metadata

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: {
    default: 'My App',
    template: '%s | My App',  // pages will be "Page Title | My App"
  },
  description: 'A description of my app',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://example.com',
    siteName: 'My App',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'My App' }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@handle',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};
```

### Dynamic Metadata (Per Page)

```tsx
// src/app/blog/[slug]/page.tsx
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author.name],
      images: [{ url: post.coverImage, width: 1200, height: 630 }],
    },
  };
}
```

### Dynamic OG Image Generation

```tsx
// src/app/og/route.tsx
import { ImageResponse } from 'next/og';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') ?? 'My App';

  return new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', width: '100%', height: '100%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white', fontSize: 60, fontWeight: 700,
      }}>
        {title}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

## 2. Structured Data (JSON-LD)

```tsx
// src/components/seo/JsonLd.tsx
interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// Usage for an article
<JsonLd data={{
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: post.title,
  image: post.coverImage,
  datePublished: post.publishedAt,
  dateModified: post.updatedAt,
  author: {
    '@type': 'Person',
    name: post.author.name,
  },
}} />

// Usage for a product
<JsonLd data={{
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: product.name,
  image: product.images,
  description: product.description,
  offers: {
    '@type': 'Offer',
    price: product.price,
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
}} />
```

## 3. Sitemap & Robots

```tsx
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();

  const postUrls = posts.map((post) => ({
    url: `https://example.com/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    { url: 'https://example.com', lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: 'https://example.com/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    ...postUrls,
  ];
}
```

```tsx
// src/app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] },
    sitemap: 'https://example.com/sitemap.xml',
  };
}
```

## 4. Vite SPA SEO

SPAs need pre-rendering or SSR for SEO. Options:

```bash
# Option 1: vite-plugin-ssr (now Vike)
pnpm add vike vike-react

# Option 2: react-helmet-async for meta tags
pnpm add react-helmet-async
```

```tsx
import { Helmet } from 'react-helmet-async';

function BlogPost({ post }: { post: Post }) {
  return (
    <>
      <Helmet>
        <title>{post.title} | My App</title>
        <meta name="description" content={post.excerpt} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:image" content={post.coverImage} />
        <meta property="og:type" content="article" />
        <link rel="canonical" href={`https://example.com/blog/${post.slug}`} />
      </Helmet>
      <article>{/* ... */}</article>
    </>
  );
}
```

## SEO Checklist

- [ ] Unique `<title>` and `<meta description>` per page
- [ ] Open Graph tags (title, description, image, type)
- [ ] Twitter Card tags
- [ ] Canonical URLs on all pages
- [ ] Structured data (JSON-LD) for content types
- [ ] sitemap.xml generated and submitted
- [ ] robots.txt properly configured
- [ ] All images have alt text
- [ ] Core Web Vitals passing (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- [ ] No render-blocking resources
- [ ] Proper heading hierarchy (single h1 per page)
```

**Step 2: Update CLAUDE.md and commit**

```bash
git add .claude/skills/seo-metadata/SKILL.md CLAUDE.md
git commit -m "feat: add SEO & metadata skill (Next.js Metadata API, JSON-LD, OG images)"
```

---

## Task 8: API Client Generation Script

**Files:**
- Create: `scripts/generate-api-client.sh`
- Modify: `CLAUDE.md`

**Step 1: Create the script**

Create `scripts/generate-api-client.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# generate-api-client.sh — Generate typed API client from OpenAPI spec
# Uses openapi-typescript for types, optionally orval for full client
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

SPEC_PATH=""
OUTPUT_DIR="src/api/generated"
MODE="types"  # types | client

# --- Args ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --spec) SPEC_PATH="$2"; shift 2 ;;
    --output) OUTPUT_DIR="$2"; shift 2 ;;
    --client) MODE="client"; shift ;;
    --help)
      echo "Usage: generate-api-client.sh --spec <path-or-url> [--output dir] [--client]"
      echo ""
      echo "  --spec     Path to OpenAPI JSON/YAML or URL"
      echo "  --output   Output directory (default: src/api/generated)"
      echo "  --client   Generate full client with orval (default: types only)"
      exit 0
      ;;
    *) shift ;;
  esac
done

if [ -z "$SPEC_PATH" ]; then
  # Auto-detect spec file
  for f in openapi.json openapi.yaml openapi.yml api-spec.json api-spec.yaml; do
    if [ -f "$f" ]; then
      SPEC_PATH="$f"
      break
    fi
  done
fi

if [ -z "$SPEC_PATH" ]; then
  echo "✗ No OpenAPI spec found. Use --spec <path-or-url>"
  exit 1
fi

echo "=== API Client Generation ==="
echo "  Spec: $SPEC_PATH"
echo "  Output: $OUTPUT_DIR"
echo "  Mode: $MODE"
echo ""

mkdir -p "$OUTPUT_DIR"

if [ "$MODE" = "types" ]; then
  # Types only — lightweight
  if ! npx openapi-typescript --version &>/dev/null; then
    echo "Installing openapi-typescript..."
    pnpm add -D openapi-typescript
  fi

  echo "▸ Generating TypeScript types..."
  npx openapi-typescript "$SPEC_PATH" -o "$OUTPUT_DIR/api-types.ts"
  echo "✓ Types generated at $OUTPUT_DIR/api-types.ts"

else
  # Full client with orval
  if ! npx orval --version &>/dev/null; then
    echo "Installing orval..."
    pnpm add -D orval
  fi

  # Create orval config if missing
  if [ ! -f "orval.config.ts" ]; then
    cat > "orval.config.ts" << 'ORVALEOF'
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: { target: process.env.SPEC_PATH || './openapi.json' },
    output: {
      target: './src/api/generated/client.ts',
      client: 'react-query',
      mode: 'tags-split',
      override: {
        mutator: { path: './src/api/custom-instance.ts', name: 'customInstance' },
        query: { useQuery: true, useMutation: true },
      },
    },
  },
});
ORVALEOF
    echo "  Created orval.config.ts"
  fi

  echo "▸ Generating API client..."
  SPEC_PATH="$SPEC_PATH" npx orval
  echo "✓ Client generated at $OUTPUT_DIR/"
fi
```

**Step 2: Make executable, update CLAUDE.md, commit**

```bash
chmod +x scripts/generate-api-client.sh
git add scripts/generate-api-client.sh CLAUDE.md
git commit -m "feat: add API client generation script (openapi-typescript + orval)"
```

---

## Task 9: Responsive Screenshot Script

**Files:**
- Create: `scripts/check-responsive.sh`
- Modify: `CLAUDE.md`

**Step 1: Create the script**

Create `scripts/check-responsive.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# check-responsive.sh — Capture screenshots at all breakpoints
# Uses Playwright to screenshot pages at 5 viewport sizes
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

URL="${1:-http://localhost:3000}"
OUTPUT_DIR="${2:-.claude/visual-qa/screenshots/responsive}"
CONFIG_FILE=".claude/pipeline.config.json"

# Read breakpoints from config or use defaults
if [ -f "$CONFIG_FILE" ]; then
  BREAKPOINTS=$(node -e "
    const c = require('./$CONFIG_FILE');
    const bp = c.visualDiff?.breakpoints || { mobile: 375, tablet: 768, desktop: 1440, wide: 1920 };
    bp['small-mobile'] = 320;
    Object.entries(bp).forEach(([name, width]) => console.log(name + ':' + width));
  ")
else
  BREAKPOINTS="small-mobile:320
mobile:375
tablet:768
desktop:1440
wide:1920"
fi

echo "=== Responsive Screenshot Capture ==="
echo "  URL: $URL"
echo "  Output: $OUTPUT_DIR"
echo ""

mkdir -p "$OUTPUT_DIR"

# Generate Playwright script
SCRIPT_FILE=$(mktemp /tmp/responsive-XXXXXX.mjs)
cat > "$SCRIPT_FILE" << 'PWEOF'
import { chromium } from 'playwright';

const url = process.argv[2];
const outputDir = process.argv[3];
const breakpoints = JSON.parse(process.argv[4]);

const browser = await chromium.launch();
const context = await browser.newContext();

for (const [name, width] of Object.entries(breakpoints)) {
  const page = await context.newPage();
  await page.setViewportSize({ width: Number(width), height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const path = `${outputDir}/${name}-${width}px.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  ✓ ${name} (${width}px) → ${path}`);
  await page.close();
}

await browser.close();
PWEOF

# Build breakpoints JSON
BP_JSON=$(echo "$BREAKPOINTS" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const obj={};
    d.trim().split('\\n').forEach(l=>{const[n,w]=l.split(':');obj[n]=parseInt(w)});
    console.log(JSON.stringify(obj));
  });
")

npx playwright test --config=/dev/null 2>/dev/null || true
node "$SCRIPT_FILE" "$URL" "$OUTPUT_DIR" "$BP_JSON"

rm -f "$SCRIPT_FILE"

echo ""
echo "✓ Screenshots saved to $OUTPUT_DIR/"
echo "  Tip: Compare with visual-diff.js --batch for regression testing"
```

**Step 2: Make executable, update CLAUDE.md, commit**

```bash
chmod +x scripts/check-responsive.sh
git add scripts/check-responsive.sh CLAUDE.md
git commit -m "feat: add responsive screenshot script (5 breakpoints via Playwright)"
```

---

## Task 10: Post-Build Lighthouse CI Hook

**Files:**
- Modify: `.claude/settings.json` (add hook)
- Modify: `CLAUDE.md` (update hooks table)

**Step 1: Add hook to settings.json**

Add to the `PostToolUse[0].hooks` array after the existing 4 hooks:

```json
{
  "type": "command",
  "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"pnpm build\" && echo \"$TOOL_OUTPUT\" | grep -q \"built in\"; then CONFIG=\".claude/pipeline.config.json\"; if [ -f \"$CONFIG\" ]; then PERF=$(node -e \"const c=require(\\\"./\\\" + process.argv[1]); console.log(c.qualityGate?.lighthouse?.performance ?? 80)\" \"$CONFIG\"); A11Y=$(node -e \"const c=require(\\\"./\\\" + process.argv[1]); console.log(c.qualityGate?.lighthouse?.accessibility ?? 90)\" \"$CONFIG\"); echo \"[lighthouse-ci] Build done. Run Lighthouse audit — thresholds: performance=$PERF, accessibility=$A11Y. Use: npx lighthouse <url> --output=json\"; fi; fi'",
  "description": "Suggest Lighthouse audit after successful builds with threshold targets"
}
```

**Step 2: Update CLAUDE.md hooks table and commit**

```bash
git add .claude/settings.json CLAUDE.md
git commit -m "feat: add post-build Lighthouse CI hook with threshold targets"
```

---

## Task 11: Pre-Commit Bundle Size Guard Hook

**Files:**
- Modify: `.claude/settings.json` (add hook)
- Modify: `.claude/pipeline.config.json` (add bundleSize config)
- Modify: `CLAUDE.md`

**Step 1: Add config to pipeline.config.json**

```json
"bundleSize": {
  "enabled": true,
  "maxSizeKb": 200,
  "warnSizeKb": 150
}
```

**Step 2: Add hook to settings.json**

```json
{
  "type": "command",
  "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"git commit\"; then if [ -d \".next\" ] || [ -d \"dist\" ]; then BUILD_DIR=$( [ -d \".next\" ] && echo \".next\" || echo \"dist\" ); SIZE_KB=$(du -sk \"$BUILD_DIR\" 2>/dev/null | cut -f1); CONFIG=\".claude/pipeline.config.json\"; MAX=$(node -e \"const c=require(\\\"./\\\" + process.argv[1]); console.log(c.bundleSize?.maxSizeKb ?? 200)\" \"$CONFIG\" 2>/dev/null || echo 200); if [ \"$SIZE_KB\" -gt \"$((MAX * 1024))\" ]; then echo \"[bundle-guard] Bundle size ${SIZE_KB}KB exceeds ${MAX}MB limit. Run: ./scripts/check-bundle-size.sh\"; fi; fi; fi'",
  "description": "Warn if bundle size exceeds configured limit before commits"
}
```

**Step 3: Update CLAUDE.md and commit**

```bash
git add .claude/settings.json .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add pre-commit bundle size guard hook"
```

---

## Task 12: Post-Test Mutation Testing Reminder Hook

**Files:**
- Modify: `.claude/settings.json` (add hook)
- Modify: `.claude/pipeline.config.json` (add mutation config)
- Modify: `CLAUDE.md`

**Step 1: Add config**

```json
"mutationTesting": {
  "enabled": true,
  "tool": "stryker",
  "scoreThreshold": 80,
  "reminder": true
}
```

**Step 2: Add hook**

```json
{
  "type": "command",
  "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"vitest\" && echo \"$TOOL_OUTPUT\" | grep -qE \"Tests\\s+[0-9]+ passed\"; then CONFIG=\".claude/pipeline.config.json\"; REMINDER=$(node -e \"const c=require(\\\"./\\\" + process.argv[1]); console.log(c.mutationTesting?.reminder ?? false)\" \"$CONFIG\" 2>/dev/null || echo false); if [ \"$REMINDER\" = \"true\" ]; then echo \"[mutation-test] All tests passed. Consider running mutation tests to validate test quality: npx stryker run\"; fi; fi'",
  "description": "Suggest mutation testing after all tests pass"
}
```

**Step 3: Commit**

```bash
git add .claude/settings.json .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add post-test mutation testing reminder hook"
```

---

## Task 13: Error Boundary Architect Agent

**Files:**
- Create: `.claude/agents/error-boundary-architect.md`
- Modify: `CLAUDE.md` (update agent count and table)

**Step 1: Create the agent**

Create `.claude/agents/error-boundary-architect.md`:

```markdown
---
name: error-boundary-architect
description: Use this agent when designing error handling strategy, building React error boundaries, creating fallback UIs, integrating error reporting (Sentry), or implementing graceful degradation. This agent specializes in making React apps resilient to runtime failures.
tools:
  - Write
  - Read
  - MultiEdit
  - Bash
  - Grep
  - Glob
---

# Error Boundary Architect

You are an elite error handling specialist for React applications. Your mission is to make apps resilient — catching errors gracefully, showing helpful fallback UIs, reporting issues to monitoring services, and never leaving users on a white screen.

## Core Responsibilities

### 1. Error Boundary Design
- Granular error boundaries (page-level, section-level, component-level)
- Type-safe error boundary components with TypeScript
- Fallback UI hierarchy (full-page, section, inline)
- Recovery mechanisms (retry buttons, auto-refresh)
- Error boundary placement strategy (wrap at isolation points)

### 2. Error Reporting Integration
- Sentry setup and configuration for React
- Custom error context and breadcrumbs
- Source map upload for readable stack traces
- Performance monitoring integration
- User feedback collection on errors
- Environment-aware reporting (dev vs prod)

### 3. Graceful Degradation Patterns
- Suspense boundaries with error fallbacks
- Network error handling (offline detection, retry logic)
- API error handling (typed error responses, toast notifications)
- Form submission error recovery
- Image/media loading fallbacks
- Feature flag fallbacks

### 4. Developer Experience
- Error overlay in development
- Meaningful error messages (not just "Something went wrong")
- Error logging with context (component tree, user action, state)
- Testing error boundaries (deliberately throw in tests)

## Error Boundary Hierarchy

```
App Error Boundary (catches unhandled — shows full-page error)
├── Layout Error Boundary (sidebar/nav failures)
│   ├── Page Error Boundary (per route — shows page-level fallback)
│   │   ├── Section Error Boundary (data sections — retry button)
│   │   │   └── Component Error Boundary (individual widgets — inline fallback)
│   │   └── Suspense Boundary (loading states)
│   └── Error Toast Provider (non-fatal notifications)
└── Global Error Handler (window.onerror, unhandledrejection)
```

## Standard Patterns

### Base Error Boundary
```tsx
'use client';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.reset);
      }
      return this.props.fallback ?? <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
```

## Quality Standards
- Every route has an error boundary
- Fallback UIs are styled and helpful (not blank)
- Error messages are user-friendly (no stack traces in production)
- All errors are reported with context
- Error recovery paths are tested
- Offline states are handled
```

**Step 2: Update CLAUDE.md and commit**

```bash
git add .claude/agents/error-boundary-architect.md CLAUDE.md
git commit -m "feat: add error boundary architect agent"
```

---

## Task 14: Migration Specialist Agent

**Files:**
- Create: `.claude/agents/migration-specialist.md`
- Modify: `CLAUDE.md`

**Step 1: Create the agent**

Create `.claude/agents/migration-specialist.md`:

```markdown
---
name: migration-specialist
description: Use this agent when upgrading React versions, migrating between frameworks (CRA to Vite, Pages to App Router), updating major dependencies, running codemods, or handling breaking changes. This agent specializes in safe, incremental migration strategies.
tools:
  - Write
  - Read
  - MultiEdit
  - Bash
  - Grep
  - Glob
  - WebSearch
  - WebFetch
---

# Migration Specialist

You are an elite migration engineer for React applications. Your mission is to safely upgrade frameworks, libraries, and patterns without breaking production. You favor incremental migration over big-bang rewrites.

## Core Responsibilities

### 1. Framework Migrations
- Create React App → Vite
- Next.js Pages Router → App Router
- Next.js version upgrades (13 → 14 → 15)
- React version upgrades (17 → 18 → 19)
- Remix → Next.js or vice versa

### 2. Library Migrations
- Redux → Zustand
- Axios → fetch / ky
- Moment.js → date-fns / dayjs
- styled-components → Tailwind CSS
- Jest → Vitest
- Enzyme → React Testing Library

### 3. Migration Strategy
1. **Audit** — Identify all breaking changes from changelogs
2. **Branch** — Create migration branch with clear scope
3. **Codemod** — Run official codemods first (jscodeshift, next-codemod)
4. **Manual fixes** — Address what codemods miss
5. **Test** — Run full test suite after each step
6. **Verify** — Visual regression testing for UI changes
7. **Incremental commit** — One logical change per commit

### 4. Safety Practices
- Never migrate everything at once
- Keep old and new patterns running side-by-side when possible
- Use feature flags for gradual rollout
- Document every breaking change and its fix
- Run codemods in dry-run mode first
- Check bundle size before and after
- Verify all environment variables still work

## Migration Checklist Template
- [ ] Read full changelog/migration guide
- [ ] Run official codemods (dry-run first)
- [ ] Update package.json dependencies
- [ ] Fix TypeScript errors
- [ ] Fix ESLint errors
- [ ] Run test suite
- [ ] Check bundle size
- [ ] Visual regression test
- [ ] Test in all target browsers
- [ ] Update CI/CD configuration
- [ ] Update documentation
```

**Step 2: Commit**

```bash
git add .claude/agents/migration-specialist.md CLAUDE.md
git commit -m "feat: add migration specialist agent"
```

---

## Task 15: Internationalization Engineer Agent

**Files:**
- Create: `.claude/agents/i18n-engineer.md`
- Modify: `CLAUDE.md`

**Step 1: Create the agent**

Create `.claude/agents/i18n-engineer.md`:

```markdown
---
name: i18n-engineer
description: Use this agent when adding internationalization (i18n) to a React app, setting up locale management, implementing RTL support, or handling translations. Specializes in next-intl, react-i18next, and ICU message format.
tools:
  - Write
  - Read
  - MultiEdit
  - Bash
  - Grep
  - Glob
  - WebSearch
---

# Internationalization Engineer

You are an elite i18n specialist for React applications. Your mission is to make apps work beautifully in every language and locale, with proper text direction, number/date formatting, and translation management.

## Core Responsibilities

### 1. i18n Library Setup
- **Next.js**: next-intl (recommended) or next-i18next
- **Vite/SPA**: react-i18next with i18next
- ICU message format for plurals, gender, numbers
- Namespace-based translation organization

### 2. Translation Management
- JSON-based translation files per locale
- Namespace splitting (common, auth, dashboard, errors)
- Interpolation and pluralization patterns
- Missing translation fallback chains
- Translation key naming conventions (feature.component.element)

### 3. Locale-Aware Formatting
- Dates: Intl.DateTimeFormat or date-fns locale adapters
- Numbers: Intl.NumberFormat (currency, percentages)
- Relative time: Intl.RelativeTimeFormat
- Lists: Intl.ListFormat
- Sorting: Intl.Collator

### 4. RTL Support
- CSS logical properties (margin-inline-start, not margin-left)
- Tailwind CSS RTL plugin
- dir="rtl" attribute management
- Bidirectional text handling
- Icon mirroring for directional icons

### 5. URL Strategy
- Path prefix: /en/about, /fr/about (recommended for SEO)
- Subdomain: en.example.com, fr.example.com
- Cookie/header-based detection
- Default locale handling (with or without prefix)

## Quality Standards
- No hardcoded strings in components
- All user-facing text goes through translation function
- Pluralization handled via ICU format (not ternary operators)
- Date/number formatting uses Intl APIs
- RTL layout tested with actual RTL content
- Translation files have no unused keys
- Screenshots captured per locale for visual verification
```

**Step 2: Commit**

```bash
git add .claude/agents/i18n-engineer.md CLAUDE.md
git commit -m "feat: add internationalization engineer agent"
```

---

## Task 16: Sentry/Error Monitoring Integration

**Files:**
- Modify: `.claude/pipeline.config.json` (add errorMonitoring config)
- Modify: `CLAUDE.md` (document integration)

**Step 1: Add config to pipeline.config.json**

```json
"errorMonitoring": {
  "provider": "sentry",
  "dsn": "",
  "environment": "production",
  "sampleRate": 1.0,
  "tracesSampleRate": 0.2,
  "enableInDev": false,
  "sourceMapUpload": true
}
```

**Step 2: Update CLAUDE.md with integration notes**

Add to the MCP Server Integration section:

```
- **Sentry** - Error monitoring (configured via pipeline.config.json, setup by error-boundary-architect agent)
```

**Step 3: Commit**

```bash
git add .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add Sentry error monitoring configuration to pipeline config"
```

---

## Task 17: Deploy Preview Integration

**Files:**
- Modify: `.claude/pipeline.config.json` (add deployPreview config)
- Modify: `CLAUDE.md`

**Step 1: Add config to pipeline.config.json**

```json
"deployPreview": {
  "enabled": true,
  "provider": "vercel",
  "autoDeployOnPR": true,
  "runVisualQAOnPreview": true,
  "runLighthouseOnPreview": true
}
```

**Step 2: Update CLAUDE.md and commit**

```bash
git add .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add deploy preview configuration for Vercel/Netlify"
```

---

## Task 18: Pipeline Phase 8.5 — Responsive Verification

**Files:**
- Modify: `docs/figma-to-react/README.md` (add phase)
- Modify: `CLAUDE.md` (update pipeline description)
- Modify: `.claude/pipeline.config.json` (add responsive config)

**Step 1: Add config**

```json
"responsiveVerification": {
  "enabled": true,
  "breakpoints": {
    "small-mobile": 320,
    "mobile": 375,
    "tablet": 768,
    "desktop": 1440,
    "wide": 1920
  },
  "diffThreshold": 0.03,
  "blocking": false
}
```

**Step 2: Update pipeline documentation**

Add between Phase 8 (Cross-Browser) and Phase 9 (Quality Gate) in CLAUDE.md:

```
  [8.5] RESPONSIVE  → check-responsive.sh → screenshots at 5 breakpoints (non-blocking)
```

**Step 3: Commit**

```bash
git add .claude/pipeline.config.json CLAUDE.md docs/figma-to-react/README.md
git commit -m "feat: add responsive verification as pipeline phase 8.5"
```

---

## Task 19: Mutation Testing in Quality Gate

**Files:**
- Modify: `.claude/pipeline.config.json` (add to qualityGate)
- Modify: `CLAUDE.md`

**Step 1: Update qualityGate config in pipeline.config.json**

Add to the `qualityGate` object:

```json
"mutationScore": {
  "enabled": false,
  "threshold": 80,
  "tool": "stryker",
  "blocking": false
}
```

Note: `enabled: false` by default — mutation testing is slow and opt-in. The hook from Task 12 reminds to run it.

**Step 2: Update CLAUDE.md quality gate description**

Add to the Quality Gate line:

```
  [9] QUALITY GATE  → coverage + types + build + tokens + Lighthouse + mutation score (opt-in)
```

**Step 3: Commit**

```bash
git add .claude/pipeline.config.json CLAUDE.md
git commit -m "feat: add mutation testing support to quality gate (opt-in)"
```

---

## CLAUDE.md Final Updates

After all 19 tasks, CLAUDE.md should reflect:

### Updated Counts
- **47 custom agents** (was 44, +3: error-boundary-architect, migration-specialist, i18n-engineer)
- **15 React skills** (was 10, +5: state-management, form-handling, auth-flows, animation-motion, seo-metadata)
- **7 automated hooks** (was 4, +3: lighthouse-ci, bundle-guard, mutation-reminder)
- **18 scripts** (was 14, +4: check-dead-code, check-security, generate-api-client, check-responsive)
- Pipeline phases: 12 (added 8.5 responsive)

### Updated Tables
- Agent table: add Engineering row count → 10, add new agents
- Skills table: add 5 new rows
- Hooks table: add 3 new rows
- Scripts: add 4 new entries
- Pipeline config sections: add deadCode, security, bundleSize, mutationTesting, errorMonitoring, deployPreview, responsiveVerification

### Final Commit

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with all 19 new framework capabilities"
```

---

## Execution Summary

| Phase | Tasks | Commits |
|-------|-------|---------|
| P1 Scripts | 1-2 | 2 |
| P1 Skills | 3-4 | 2 |
| P1 Hook | 10 | 1 |
| P2 Skills | 5, 7, 9 | 3 |
| P2 Scripts | 8-9 | 2 |
| P2 Hooks | 11 | 1 |
| P2 Agents | 13-14 | 2 |
| P2 Pipeline | 18 | 1 |
| P3 Skill | 6, 8 | 2 |
| P3 Hook | 12 | 1 |
| P3 Agent | 15 | 1 |
| P3 Integrations | 16-17 | 2 |
| P3 Pipeline | 19 | 1 |
| Final | CLAUDE.md update | 1 |
| **Total** | **19 tasks** | **22 commits** |
