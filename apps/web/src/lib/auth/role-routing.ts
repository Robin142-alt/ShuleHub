const roleHomePaths: Record<string, string> = {
  superadmin: "/superadmin/dashboard",
  platform_owner: "/superadmin/dashboard",
  principal: "/dashboard",
  owner: "/dashboard",
  admin: "/dashboard",
  school_admin: "/dashboard",
  bursar: "/finance/dashboard",
  teacher: "/dashboard",
  storekeeper: "/inventory/dashboard",
  librarian: "/library/dashboard",
  parent: "/portal/dashboard",
  student: "/portal/dashboard",
};

export function getRoleHomePath(role: string | null | undefined) {
  if (!role) {
    return "/dashboard";
  }

  return roleHomePaths[role] ?? "/dashboard";
}
