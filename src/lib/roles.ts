export type UserRole = "employee" | "manager" | "admin" | "general_manager";

export const ROLE_LABELS: Record<UserRole, string> = {
  employee: "Colaborador",
  manager: "Supervisor",
  admin: "Gerencia de Operaciones",
  general_manager: "Gerencia General",
};
