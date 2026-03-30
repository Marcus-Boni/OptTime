import { dbPool } from "@/lib/db";

export type StoredAzureDevopsConfig = {
  id: string;
  userId: string;
  organizationUrl: string;
  pat: string;
  status: string;
  commitAuthor: string | null;
};

type SaveAzureDevopsConfigInput = {
  userId: string;
  organizationUrl: string;
  pat: string;
  status?: string;
  commitAuthor: string;
};

export async function hasCommitAuthorColumn() {
  return dbPool
    .query<{
      exists: boolean;
    }>(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'azure_devops_config'
            and column_name = 'commit_author'
        ) as "exists"
      `,
    )
    .then((result) => result.rows[0]?.exists === true)
    .catch(() => false);
}

export async function findAzureDevopsConfigByUserId(userId: string) {
  const includeCommitAuthor = await hasCommitAuthorColumn();

  const query = includeCommitAuthor
    ? `
        select
          id,
          user_id as "userId",
          organization_url as "organizationUrl",
          pat,
          status,
          commit_author as "commitAuthor"
        from azure_devops_config
        where user_id = $1
        limit 1
      `
    : `
        select
          id,
          user_id as "userId",
          organization_url as "organizationUrl",
          pat,
          status
        from azure_devops_config
        where user_id = $1
        limit 1
      `;

  const result = await dbPool.query<
    Omit<StoredAzureDevopsConfig, "commitAuthor"> & {
      commitAuthor?: string | null;
    }
  >(query, [userId]);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    commitAuthor: row.commitAuthor ?? null,
  } satisfies StoredAzureDevopsConfig;
}

export async function saveAzureDevopsConfig({
  userId,
  organizationUrl,
  pat,
  status = "active",
  commitAuthor,
}: SaveAzureDevopsConfigInput) {
  const includeCommitAuthor = await hasCommitAuthorColumn();

  const result = includeCommitAuthor
    ? await dbPool.query<StoredAzureDevopsConfig>(
        `
          insert into azure_devops_config (
            id,
            user_id,
            organization_url,
            pat,
            commit_author,
            status
          )
          values ($1, $2, $3, $4, $5, $6)
          on conflict (user_id) do update
          set
            organization_url = excluded.organization_url,
            pat = excluded.pat,
            commit_author = excluded.commit_author,
            status = excluded.status
          returning
            id,
            user_id as "userId",
            organization_url as "organizationUrl",
            pat,
            status,
            commit_author as "commitAuthor"
        `,
        [crypto.randomUUID(), userId, organizationUrl, pat, commitAuthor, status],
      )
    : await dbPool.query<
        Omit<StoredAzureDevopsConfig, "commitAuthor"> & {
          commitAuthor?: string | null;
        }
      >(
        `
          insert into azure_devops_config (
            id,
            user_id,
            organization_url,
            pat,
            status
          )
          values ($1, $2, $3, $4, $5)
          on conflict (user_id) do update
          set
            organization_url = excluded.organization_url,
            pat = excluded.pat,
            status = excluded.status
          returning
            id,
            user_id as "userId",
            organization_url as "organizationUrl",
            pat,
            status
        `,
        [crypto.randomUUID(), userId, organizationUrl, pat, status],
      );

  const row = result.rows[0];

  return {
    ...row,
    commitAuthor: row?.commitAuthor ?? null,
  } satisfies StoredAzureDevopsConfig;
}
