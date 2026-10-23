import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, errorMessage } from "@/lib/format";
import type { Person, Role } from "@/lib/types";
import { Avatar, ErrorNote, Input, PageHeader, PageLoader, Select, useToast } from "@/components/ui";
import { RoleMatrix } from "@/components/RoleMatrix";

export default function Users() {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authed" && user?.role !== "admin") navigate("/dashboard", { replace: true });
  }, [status, user, navigate]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api
        .get<Person[]>("/users", { params: q.trim() ? { search: q.trim() } : {} })
        .then((r) => alive && (setUsers(r.data), setError(null)))
        .catch((e) => alive && setError(errorMessage(e)));
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  async function setRole(u: Person, role: Role) {
    const prev = users;
    setUsers((l) => (l ?? []).map((x) => (x._id === u._id ? { ...x, role } : x)));
    try {
      await api.put(`/users/${u._id}/role`, { role });
      toast(`${u.name} is now ${ROLE_LABEL[role].toLowerCase()}`);
    } catch (err) {
      setUsers(prev);
      toast(errorMessage(err), "error");
    }
  }

  if (user?.role !== "admin") return null;

  return (
    <>
      <PageHeader title="Users" subtitle="Control who can create and manage projects." />
      <Input type="search" aria-label="Search users" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className="mb-5 max-w-sm" />
      {error && <ErrorNote message={error} />}
      {!users && !error && <PageLoader label="Loading users" />}
      {users && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[13px] text-muted">
                  <th className="px-5 py-3 font-medium">Person</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar person={u} size={34} />
                        <div>
                          <p className="font-medium">{u.name}{u._id === user._id && <span className="ml-2 text-xs font-normal text-muted">You</span>}</p>
                          <p className="text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={u._id === user._id}
                        onChange={(e) => setRole(u, e.target.value as Role)}
                        className="h-9 w-auto min-w-44"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="project_manager">Project manager</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Shows up to 20 people at a time. Search to find someone specific. You can&apos;t change your own role.</p>
          <h2 className="mt-10 mb-3 text-lg font-semibold">What each role can do</h2>
          <RoleMatrix current={user.role} />
        </>
      )}
    </>
  );
}
