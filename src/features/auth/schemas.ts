import { z } from "zod";
import { profileValues } from "@/features/admin/schemas";
import { passwordSchema } from "@/lib/auth/password-policy";

export const accountEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const resetIdentifier = z.string().trim().toLowerCase().min(1).max(254);
export const passwordChangeInput = z
  .object({
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });
export const registrationInput = z
  .object({
    display_name: profileValues.shape.display_name,
    username: profileValues.shape.username,
    email: accountEmail,
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });
