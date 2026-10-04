import "server-only";
import { accountInput } from "../schemas";
import type { z } from "zod";

export class AdminOperationError extends Error {}
type AccountInput = z.infer<typeof accountInput>;
export interface ProvisionDependencies {
  usernameExists(username: string): Promise<boolean>;
  createAuth(values: AccountInput): Promise<string>;
  activate(id: string, values: AccountInput): Promise<void>;
}
export async function provisionAccount(
  input: unknown,
  dependencies: ProvisionDependencies,
) {
  const values = accountInput.parse(input);
  if (await dependencies.usernameExists(values.username))
    throw new AdminOperationError("That username is already in use.");
  let id: string;
  try {
    id = await dependencies.createAuth(values);
  } catch {
    throw new AdminOperationError(
      "Account creation failed. Check whether that email already has an account and whether the password meets Supabase requirements.",
    );
  }
  try {
    await dependencies.activate(id, values);
  } catch {
    throw new AdminOperationError(
      `Auth account created but activation failed. Refresh Users and finish setup for inactive account ${id}. Do not recreate it.`,
    );
  }
  return id;
}
