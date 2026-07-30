import { defineConfig } from "prisma/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Prisma CLI runs from the workspace root, so __dirname may be unexpected.
// Hardcode the schema path to avoid resolution issues.
const schemaPath = path.join(
  fileURLToPath("file:///D:/AIcode/claude/NZI-Agent-Web/prisma/schema.prisma")
);

export default defineConfig({
  schema: schemaPath,
});
