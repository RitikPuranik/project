import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CONFLICT_TOAST, PRIORITIES, canEdit, canManageTasks, canWorkOnTask, conflictFrom, dueLabel, errorMessage, isDone, projectPeople, sortedColumns } from "@/lib/format";
import { useProject } from "@/lib/projectContext";
import type { Priority, Task } from "@/lib/types";
import { useFetch } from "@/lib/useFetch";
import { AvatarStack, Button, EmptyState, ErrorNote, Input, PageLoader, PriorityBadge, ReadOnlyNote, Select, TypeBadge, cx, useToast } from "@/components/ui";
import { TaskForm } from "@/components/TaskForm";

export default function ProjectTasks() {
  const { project } = useProject();
  const { user } = useAuth();
  const editable = canEdit(user);
  const manage = canManageTasks(project, user);
  const toast = useToast();
  const cols = sortedColumns(project);
  const { data: tasks, error, reload, setData } = useFetch(() => api.get<Task[]>(`/projects/${project._id}/tasks`).then((r) => r.data), [project._id]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);

  if (error && !tasks) return <ErrorNote message={error} onRetry={reload} />;
  if (!tasks) return <PageLoader label="Loading tasks" />;

  const rows = tasks
    .filter(
      (t) =>
        t.title.toLowerCase().includes(q.trim().toLowerCase()) &&
        (!status || t.columnId === status) &&
        (!priority || t.priority === priority) &&
        (!assignee || t.assignees.some((a) => a._id === assignee))
    )
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  async function changeStatus(task: Task, columnId: string) {
    const prev = tasks;
    const order = Math.max(-1, ...tasks!.filter((t) => t.columnId === columnId).map((t) => t.order)) + 1;
    setData((l) => (l ?? []).map((t) => (t._id === task._id ? { ...t, columnId, order } : t)));
    try {
      const { data: saved } = await api.put<Task>(`/projects/${project._id}/tasks/${task._id}/move`, { columnId, order, version: task.version });
      setData((l) => (l ?? []).map((t) => (t._id === task._id ? { ...t, version: saved.version } : t)));
    } catch (err) {
      setData(() => prev);
      if (conflictFrom(err)) {
        toast(CONFLICT_TOAST, "error");
        reload();
      } else {
        toast(errorMessage(err), "error");
      }
    }
  }

  return (
    <>
      {!editable && <ReadOnlyNote />}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input type="search" aria-label="Search tasks" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-56" />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto min-w-36">
          <option value="">All statuses</option>
          {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className="h-9 w-auto min-w-36 capitalize">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-auto min-w-36">
          <option value="">All assignees</option>
          {projectPeople(project).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </Select>
        {manage && <Button variant="primary" size="sm" className="ml-auto" onClick={() => setCreating(true)}>New task</Button>}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={tasks.length ? "No tasks match" : "No tasks yet"}
          body={tasks.length ? "Adjust the filters to see more." : manage ? "Add the first task to get this project moving." : "Tasks will appear here once the team adds them."}
          action={!tasks.length && manage ? <Button variant="primary" onClick={() => setCreating(true)}>New task</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Priority</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Assignees</th>
                <th className="px-3 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const due = dueLabel(t.dueDate);
                return (
                  <tr key={t._id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="max-w-80 px-4 py-2.5">
                      <Link to={`/tasks/${t._id}`} className={cx("font-medium hover:text-accent-strong", isDone(t, project) && "text-muted line-through")}>{t.title}</Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {!canWorkOnTask(project, user, t) ? <span>{cols.find((c) => c.id === t.columnId)?.name}</span> : <Select aria-label={`Status for ${t.title}`} value={t.columnId} onChange={(e) => changeStatus(t, e.target.value)} className="h-8 w-auto min-w-32 text-[13px]">
                        {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>}
                    </td>
                    <td className="px-3 py-2.5"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-3 py-2.5"><TypeBadge type={t.type} /></td>
                    <td className="px-3 py-2.5">{t.assignees.length ? <AvatarStack people={t.assignees} max={3} size={24} /> : <span className="text-faint">Unassigned</span>}</td>
                    <td className={cx("px-3 py-2.5", due?.tone === "late" && !isDone(t, project) && "font-semibold text-danger")}>{due?.text ?? <span className="text-faint">—</span>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t.storyPoints || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <TaskForm open project={project} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast("Task created"); reload(); }} />
      )}
    </>
  );
}
