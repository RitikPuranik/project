import { useEffect, useState } from "react";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { errorMessage } from "@/shared/lib/format";
import { useProject } from "@/features/projects/projectContext";
import type { Person } from "@/shared/lib/types";
import { Avatar, Button, Input, RoleBadge, Select, useToast } from "@/shared/components/ui";

export default function Team() {
  const { project, reload, canManage } = useProject();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [role, setRole] = useState<"member" | "project_manager" | "viewer">("member");
  const memberIds = new Set([project.owner._id, ...project.members.map((m) => m.user._id)]);

  useEffect(() => {
    if (!canManage || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api
        .get<Person[]>("/users", { params: { search: q.trim() } })
        .then((r) => alive && setResults(r.data.filter((u) => !memberIds.has(u._id))))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, canManage, project]);

  async function add(u: Person) {
    try {
      await api.post(`/projects/${project._id}/members`, { userId: u._id, role });
      toast(`${u.name} added`);
      setQ("");
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  async function remove(u: Person) {
    try {
      await api.delete(`/projects/${project._id}/members/${u._id}`);
      toast(`${u.name} removed`);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section aria-labelledby="members-h" className="rounded-2xl border border-line bg-surface">
        <h2 id="members-h" className="border-b border-line px-5 py-4 text-lg font-semibold">
          Members <span className="text-sm font-normal text-muted">{project.members.length + 1}</span>
        </h2>
        <ul>
          <li className="flex items-center gap-3 border-b border-line px-5 py-3">
            <Avatar person={project.owner} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{project.owner.name}</p>
              <p className="truncate text-xs text-muted">{project.owner.email}</p>
            </div>
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-white">Owner</span>
          </li>
          {project.members.map((m) => (
            <li key={m.user._id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <Avatar person={m.user} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.user.name}</p>
                <p className="truncate text-xs text-muted">{m.user.email}</p>
              </div>
              <RoleBadge role={m.role} />
              {canManage && (isAdmin || m.role !== "project_manager") && <Button size="sm" variant="ghost" onClick={() => remove(m.user)}>Remove</Button>}
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <section aria-labelledby="add-h" className="h-fit rounded-2xl border border-line bg-surface p-5">
          <h2 id="add-h" className="text-lg font-semibold">Add a member</h2>
          <div className="mt-4 flex flex-col gap-3">
            <Input type="search" aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select aria-label="Role in this project" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="member">Member</option>
              <option value="viewer">Viewer (read-only)</option>
              {isAdmin && <option value="project_manager">Project manager</option>}
            </Select>
          </div>
          <ul className="mt-3 flex flex-col">
            {results.map((u) => (
              <li key={u._id} className="flex items-center gap-3 py-2">
                <Avatar person={u} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted">{u.email}</p>
                </div>
                <Button size="sm" variant="primary" onClick={() => add(u)}>Add</Button>
              </li>
            ))}
            {q.trim().length >= 2 && results.length === 0 && <li className="py-3 text-sm text-muted">No one new matches “{q}”.</li>}
          </ul>
        </section>
      ) : (
        <p className="h-fit rounded-2xl bg-wash px-5 py-4 text-sm text-muted">Only the project owner, project managers and admins can change the team.</p>
      )}
    </div>
  );
}
