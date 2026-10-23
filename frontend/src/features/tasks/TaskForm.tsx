import { useState } from "react";
import api from "@/shared/lib/api";
import { FIELD_LABEL, PRIORITIES, TYPES, conflictFrom, differingFields, errorMessage, projectPeople, sortedColumns, taskFields, toDateInput, type TaskFields } from "@/shared/lib/format";
import type { Priority, Project, Task, TaskType } from "@/shared/lib/types";
import { Avatar, Button, ErrorNote, Field, Input, Modal, Select, Textarea, cx } from "@/shared/components/ui";

export function TaskForm({
  open,
  project,
  task,
  defaultColumnId,
  restricted = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: Project;
  task?: Task;
  defaultColumnId?: string;
  /** Team members may only edit description, story points and labels; the API enforces this. */
  restricted?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cols = sortedColumns(project);
  const viewerIds = new Set(project.members.filter((m) => m.role === "viewer").map((m) => m.user._id));
  const people = projectPeople(project).filter((p) => !viewerIds.has(p._id)); // read-only participants can't be assigned
  // `base` is the task as the form last saw it (its version is what we send back).
  const [base, setBase] = useState<Task | undefined>(task);
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
  // Set when the server answers 409: the latest task + which fields each side touched.
  const [conflict, setConflict] = useState<{ latest: Task; theirs: (keyof TaskFields)[]; mine: (keyof TaskFields)[] } | null>(null);

  const toggle = (id: string) => setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const formFields = (): TaskFields => ({
    title: title.trim(),
    description,
    priority,
    type,
    dueDate,
    storyPoints: Math.max(0, Number(points) || 0),
    assignees: [...assignees].sort(),
    labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
  });

  // Put `latest` into the form for every field except those in `keep` (the user's own edits),
  // and make it the new base so the next save is checked against the latest version.
  function adopt(latest: Task, keep: (keyof TaskFields)[]) {
    const f = taskFields(latest);
    const k = new Set(keep);
    if (!k.has("title")) setTitle(f.title);
    if (!k.has("description")) setDescription(f.description);
    if (!k.has("priority")) setPriority(f.priority);
    if (!k.has("type")) setType(f.type);
    if (!k.has("dueDate")) setDueDate(f.dueDate);
    if (!k.has("storyPoints")) setPoints(String(f.storyPoints));
    if (!k.has("assignees")) setAssignees(latest.assignees.map((a) => a._id));
    if (!k.has("labels")) setLabels(latest.labels.join(", "));
    setBase(latest);
    setConflict(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (base) {
        // Send only what the user changed, plus the version they were looking at. Untouched
        // fields are left alone, so saving can never revert someone else's edit to them.
        const now = formFields();
        const dirty = differingFields(taskFields(base), now);
        if (!dirty.length) {
          onClose();
          return;
        }
        const body: Record<string, unknown> = { version: base.version };
        for (const k of dirty) body[k] = k === "dueDate" ? now.dueDate || null : now[k];
        await api.put(`/projects/${project._id}/tasks/${base._id}`, body);
      } else {
        const now = formFields();
        await api.post(`/projects/${project._id}/tasks`, { ...now, dueDate: now.dueDate || null, columnId });
      }
      onSaved();
    } catch (err) {
      const latest = conflictFrom(err);
      if (latest && base) {
        const mine = differingFields(taskFields(base), formFields());
        const theirs = differingFields(taskFields(base), taskFields(latest));
        setConflict({ latest, theirs, mine });
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"} width="max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote message={error} />}
        {conflict && (() => {
          const overlap = conflict.mine.filter((k) => conflict.theirs.includes(k));
          const list = (keys: (keyof TaskFields)[]) => keys.map((k) => FIELD_LABEL[k]).join(", ");
          const statusMoved = conflict.latest.columnId !== base?.columnId;
          return (
            <div role="alert" className="rounded-xl border border-[#e6c375] bg-amber-wash px-4 py-3 text-sm text-[#7a5200]">
              <p className="font-semibold">This task was changed by someone else while you were editing.</p>
              <p className="mt-1">
                {conflict.theirs.length || statusMoved
                  ? <>They changed: {list(conflict.theirs)}{statusMoved ? `${conflict.theirs.length ? ", " : ""}${FIELD_LABEL.columnId}` : ""}. </>
                  : <>Their changes don&apos;t touch the fields you edited. </>}
                {conflict.mine.length ? <>You edited: {list(conflict.mine)}. </> : null}
                {overlap.length ? <strong>Keeping your edits will overwrite their changes to: {list(overlap)}.</strong> : <>Your edits can be applied on top of theirs without overwriting anything.</>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => adopt(conflict.latest, [])}>Load latest version</Button>
                <Button size="sm" variant="primary" onClick={() => adopt(conflict.latest, conflict.mine)}>
                  {overlap.length ? "Keep my edits" : "Apply my edits on top"}
                </Button>
              </div>
              <p className="mt-2 text-xs">Either choice updates the form to the latest version. Then press Save to finish.</p>
            </div>
          );
        })()}
        <Field label="Title">
          {(id) => <Input id={id} required autoFocus={!restricted} disabled={restricted} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />}
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
              <Select id={id} disabled={restricted} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="capitalize">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} disabled={restricted} value={type} onChange={(e) => setType(e.target.value as TaskType)} className="capitalize">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Due date">{(id) => <Input id={id} type="date" disabled={restricted} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
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
                  disabled={restricted}
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
