import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Все страницы зависят от вошедшего пользователя, поэтому рендерим их на каждый запрос,
  // без Cache Components. Включим точечно, когда появятся тяжёлые общие данные.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
