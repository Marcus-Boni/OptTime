import type { AzureDevOpsCommit } from "@/types/azure-devops";

type CommitAuthorIdentityInput = {
  configuredAuthor?: string | null;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
};

function normalizeCommitAuthor(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function buildCommitAuthorCandidates({
  configuredAuthor,
  fallbackEmail,
  fallbackName,
}: CommitAuthorIdentityInput) {
  const rawCandidates = configuredAuthor
    ? [configuredAuthor]
    : [fallbackEmail, fallbackName];

  return Array.from(
    new Set(
      rawCandidates
        .map((candidate) => candidate?.trim())
        .filter((candidate): candidate is string => Boolean(candidate))
        .map(normalizeCommitAuthor),
    ),
  );
}

export function matchesCommitAuthor(
  commit: Pick<AzureDevOpsCommit, "authorEmail" | "authorName">,
  authorCandidates: string[],
) {
  if (authorCandidates.length === 0) {
    return false;
  }

  const commitAuthorValues = [commit.authorEmail, commit.authorName]
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate))
    .map(normalizeCommitAuthor);

  return commitAuthorValues.some((value) => authorCandidates.includes(value));
}
