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

## Adding a New Locale

Claudius ships first-party translations for English, Spanish, French, and German. Every UI string lives in `widget/src/locales/`, and `en.ts` is the single source of truth for the set of keys. Adding a language is welcome and self-contained.

### Steps

1. **Copy the English file.** Use `widget/src/locales/en.ts` as your starting point so you have the complete, correctly typed key set:

   ```bash
   cp widget/src/locales/en.ts widget/src/locales/pt.ts
   ```

2. **Translate every value.** Rename the exported constant (e.g. `export const pt`) and translate each string. Keep the `: ClaudiusTranslations` type annotation, it makes any missing key a compile error.

3. **Register the locale** in `widget/src/locales/index.ts`:
   - Add the code to the `LocaleCode` union (e.g. `"pt"`).
   - Add the imported constant to the `locales` registry.

   Detection matches on the primary subtag, so registering `pt` automatically covers `pt-BR`, `pt-PT`, and so on from `<html lang>` or `navigator.language`.

4. **Add it to the Storybook switcher** in `widget/.storybook/preview.ts` by appending an entry to `LOCALE_ITEMS`. This lets reviewers eyeball your translation across every component via the **Locale** toolbar:

   ```bash
   cd widget && pnpm storybook
   ```

5. **Verify** from the `widget/` directory:

   ```bash
   pnpm test        # the key-parity test fails if any key is missing or extra
   pnpm typecheck
   ```

### Strings that need cultural review

Translate these for tone and register, not word-for-word. A literal translation often reads as cold or robotic, and formality conventions differ by language:

- **`welcomeMessage` and `subtitle`** — the greeting sets the bot's warmth. Choose the register your audience expects: informal (Spanish *tú*, German *du*) reads friendlier, while formal (Spanish *usted*, French *vous*, German *Sie*) reads more professional. The shipped locales use informal Spanish and formal French/German; stay internally consistent with whichever you pick.
- **`error*` strings** — error tone varies by culture between apologetic and matter-of-fact. Keep them reassuring and actionable rather than blunt, and match the formality you chose for the greetings.

If you are unsure about register, note it in your pull request so a native speaker can weigh in during review.

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

## Versioning, Releases, and Milestones

Releases are fully automated with [release-please](https://github.com/googleapis/release-please):
merging to `main` accumulates conventional commits into a release PR, and
merging that PR cuts the tag, GitHub Release, and `CHANGELOG.md` entry.
`feat:` bumps the minor version, `fix:` the patch, and a `!`/`BREAKING CHANGE`
commit the major. Version numbers are therefore **outputs of the commit
history, not plans**.

### Publishing to npm

The same release also **publishes the widget to npm** as
[`claudius-chat-widget`](https://www.npmjs.com/package/claudius-chat-widget). The
publish step in `.github/workflows/release-please.yml` runs only when a release is
cut, builds the dual ESM/CJS package, and authenticates with an `NPM_TOKEN`
repository secret (publishing with provenance):

- Create an **Automation** access token — or a **granular** token scoped to
  publish `claudius-chat-widget` — at npmjs.com → *Access Tokens*.
- Store it as a repository Actions secret:

  ```bash
  gh secret set NPM_TOKEN --repo PMDevSolutions/Claudius
  ```

The very first version must be published manually once, because release-please
only triggers the publish step on a *new* release after the workflow is wired up:

```bash
npm login
cd widget && pnpm build && npm publish --access public
```

(`--provenance` is omitted for the local manual publish; it requires the OIDC
token only available in CI.) Every release after that publishes automatically.

Two conventions follow from that:

- **Milestones are themes, not version numbers.** Issues are grouped into
  thematic milestones (e.g. *Developer Experience & Distribution*,
  *Conversation Intelligence*, *Quality & Hardening*) with due dates. Don't
  create milestones named after unreleased minor versions — release-please
  will assign whatever number the commits dictate, and the milestone name
  will drift. The one exception is a deliberately gated **major** (e.g.
  *v2.0 - Multi-Channel & Enterprise*): breaking changes are a real product
  boundary because the CDN `@1` channel never auto-serves a new major.
- **Issues associate with releases through commits, not milestones.** Put
  `Closes #N` in the PR description and reference the issue in commit bodies
  where useful; the changelog and GitHub Release then record which version
  actually shipped the work.

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
