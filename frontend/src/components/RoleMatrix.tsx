import { ROLE_LABEL } from "@/lib/format";
import type { Role } from "@/lib/types";
import { cx } from "./ui";

const ROLES: Role[] = ["admin", "project_manager", "member", "viewer"];
type Cell = boolean | string;

// Mirrors what the API enforces (see backend routes + middleware).
const ROWS: { label: string; values: Record<Role, Cell> }[] = [
  { label: "View projects and tasks", values: { admin: "All projects", project_manager: "Own projects", member: "Own projects", viewer: "Own projects" } },
  { label: "Create and edit tasks, change status, assign", values: { admin: true, project_manager: true, member: true, viewer: false } },
  { label: "Comment on tasks", values: { admin: true, project_manager: true, member: true, viewer: false } },
  { label: "Create projects", values: { admin: true, project_manager: true, member: false, viewer: false } },
  { label: "Edit, archive and manage project teams", values: { admin: true, project_manager: "Own projects", member: false, viewer: false } },
  { label: "Delete projects", values: { admin: true, project_manager: "Own projects", member: false, viewer: false } },
  { label: "Change user roles", values: { admin: true, project_manager: false, member: false, viewer: false } },
];

function Mark({ v }: { v: Cell }) {
  if (typeof v === "string") return <span className="text-xs text-muted">{v}</span>;
  return v ? (
    <svg viewBox="0 0 20 20" className="mx-auto size-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Allowed">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  ) : (
    <span className="text-faint" aria-label="Not allowed">—</span>
  );
}

export function RoleMatrix({ current }: { current?: Role }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">What each role can do</caption>
        <thead>
          <tr className="border-b border-line text-[13px]">
            <th scope="col" className="px-5 py-3 font-medium text-muted">Permission</th>
            {ROLES.map((r) => (
              <th key={r} scope="col" className={cx("px-3 py-3 text-center font-medium", r === current ? "text-accent-strong" : "text-muted")}>
                {ROLE_LABEL[r]}
                {r === current && <span className="block text-[11px] font-normal">You</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-0">
              <th scope="row" className="px-5 py-2.5 font-normal">{row.label}</th>
              {ROLES.map((r) => (
                <td key={r} className={cx("px-3 py-2.5 text-center", r === current && "bg-accent-wash/50")}>
                  <Mark v={row.values[r]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
