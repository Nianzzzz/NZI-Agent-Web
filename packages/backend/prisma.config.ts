import { defineConfig } from "prisma/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, ".env") });

const schemaPath = path.join(here, "..", "..", "prisma", "schema.prisma");

export default defineConfig({
  schema: schemaPath,
});
