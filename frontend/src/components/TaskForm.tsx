import { useState } from "react";
import api from "@/lib/api";
import { PRIORITIES, TYPES, errorMessage, projectPeople, sortedColumns, toDateInput } from "@/lib/format";
import type { Priority, Project, Task, TaskType } from "@/lib/types";
import { Avatar, Button, ErrorNote, Field, Input, Modal, Select, Textarea, cx } from "./ui";

export function TaskForm({
  open,
  project,
  task,
  defaultColumnId,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: Project;
  task?: Task;
  defaultColumnId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cols = sortedColumns(project);
  const people = projectPeople(project);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [columnId, setColumnId] = useState(task?.columnId ?? defaultColumnId ?? cols[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [type, setType] = useState<TaskType>(task?.type ?? "task");
  const [dueDate, setDueDate] = useState(toDateInput(task?.dueDate));
  const [points, setPoints] = useState(String(task?.storyPoints ?? 0));
  const [assignees, setAssignees] = useState<string[]>(task?.assignees.map((a) => a._id) ?? []);
  const [labels, setLabels] = useState(task?.labels.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      description,
      priority,
      type,
      dueDate: dueDate || null,
      storyPoints: Math.max(0, Number(points) || 0),
      assignees,
      labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
    };
    try {
      if (task) await api.put(`/projects/${project._id}/tasks/${task._id}`, body);
      else await api.post(`/projects/${project._id}/tasks`, { ...body, columnId });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"} width="max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote message={error} />}
        <Field label="Title">
          {(id) => <Input id={id} required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />}
        </Field>
        <Field label="Description">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {!task && (
            <Field label="Status">
              {(id) => (
                <Select id={id} value={columnId} onChange={(e) => setColumnId(e.target.value)}>
                  {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Field label="Priority">
            {(id) => (
              <Select id={id} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="capitalize">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as TaskType)} className="capitalize">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Due date">{(id) => <Input id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
          <Field label="Story points">
            {(id) => <Input id={id} type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Assignees</legend>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = assignees.includes(p._id);
              return (
                <button
                  key={p._id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p._id)}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                    on ? "border-accent bg-accent-wash text-accent-strong" : "border-line bg-surface hover:bg-wash"
                  )}
                >
                  <Avatar person={p} size={22} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label="Labels" hint="Separate with commas.">
          {(id) => <Input id={id} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="design, api" />}
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!title.trim()}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
