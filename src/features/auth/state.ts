export type AuthState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};
