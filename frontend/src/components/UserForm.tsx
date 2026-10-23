import { useState } from "react";
import api from "@/lib/api";
import { ROLE_LABEL, errorMessage } from "@/lib/format";
import type { Person, Role } from "@/lib/types";
import { Button, ErrorNote, Field, Input, Modal, Select } from "./ui";

const ROLES: Role[] = ["viewer", "member", "project_manager", "admin"];

export function UserForm({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user?: Person;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: (u: Person, created: boolean) => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), email: email.trim() };
      if (!isSelf) body.role = role;
      if (password) body.password = password;
      const { data } = user
        ? await api.put<Person & { id?: string }>(`/users/${user._id}`, body)
        : await api.post<Person & { id?: string }>("/users", body);
      onSaved({ ...data, _id: data._id ?? data.id! }, !user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={user ? "Edit user" : "New user"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote message={error} />}
        <Field label="Name">{(id) => <Input id={id} required autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label={user ? "New password" : "Password"} hint={user ? "Leave blank to keep the current password. Changing it signs the user out everywhere." : "At least 6 characters."}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required={!user} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Role" hint={isSelf ? "You can't change your own role." : undefined}>
          {(id) => (
            <Select id={id} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || !email.trim() || (!user && password.length < 6)}>
            {user ? "Save changes" : "Create user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
