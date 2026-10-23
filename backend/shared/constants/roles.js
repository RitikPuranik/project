// Effective project roles that may perform each class of action (see project.access.js).
export const MANAGERS = ["admin", "project_manager"];
export const COMMENTERS = ["admin", "project_manager", "member"];
// Roles a project member entry can hold (the owner is separate and has no entry).
export const PROJECT_ROLES = ["project_manager", "member", "viewer"];
