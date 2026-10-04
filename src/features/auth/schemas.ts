import { z } from "zod";
import { profileValues, temporaryPassword } from "@/features/admin/schemas";

export const accountEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const resetIdentifier = z.string().trim().toLowerCase().min(1).max(254);
export const passwordChangeInput = z
  .object({
    password: temporaryPassword,
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
    password: temporaryPassword,
    confirm_password: z.string(),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });
