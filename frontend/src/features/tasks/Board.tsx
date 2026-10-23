import { useState } from "react";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { CONFLICT_TOAST, PRIORITIES, canEdit, canManageTasks, canWorkOnTask, conflictFrom, errorMessage, isDone, projectPeople, sortedColumns } from "@/shared/lib/format";
import { useProject } from "@/features/projects/projectContext";
import type { Priority, Task } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { Button, ErrorNote, Input, PageLoader, ReadOnlyNote, Select, StageBar, StageDot, useToast } from "@/shared/components/ui";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskForm } from "@/features/tasks/TaskForm";

export default function Board() {
  const { project } = useProject();
  const { user } = useAuth();
  const editable = canEdit(user) && !project.isArchived;
  const manage = canManageTasks(project, user) && !project.isArchived;
  const toast = useToast();
  const cols = sortedColumns(project);
  const { data: tasks, error, reload, setData } = useFetch(() => api.get<Task[]>(`/projects/${project._id}/tasks`).then((r) => r.data), [project._id]);
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [quick, setQuick] = useState<{ col: string; title: string } | null>(null);

  if (error && !tasks) return <ErrorNote message={error} onRetry={reload} />;
  if (!tasks) return <PageLoader label="Loading board" />;

  const visible = tasks.filter(
    (t) => (!assignee || t.assignees.some((a) => a._id === assignee)) && (!priority || t.priority === priority)
  );
  const inCol = (id: string) => visible.filter((t) => t.columnId === id).sort((a, b) => a.order - b.order);

  async function move(taskId: string, columnId: string, beforeId?: string) {
    const task = tasks!.find((t) => t._id === taskId);
    if (!task || !canWorkOnTask(project, user, task) || (task._id === beforeId)) return;
    const siblings = tasks!.filter((t) => t.columnId === columnId && t._id !== taskId).sort((a, b) => a.order - b.order);
    let order: number;
    const idx = beforeId ? siblings.findIndex((t) => t._id === beforeId) : -1;
    if (idx === -1) order = siblings.length ? siblings[siblings.length - 1].order + 1 : 0;
    else order = idx === 0 ? siblings[0].order - 1 : (siblings[idx - 1].order + siblings[idx].order) / 2;
    const prev = tasks;
    setData((list) => (list ?? []).map((t) => (t._id === taskId ? { ...t, columnId, order } : t)));
    try {
      const { data: saved } = await api.put<Task>(`/projects/${project._id}/tasks/${taskId}/move`, { columnId, order, version: task.version });
      // Remember the new version so the next drag of this card isn't mistaken for a stale one.
      setData((list) => (list ?? []).map((t) => (t._id === taskId ? { ...t, version: saved.version } : t)));
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

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quick?.title.trim()) return;
    try {
      await api.post(`/projects/${project._id}/tasks`, { title: quick.title.trim(), columnId: quick.col });
      setQuick(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      {!editable && <ReadOnlyNote>{project.isArchived ? "This project is archived and read-only. Unarchive it to make changes." : undefined}</ReadOnlyNote>}
      <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
        <StageBar columns={project.columns} tasks={tasks} height={12} legend />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-auto min-w-40">
          <option value="">All assignees</option>
          {projectPeople(project).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className="h-9 w-auto min-w-36 capitalize">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        {(assignee || priority) && <Button size="sm" variant="ghost" onClick={() => { setAssignee(""); setPriority(""); }}>Clear filters</Button>}
        {manage && <Button variant="primary" size="sm" className="ml-auto" onClick={() => setCreatingIn(cols[0]?.id ?? "")}>New task</Button>}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        <div className="grid auto-cols-[300px] grid-flow-col gap-4">
          {cols.map((c, i) => {
            const list = inCol(c.id);
            const total = tasks.filter((t) => t.columnId === c.id).length;
            return (
              <section
                key={c.id}
                aria-label={c.name}
                onDragOver={(e) => { if (dragId && editable) { e.preventDefault(); setOverCol(c.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverCol(null);
                  if (dragId) move(dragId, c.id);
                  setDragId(null);
                }}
                className={`flex min-h-64 flex-col rounded-2xl p-2.5 transition-colors ${overCol === c.id ? "bg-accent-wash" : "bg-wash/70"}`}
              >
                <header className="flex items-center justify-between px-1.5 pt-1 pb-3">
                  <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
                    <StageDot index={i} total={cols.length} />
                    {c.name}
                    <span className="text-sm font-normal text-muted">{total}</span>
                  </h2>
                  {manage && <button type="button" aria-label={`Add task to ${c.name}`} onClick={() => setQuick({ col: c.id, title: "" })} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
                    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
                  </button>}
                </header>
                <div className="flex flex-1 flex-col gap-2">
                  {quick?.col === c.id && (
                    <form onSubmit={quickAdd} className="rounded-xl border border-accent bg-surface p-2">
                      <Input autoFocus aria-label="Task title" placeholder="Task title, then Enter" value={quick.title} onChange={(e) => setQuick({ col: c.id, title: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setQuick(null)} />
                    </form>
                  )}
                  {list.map((t) => (
                    <div
                      key={t._id}
                      onDragOver={(e) => { if (dragId && dragId !== t._id) { e.preventDefault(); e.stopPropagation(); setOverCol(c.id); } }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOverCol(null);
                        if (dragId) move(dragId, c.id, t._id);
                        setDragId(null);
                      }}
                    >
                      <TaskCard
                        task={t}
                        done={isDone(t, project)}
                        dragging={dragId === t._id}
                        readOnly={!editable || !canWorkOnTask(project, user, t)}
                        onDragStart={(e) => { setDragId(t._id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t._id); }}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      />
                    </div>
                  ))}
                  {list.length === 0 && !quick && (
                    <p className="px-2 py-6 text-center text-sm text-faint">{total ? "No tasks match the filters" : manage ? "Drop tasks here" : "No tasks"}</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {editable && <p className="text-xs text-muted">Drag cards between columns to change status. On touch devices, change status from the Tasks tab or a task&apos;s page.</p>}

      {creatingIn !== null && (
        <TaskForm
          open
          project={project}
          defaultColumnId={creatingIn}
          onClose={() => setCreatingIn(null)}
          onSaved={() => { setCreatingIn(null); toast("Task created"); reload(); }}
        />
      )}
    </>
  );
}
