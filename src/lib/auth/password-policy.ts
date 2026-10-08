import { z } from "zod";

/** Shared by new-password forms and server validation; passwords are never trimmed. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_MIN_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
export const PASSWORD_LENGTH_HINT = `${PASSWORD_MIN_MESSAGE} Maximum ${MAX_PASSWORD_LENGTH} characters.`;
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_MESSAGE)
  .max(
    MAX_PASSWORD_LENGTH,
    `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
  );
