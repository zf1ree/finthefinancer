import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fin",
    short_name: "Fin",
    description: "Seu analista financeiro pessoal.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#0f6f66",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
