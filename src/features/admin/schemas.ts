import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password-policy";
export const roles = ["scout", "strategy", "admin"] as const;
export const profileValues = z.object({
  display_name: z.string().trim().min(1).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,40}$/),
  role: z.enum(roles),
  active: z.boolean(),
  approval_pending: z.boolean().default(false),
});
export const temporaryPassword = passwordSchema;
export const accountInput = profileValues.omit({ active: true }).extend({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: temporaryPassword,
});
export const expectedProfile = profileValues.extend({
  display_name: z.string().max(100),
  must_change_password: z.boolean().optional(),
});
export type ProfileValues = z.infer<typeof profileValues>;
export type AdminState = { error?: string; message?: string };
