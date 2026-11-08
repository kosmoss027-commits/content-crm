import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Все страницы зависят от вошедшего пользователя, поэтому рендерим их на каждый запрос,
  // без Cache Components. Включим точечно, когда появятся тяжёлые общие данные.
  cacheComponents: false,
  // Готовый бинарник ffmpeg из npm — не собирать в бандл, брать из node_modules как есть.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
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
