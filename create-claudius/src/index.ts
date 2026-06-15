import { cancel, confirm, isCancel, log, note, outro } from "@clack/prompts";
import pc from "picocolors";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTemplateId, TEMPLATE_IDS } from "./frameworks.js";
import { runPrompts, type ProvidedOptions } from "./prompts.js";
import { isNonEmptyDir, scaffold } from "./scaffold.js";

const HELP = `
${pc.bold("create-claudius")} — scaffold a Claudius AI chat widget project

${pc.bold("Usage")}
  npm create claudius@latest [dir] -- [options]

${pc.bold("Options")}
  -t, --template <id>   vanilla | react | next
      --theme <name>    auto | light | dark | default | minimal | playful | corporate
      --accent <hex>    accent color, e.g. #4f46e5
      --api-url <url>   worker chat endpoint
      --worker          also scaffold a Cloudflare Worker
      --pm <name>       package manager for the next-steps hint (npm|pnpm|yarn|bun)
  -y, --yes             accept defaults for anything not provided
  -h, --help            show this help
  -v, --version         show version
`;

function selfVersion(): string {
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function detectPm(explicit?: string): string {
  if (explicit) return explicit;
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      template: { type: "string", short: "t" },
      theme: { type: "string" },
      accent: { type: "string" },
      "api-url": { type: "string" },
      worker: { type: "boolean" },
      pm: { type: "string" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.version) {
    console.log(selfVersion());
    return;
  }

  const provided: ProvidedOptions = {
    projectName: positionals[0],
    theme: values.theme,
    accent: values.accent,
    apiUrl: values["api-url"],
    worker: values.worker,
    yes: values.yes,
  };

  if (values.template !== undefined) {
    if (!isTemplateId(values.template)) {
      console.error(
        pc.red(`Unknown template "${values.template}". Choose one of: ${TEMPLATE_IDS.join(", ")}`),
      );
      process.exit(1);
    }
    provided.template = values.template;
  }

  const result = await runPrompts(provided);

  const projectDir = resolve(process.cwd(), result.projectName);
  if (isNonEmptyDir(projectDir)) {
    if (provided.yes) {
      log.error(`Target directory "${result.projectName}" already exists and is not empty.`);
      process.exit(1);
    }
    const proceed = await confirm({
      message: `Directory "${result.projectName}" is not empty. Write into it anyway?`,
      initialValue: false,
    });
    if (isCancel(proceed) || !proceed) {
      cancel("Aborted.");
      process.exit(0);
    }
  }

  await scaffold({ ...result, projectDir, widgetVersion: `^${selfVersion()}` });

  const pm = detectPm(values.pm);
  const dev = pm === "npm" ? "npm run dev" : `${pm} dev`;
  const steps = [`cd ${result.projectName}`, `${pm} install`, dev];
  if (result.worker) {
    steps.push(
      "",
      pc.dim("# then deploy the worker"),
      "cd worker",
      `${pm} install`,
      "npx wrangler kv namespace create RATE_LIMIT",
      "npx wrangler secret put ANTHROPIC_API_KEY",
      "npx wrangler deploy",
    );
  }
  note(steps.join("\n"), "Next steps");
  outro(pc.green("Done! Happy building with Claudius."));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
