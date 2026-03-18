// ─── Shared types for project components ───────────────────────────────────

export interface ProjectMemberUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role?: string;
}

export interface ProjectFromAPI {
  id: string;
  name: string;
  description: string | null;
  clientName: string | null;
  color: string;
  status: string;
  billable: boolean;
  budget: number | null;
  source: string;
  imageUrl: string | null;
  azureProjectId: string | null;
  azureProjectUrl: string | null;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
  members: Array<{ id: string; userId: string; user: ProjectMemberUser }>;
  manager: ProjectMemberUser | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  image?: string | null;
}
