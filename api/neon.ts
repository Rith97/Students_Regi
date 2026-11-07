import { defineConfig } from "@neon/config/v1";

// Student Registration backend: one Function for the admin app and teacher
// portal, plus a private bucket for student photos. Postgres comes with every branch.
export default defineConfig({
  buckets: {
    "student-photos": { access: "private" },
  },
  functions: {
    studentsapi: {
      name: "Student Registration API",
      source: "src/index.ts",
    },
  },
});
