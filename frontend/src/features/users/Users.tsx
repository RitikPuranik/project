import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { ROLE_LABEL, errorMessage } from "@/shared/lib/format";
import type { Person, Role } from "@/shared/lib/types";
import { Avatar, Button, ConfirmModal, ErrorNote, Input, PageHeader, PageLoader, Select, useToast } from "@/shared/components/ui";
import { UserForm } from "@/features/users/UserForm";
import { RoleMatrix } from "@/features/users/RoleMatrix";

export default function Users() {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [users, setUsers] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Person | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status === "authed" && user?.role !== "admin") navigate("/dashboard", { replace: true });
  }, [status, user, navigate]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api
        .get<Person[]>("/users", {
          params: { ...(q.trim() && { search: q.trim() }), ...(roleFilter && { role: roleFilter }), ...(statusFilter && { status: statusFilter }) },
        })
        .then((r) => alive && (setUsers(r.data), setError(null)))
        .catch((e) => alive && setError(errorMessage(e)));
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, roleFilter, statusFilter, tick]);

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

  async function setActive(u: Person, active: boolean) {
    try {
      await api.put(`/users/${u._id}/${active ? "activate" : "deactivate"}`);
      setUsers((l) => (l ?? []).map((x) => (x._id === u._id ? { ...x, isActive: active } : x)));
      toast(`${u.name} ${active ? "reactivated" : "deactivated"}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (user?.role !== "admin") return null;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Create accounts, assign roles and deactivate access."
        actions={<Button variant="primary" onClick={() => setEditing("new")}>New user</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input type="search" aria-label="Search users" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")} className="h-10 w-auto min-w-40">
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="project_manager">Project manager</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </Select>
        <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")} className="h-10 w-auto min-w-36">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
        {(q || roleFilter || statusFilter) && (
          <Button size="sm" variant="ghost" onClick={() => { setQ(""); setRoleFilter(""); setStatusFilter(""); }}>Clear filters</Button>
        )}
        {users && <span className="ml-auto text-sm text-muted">{users.length} {users.length === 1 ? "person" : "people"}</span>}
      </div>
      {error && <ErrorNote message={error} />}
      {!users && !error && <PageLoader label="Loading users" />}
      {users && (
        <>
          {users.length === 0 && <p className="mb-3 rounded-xl bg-wash px-4 py-3 text-sm text-muted">No users match these filters.</p>}
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[13px] text-muted">
                  <th className="px-5 py-3 font-medium">Person</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} className={`border-b border-line last:border-0 ${u.isActive === false ? "opacity-60" : ""}`}>
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
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.isActive === false ? "bg-wash text-muted" : "bg-accent-wash text-accent-strong"}`}>
                        {u.isActive === false ? "Deactivated" : "Active"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setEditing(u)}>Edit</Button>
                        {u._id !== user._id &&
                          (u.isActive === false ? (
                            <Button size="sm" onClick={() => setActive(u, true)}>Reactivate</Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeactivating(u)}>Deactivate</Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Shows up to 100 people at a time. Use search and the filters to narrow the list. You can&apos;t change your own role.</p>
          <h2 className="mt-10 mb-3 text-lg font-semibold">What each role can do</h2>
          <RoleMatrix current={user.role} />
        </>
      )}

      {editing && (
        <UserForm
          user={editing === "new" ? undefined : editing}
          isSelf={editing !== "new" && editing._id === user._id}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            toast(created ? `${saved.name} created` : `${saved.name} updated`);
            setTick((n) => n + 1);
          }}
        />
      )}
      <ConfirmModal
        open={!!deactivating}
        title="Deactivate this user?"
        body={`${deactivating?.name ?? "They"} will be signed out and can't use the app until you reactivate the account. Their project history is kept.`}
        confirmLabel="Deactivate"
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false);
          setDeactivating(null);
        }}
      />
    </>
  );
}
