export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use a password of at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}
