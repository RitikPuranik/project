import { useEffect, useState } from "react";
import api from "@/shared/lib/api";
import { errorMessage, toDateInput } from "@/shared/lib/format";
import { useAuth } from "@/features/auth/auth";
import type { Person, Project } from "@/shared/lib/types";
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from "@/shared/components/ui";

export function ProjectForm({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project?: Project;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [startDate, setStartDate] = useState(toDateInput(project?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(project?.endDate));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const [managerId, setManagerId] = useState("");
  const [managers, setManagers] = useState<Person[]>([]);
  const assignManager = !project && user?.role === "admin";

  useEffect(() => {
    if (!assignManager) return;
    let alive = true;
    api
      .get<Person[]>("/users")
      .then((r) => alive && setManagers(r.data.filter((u) => u.role === "project_manager")))
      .catch(() => alive && setManagers([]));
    return () => {
      alive = false;
    };
  }, [assignManager]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (startDate && endDate && endDate < startDate) {
      setError("The end date can't be before the start date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), description, startDate: startDate || null, endDate: endDate || null };
      const { data } = project
        ? await api.put<Project>(`/projects/${project._id}`, body)
        : await api.post<Project>("/projects", { ...body, ...(managerId && { managerId }) });
      onSaved(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? "Edit project" : "New project"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote message={error} />}
        <Field label="Name">
          {(id) => <Input id={id} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Website relaunch" />}
        </Field>
        <Field label="Description">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">{(id) => <Input id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
          <Field label="End date">{(id) => <Input id={id} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}</Field>
        </div>
        {assignManager && (
          <Field label="Project manager" hint="Optional. They can manage this project's tasks and team.">
            {(id) => (
              <Select id={id} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">No project manager yet</option>
                {managers.map((m) => (
                  <option key={m._id} value={m._id}>{m.name} ({m.email})</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            {project ? "Save changes" : "Create project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
