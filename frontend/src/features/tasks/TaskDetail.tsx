import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { CommentsSection } from "@/features/comments/CommentsSection";
import { CONFLICT_TOAST, PRIORITIES, TYPES, canEdit, canManageTasks, canWorkOnTask, conflictFrom, dueLabel, errorMessage, formatDate, isDone, isTaskGone, sortedColumns } from "@/shared/lib/format";
import type { Priority, Project, Task, TaskType } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { Avatar, Button, ConfirmModal, ErrorNote, Input, PageLoader, ReadOnlyNote, Select, cx, useToast } from "@/shared/components/ui";
import { TaskForm } from "@/features/tasks/TaskForm";

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useFetch(async () => {
    const { data: task } = await api.get<Task>(`/tasks/${id}`);
    const { data: project } = await api.get<Project>(`/projects/${task.project}`);
    return { task, project };
  }, [id]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subtask, setSubtask] = useState("");
  const [stale, setStale] = useState(false);
  const editable = canEdit(user);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <PageLoader label="Loading task" />;
  const { task, project } = data;
  const archived = project.isArchived;
  const manage = canManageTasks(project, user) && !archived;
  const work = canWorkOnTask(project, user, task) && !archived;
  const cols = sortedColumns(project);
  const base = `/projects/${project._id}/tasks/${task._id}`;
  const due = dueLabel(task.dueDate);
  const done = isDone(task, project);
  const subDone = task.subtasks.filter((s) => s.done).length;

  // Every state-changing call carries the version this page last loaded. If someone else got
  // there first the API answers 409; we reload so the user is looking at the latest version.
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      setStale(false);
      reload();
    } catch (err) {
      if (isTaskGone(err)) {
        toast(errorMessage(err), "error");
        navigate(`/projects/${project._id}`, { replace: true });
      } else if (conflictFrom(err)) {
        setStale(true);
        toast(CONFLICT_TOAST, "error");
        reload();
      } else {
        toast(errorMessage(err), "error");
      }
    }
  }
  const patch = (body: Partial<Pick<Task, "priority" | "type">>) => act(() => api.put(base, { ...body, version: task.version }));

  const side = "flex items-center justify-between gap-4 border-b border-line py-3 text-sm last:border-0";

  return (
    <>
      <Link to={`/projects/${project._id}`} className="mb-3 inline-block text-sm text-muted hover:text-ink">← {project.name}</Link>
      {(!editable || archived) && <ReadOnlyNote>{archived ? "This project is archived and read-only. Unarchive it to make changes." : undefined}</ReadOnlyNote>}
      {stale && (
        <p role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-wash px-4 py-2.5 text-sm text-[#7a5200]">
          <span>Someone else changed this task, so your change wasn&apos;t applied. You&apos;re now looking at the latest version — review it and try again.</span>
          <button type="button" className="shrink-0 underline" onClick={() => setStale(false)}>Dismiss</button>
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <h1 className={cx("max-w-3xl text-[28px] leading-tight font-semibold", done && "text-muted")}>{task.title}</h1>
        {work && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
            {manage && <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleting(true)}>Delete</Button>}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="desc-h" className="rounded-2xl border border-line bg-surface p-5">
            <h2 id="desc-h" className="mb-2 text-base font-semibold">Description</h2>
            {task.description ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p> : <p className="text-sm text-muted">No description.</p>}
          </section>

          <section aria-labelledby="sub-h" className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="sub-h" className="text-base font-semibold">Subtasks</h2>
              {task.subtasks.length > 0 && <span className="text-sm text-muted">{subDone} of {task.subtasks.length} done</span>}
            </div>
            {task.subtasks.length > 0 && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-wash">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${(subDone / task.subtasks.length) * 100}%` }} />
              </div>
            )}
            <ul>
              {task.subtasks.map((s) => (
                <li key={s._id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-paper">
                    <input type="checkbox" checked={s.done} disabled={!work} onChange={() => act(() => api.put(`${base}/subtasks/${s._id}`, { version: task.version }))} className="size-4 accent-[#3a7d4f]" />
                    <span className={cx(s.done && "text-muted line-through")}>{s.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            {work && <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!subtask.trim()) return;
                const title = subtask.trim();
                setSubtask("");
                act(() => api.post(`${base}/subtasks`, { title }));
              }}
            >
              <Input aria-label="New subtask" placeholder="Add a subtask" value={subtask} onChange={(e) => setSubtask(e.target.value)} />
              <Button type="submit" disabled={!subtask.trim()}>Add</Button>
            </form>}
          </section>

          <CommentsSection task={task} project={project} base={base} act={act} />
        </div>

        <aside aria-label="Task details" className="h-fit rounded-2xl border border-line bg-surface px-5 py-2">
          <div className={side}>
            <label htmlFor="status" className="text-muted">Status</label>
            <Select
              id="status"
              disabled={!work}
              value={task.columnId}
              className="h-8 w-auto min-w-36 text-[13px]"
              onChange={(e) => act(() => api.put(`${base}/move`, { columnId: e.target.value, order: Date.now(), version: task.version }))}
            >
              {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className={side}>
            <label htmlFor="prio" className="text-muted">Priority</label>
            <Select id="prio" disabled={!manage} value={task.priority} className="h-8 w-auto min-w-36 text-[13px] capitalize" onChange={(e) => patch({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className={side}>
            <label htmlFor="type" className="text-muted">Type</label>
            <Select id="type" disabled={!manage} value={task.type} className="h-8 w-auto min-w-36 text-[13px] capitalize" onChange={(e) => patch({ type: e.target.value as TaskType })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div className={side}>
            <span className="text-muted">Assignees</span>
            <span className="flex flex-col items-end gap-1.5">
              {task.assignees.length ? task.assignees.map((a) => (
                <span key={a._id} className="flex items-center gap-2"><span>{a.name}</span><Avatar person={a} size={22} /></span>
              )) : <span className="text-faint">Unassigned</span>}
            </span>
          </div>
          <div className={side}>
            <span className="text-muted">Due</span>
            <span className={cx(due?.tone === "late" && !done && "font-semibold text-danger")}>{task.dueDate ? `${formatDate(task.dueDate)}${due && due.tone !== "normal" ? ` · ${due.text}` : ""}` : <span className="text-faint">No date</span>}</span>
          </div>
          <div className={side}>
            <span className="text-muted">Story points</span>
            <span>{task.storyPoints || <span className="text-faint">—</span>}</span>
          </div>
          <div className={side}>
            <span className="text-muted">Labels</span>
            <span className="flex flex-wrap justify-end gap-1">
              {task.labels.length ? task.labels.map((l) => <span key={l} className="rounded bg-wash px-1.5 py-0.5 text-xs text-muted">{l}</span>) : <span className="text-faint">None</span>}
            </span>
          </div>
          <div className={side}>
            <span className="text-muted">Created by</span>
            <span>{task.createdBy?.name}</span>
          </div>
        </aside>
      </div>

      {editing && (
        <TaskForm open project={project} task={task} restricted={!manage} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast("Task updated"); reload(); }} />
      )}
      <ConfirmModal
        open={deleting}
        title="Delete this task?"
        body="It will be removed from the board and task list."
        confirmLabel="Delete task"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          try {
            await api.delete(base, { params: { version: task.version } });
            toast("Task deleted");
            navigate(`/projects/${project._id}`, { replace: true });
          } catch (err) {
            setDeleting(false);
            if (conflictFrom(err)) {
              setStale(true);
              toast(CONFLICT_TOAST, "error");
              reload();
            } else {
              toast(errorMessage(err), "error");
            }
          }
        }}
      />
    </>
  );
}
