import { defineConfig } from "drizzle-kit";

// Generation is offline; migration requires an explicitly configured database.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/catalog-schema.ts"],
  out: "./drizzle",
  ...((process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL)
    ? {
        dbCredentials: {
          url: (process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL)!,
        },
      }
    : {}),
  strict: true,
  verbose: false,
});
