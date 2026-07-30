import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./packages/frontend/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
