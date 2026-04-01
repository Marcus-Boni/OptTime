/**
 * ARCH: Mock data for UI development.
 * This will be replaced with Firestore data when the backend is connected.
 */

import type { Project } from "@/types/project";
import type { TimeEntry } from "@/types/time-entry";
import type { User } from "@/types/user";

export const MOCK_CURRENT_USER: User = {
  id: "user-1",
  email: "[EMAIL_ADDRESS]",
  name: "[NAME]",
  image: undefined,
  role: "manager",
  department: "Engenharia",
  managerId: undefined,
  hourlyRate: 150,
  weeklyCapacity: 40,
  isActive: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2025-03-01"),
};

export const MOCK_USERS: User[] = [
  MOCK_CURRENT_USER,
  {
    id: "user-2",
    email: "ana@optsolv.com",
    name: "Ana Beatriz Silva",
    role: "member",
    department: "Engenharia",
    managerId: "user-1",
    weeklyCapacity: 40,
    isActive: true,
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date("2025-03-01"),
  },
  {
    id: "user-3",
    email: "rafael@optsolv.com",
    name: "Rafael Costa",
    role: "member",
    department: "Design",
    managerId: "user-1",
    weeklyCapacity: 40,
    isActive: true,
    createdAt: new Date("2024-03-01"),
    updatedAt: new Date("2025-03-01"),
  },
  {
    id: "user-4",
    email: "julia@optsolv.com",
    name: "Julia Fernandes",
    role: "admin",
    department: "Engenharia",
    weeklyCapacity: 40,
    isActive: true,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2025-03-01"),
  },
  {
    id: "user-5",
    email: "pedro@optsolv.com",
    name: "Pedro Henrique Oliveira",
    role: "member",
    department: "Backend",
    managerId: "user-1",
    weeklyCapacity: 40,
    isActive: true,
    createdAt: new Date("2024-06-01"),
    updatedAt: new Date("2025-03-01"),
  },
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: "proj-1",
    name: "OptSolv Time Tracker",
    code: "OPT-001",
    clientName: "OptSolv (Interno)",
    color: "#f97316",
    description: "Ferramenta interna de registro de horas",
    status: "active",
    billable: false,
    budget: 500,
    memberIds: ["user-1", "user-2", "user-3"],
    managerId: "user-1",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-03-01"),
  },
  {
    id: "proj-2",
    name: "Plano de Corte - Otimizador",
    code: "OPT-002",
    clientName: "OptSolv",
    color: "#3b82f6",
    description: "Otimizador de plano de corte para chapas",
    status: "active",
    billable: true,
    budget: 2000,
    memberIds: ["user-1", "user-2", "user-5"],
    managerId: "user-1",
    createdAt: new Date("2024-06-01"),
    updatedAt: new Date("2025-03-01"),
  },
  {
    id: "proj-3",
    name: "Portal do Cliente",
    code: "CLI-001",
    clientName: "Acme Corp",
    color: "#22c55e",
    description: "Portal self-service para clientes",
    status: "active",
    billable: true,
    budget: 800,
    memberIds: ["user-3", "user-4"],
    managerId: "user-4",
    createdAt: new Date("2024-09-01"),
    updatedAt: new Date("2025-03-01"),
  },
  {
    id: "proj-4",
    name: "Dashboard Analytics",
    code: "ANA-001",
    clientName: "OptSolv",
    color: "#8b5cf6",
    description: "Dashboard de analytics para gestão",
    status: "active",
    billable: false,
    budget: 300,
    memberIds: ["user-2", "user-5"],
    managerId: "user-1",
    createdAt: new Date("2025-01-15"),
    updatedAt: new Date("2025-03-01"),
  },
];

const today = new Date();
const todayStr = today.toISOString().split("T")[0];
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split("T")[0];

export const MOCK_TIME_ENTRIES: TimeEntry[] = [
  {
    id: "entry-1",
    userId: "user-1",
    userDisplayName: "Marcus Galvão",
    projectId: "proj-1",
    projectName: "OptSolv Time Tracker",
    description: "Implementação do dashboard principal e componentes de layout",
    date: today,
    duration: 180,
    billable: false,
    status: "draft",
    tags: ["frontend", "dashboard"],
    createdAt: today,
    updatedAt: today,
  },
  {
    id: "entry-2",
    userId: "user-1",
    userDisplayName: "Marcus Galvão",
    projectId: "proj-2",
    projectName: "Plano de Corte - Otimizador",
    taskTitle: "Refatorar algoritmo de otimização",
    azureWorkItemId: 1234,
    description:
      "Otimização do algoritmo de corte linear para melhor performance",
    date: today,
    duration: 120,
    billable: true,
    status: "draft",
    tags: ["backend", "performance"],
    createdAt: today,
    updatedAt: today,
  },
  {
    id: "entry-3",
    userId: "user-1",
    userDisplayName: "Marcus Galvão",
    projectId: "proj-1",
    projectName: "OptSolv Time Tracker",
    description: "Design system e configuração de temas",
    date: yesterday,
    duration: 240,
    billable: false,
    status: "draft",
    tags: ["design", "frontend"],
    createdAt: yesterday,
    updatedAt: yesterday,
  },
  {
    id: "entry-4",
    userId: "user-1",
    userDisplayName: "Marcus Galvão",
    projectId: "proj-4",
    projectName: "Dashboard Analytics",
    description: "Modelagem de dados e queries Firestore",
    date: yesterday,
    duration: 90,
    billable: false,
    status: "submitted",
    tags: ["database"],
    createdAt: yesterday,
    updatedAt: yesterday,
  },
  {
    id: "entry-5",
    userId: "user-2",
    userDisplayName: "Ana Beatriz Silva",
    projectId: "proj-2",
    projectName: "Plano de Corte - Otimizador",
    description: "Testes unitários do módulo de corte",
    date: today,
    duration: 300,
    billable: true,
    status: "submitted",
    createdAt: today,
    updatedAt: today,
  },
];

/** Get week day hours for the weekly chart */
export function getMockWeeklyHours(): {
  day: string;
  hours: number;
  target: number;
}[] {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  const hours = [7.5, 8.0, 6.5, 8.5, 5.0];
  return days.map((day, i) => ({
    day,
    hours: hours[i],
    target: 8,
  }));
}

/** Get total hours for today */
export function getMockTodayHours(): number {
  return MOCK_TIME_ENTRIES.filter(
    (e) =>
      e.userId === "user-1" && e.date.toISOString().split("T")[0] === todayStr,
  ).reduce((acc, e) => acc + e.duration, 0);
}

/** Get total hours for this week */
export function getMockWeekHours(): number {
  return 35.5 * 60; // 35.5 hours in minutes
}
