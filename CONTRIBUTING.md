# Contributing to Claudius

Welcome, and thank you for your interest in contributing to Claudius. Named after the Roman Emperor Claudius, known for infrastructure, administration, and expanding connectivity across the empire, this project strives to bring those same qualities to modern app development. Claudius is an embeddable AI chat widget built by PMDevSolutions, and contributions from the community are what make it better.

Whether you are fixing a bug, adding a feature, improving documentation, or suggesting an idea, we appreciate your time and effort.

---

## Getting Started

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/claudius.git
   cd claudius
   ```

2. **Install pnpm** if you do not already have it. This project uses pnpm exclusively.

   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

3. **Install dependencies:**

   ```bash
   cd widget && pnpm install
   cd ../worker && pnpm install
   ```

4. **Set up local development:**

   ```bash
   cp worker/.dev.vars.example worker/.dev.vars
   # Add your Anthropic API key to .dev.vars
   ```

---

## Development Setup

Run the widget and worker in separate terminals:

**Terminal 1 - Worker:**
```bash
cd worker
pnpm dev
```

**Terminal 2 - Widget:**
```bash
cd widget
pnpm dev
```

Open http://localhost:5173 to test.

### Running Tests

```bash
# Widget tests
cd widget && pnpm test

# Worker tests
cd worker && pnpm test
```

All tests must pass before a pull request will be reviewed.

---

## Branch Naming Conventions

Use the following prefixes when creating branches:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features or capabilities | `feat/message-reactions` |
| `fix/` | Bug fixes | `fix/cors-preflight` |
| `docs/` | Documentation updates | `docs/deployment-guide` |
| `chore/` | Maintenance, refactoring, tooling | `chore/upgrade-vitest` |

Branch names should be lowercase, use hyphens as separators, and be descriptive.

---

## Pull Request Process

1. **Create a focused branch** from `main` using the naming conventions above.

2. **Make your changes.** Write tests for any new functionality and ensure existing tests continue to pass.

3. **Run tests locally** before pushing:

   ```bash
   cd widget && pnpm test
   cd ../worker && pnpm test
   ```

4. **Push your branch** and open a pull request against `main`.

5. **Write a clear pull request title and description:**
   - The title should be concise and under 70 characters.
   - The description should explain what changed and why.
   - Reference any related issues (e.g., `Closes #42`).

6. **Use conventional commit messages.** Examples:

   ```
   feat: add typing indicator animation
   fix: resolve CORS preflight issue
   docs: add deployment instructions
   chore: update dependencies
   ```

7. **All CI checks must pass.** Pull requests with failing tests will not be merged until resolved.

8. **Be responsive to review feedback.** Reviewers may request changes.

---

## Project Structure

```
claudius/
├── widget/          # React chat widget (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/   # React components
│   │   └── hooks/        # Custom hooks (useChat)
│   └── package.json
├── worker/          # Cloudflare Workers backend (Hono + Anthropic SDK)
│   ├── src/
│   │   ├── index.ts          # API routes
│   │   ├── chat.ts           # Claude integration
│   │   └── system-prompt.ts  # Bot personality
│   └── package.json
└── package.json     # Root package
```

---

## Code of Conduct

We follow standard open source etiquette. All contributors are expected to:

- Be respectful and constructive in all interactions.
- Provide clear, actionable feedback in code reviews.
- Assume good intent from other contributors.
- Keep discussions focused on the project and its goals.

Harassment, discrimination, and disruptive behavior will not be tolerated.

---

Thank you for contributing to Claudius. Your work helps make AI-powered chat widgets more accessible, reliable, and efficient for everyone.
