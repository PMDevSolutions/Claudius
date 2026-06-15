// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightVersions from "starlight-versions";

// https://astro.build/config
export default defineConfig({
  site: "https://claudius-docs.pages.dev",
  integrations: [
    starlight({
      title: "Claudius",
      plugins: [
        // Archives a copy of the docs per major release line. When v2 ships,
        // add a "2.x" entry here; the previous line stays browsable via the
        // version switcher.
        starlightVersions({
          versions: [{ slug: "1.x", label: "v1.x" }],
        }),
      ],
      description:
        "Embeddable AI chat widget powered by Claude. React component + standalone script embed, backed by Cloudflare Workers.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/PMDevSolutions/Claudius",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/PMDevSolutions/Claudius/edit/main/docs/",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { slug: "getting-started/introduction" },
            { slug: "getting-started/quick-start" },
            { slug: "getting-started/scaffolding" },
            { slug: "getting-started/local-development" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { autogenerate: { directory: "configuration" } },
            { label: "Theme editor", link: "/theme-editor/" },
          ],
        },
        {
          label: "Deployment",
          items: [{ autogenerate: { directory: "deployment" } }],
        },
        {
          label: "Plugins & Tools",
          items: [{ autogenerate: { directory: "plugins" } }],
        },
        { label: "RAG", items: [{ autogenerate: { directory: "rag" } }] },
        {
          label: "Channels",
          items: [{ autogenerate: { directory: "channels" } }],
        },
        {
          label: "API Reference",
          items: [{ autogenerate: { directory: "api" } }],
        },
        {
          label: "Migration Guides",
          items: [{ autogenerate: { directory: "migration" } }],
        },
        { label: "FAQ", slug: "faq" },
      ],
    }),
  ],
});
