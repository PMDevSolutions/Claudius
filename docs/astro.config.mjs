// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://claudius-docs.pages.dev",
  integrations: [
    starlight({
      title: "Claudius",
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
            { slug: "getting-started/local-development" },
          ],
        },
        {
          label: "Configuration",
          items: [{ autogenerate: { directory: "configuration" } }],
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
