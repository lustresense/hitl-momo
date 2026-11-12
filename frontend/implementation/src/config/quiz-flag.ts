/**
 * Quiz/survey toggle for the closing. Order: the server's value when it gives one (the class response, once Dias
 * adds it; see contracts/QUIZ_TOGGLE_PROPOSAL.md), then the env flag, then OFF. Any other env text counts as unset.
 */
export function isQuizEnabled(server?: boolean | null): boolean {
  if (typeof server === "boolean") return server;
  const env = parseFlag(process.env.NEXT_PUBLIC_QUIZ_ENABLED);
  return env ?? false;
}

function parseFlag(value: string | undefined): boolean | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}
