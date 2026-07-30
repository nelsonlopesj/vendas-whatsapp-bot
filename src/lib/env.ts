import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  NEXTAUTH_SECRET: z.string().default("ezflow-nextauth-secret-change-me"),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
});

export const env = envSchema.parse(process.env);
