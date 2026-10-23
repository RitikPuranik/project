import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/shared/lib/api";
import { CONFLICT_TOAST, PRIORITIES, conflictFrom, daysFromToday, dueLabel, errorMessage, isDone, sortedColumns } from "@/shared/lib/format";
import type { MyTask, Priority } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { EmptyState, ErrorNote, PageHeader, PageLoader, PriorityBadge, Segmented, Select, cx, useToast } from "@/shared/components/ui";

type View = "open" | "done" | "all";

const GROUPS = [
  { key: "overdue", title: "Overdue" },
  { key: "week", title: "Due this week" },
  { key: "later", title: "Later" },
  { key: "none", title: "No due date" },
  { key: "done", title: "Completed" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

function groupOf(t: MyTask): GroupKey {
  if (isDone(t, t.project)) return "done";
  if (!t.dueDate) return "none";
  const d = daysFromToday(t.dueDate);
  return d < 0 ? "overdue" : d <= 7 ? "week" : "later";
}

export default function MyTasks() {
  const toast = useToast();
  const { data, error, reload, setData } = useFetch(() => api.get<MyTask[]>("/tasks/mine").then((r) => r.data));
  const [view, setView] = useState<View>("open");
  const [priority, setPriority] = useState<Priority | "">("");
  const [projectId, setProjectId] = useState("");

  const projects = useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((t) => m.set(t.project._id, t.project.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <PageLoader label="Loading your tasks" />;

  const doneCount = data.filter((t) => groupOf(t) === "done").length;
  const filtered = data.filter(
    (t) =>
      (!priority || t.priority === priority) &&
      (!projectId || t.project._id === projectId) &&
      (view === "all" || (view === "done") === (groupOf(t) === "done"))
  );
  const grouped = GROUPS.map((g) => ({ ...g, tasks: filtered.filter((t) => groupOf(t) === g.key) })).filter((g) => g.tasks.length);

  async function changeStage(t: MyTask, columnId: string) {
    if (columnId === t.columnId) return;
    const before = data!;
    setData((list) => (list ?? []).map((x) => (x._id === t._id ? { ...x, columnId } : x)));
    try {
      const { data: saved } = await api.put<MyTask>(`/projects/${t.project._id}/tasks/${t._id}/move`, { columnId, version: t.version });
      setData((list) => (list ?? []).map((x) => (x._id === t._id ? { ...x, columnId: saved.columnId, order: saved.order, version: saved.version } : x)));
    } catch (err) {
      setData(() => before);
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
      <PageHeader title="My tasks" subtitle="Everything assigned to you, across all your projects." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "Open", count: data.length - doneCount },
            { value: "done", label: "Done", count: doneCount },
            { value: "all", label: "All", count: data.length },
          ]}
        />
        <Select aria-label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 w-auto min-w-44">
          <option value="">All projects</option>
          {projects.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </Select>
        <Select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className="h-9 w-auto min-w-36">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="capitalize">{p}</option>
          ))}
        </Select>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? "No tasks assigned yet" : "Nothing matches"}
          body={data.length === 0 ? "When a task is assigned to you, it will show up here." : "Try a different view or clear a filter."}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((g) => (
            <section key={g.key} aria-labelledby={`g-${g.key}`} className="rounded-2xl border border-line bg-surface">
              <h2 id={`g-${g.key}`} className="flex items-center gap-2 border-b border-line px-5 py-3 text-base font-semibold">
                <span className={cx(g.key === "overdue" && "text-danger")}>{g.title}</span>
                <span className="text-sm font-normal text-muted">{g.tasks.length}</span>
              </h2>
              <ul>
                {g.tasks.map((t) => {
                  const due = dueLabel(t.dueDate);
                  const cols = sortedColumns(t.project);
                  return (
                    <li key={t._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-0">
                      <div className="min-w-0 flex-1 basis-60">
                        <Link to={`/tasks/${t._id}`} className={cx("block truncate text-sm font-medium hover:underline", g.key === "done" && "text-muted line-through")}>
                          {t.title}
                        </Link>
                        <p className="truncate text-xs text-muted">
                          <Link to={`/projects/${t.project._id}`} className="hover:underline">{t.project.name}</Link>
                          {t.project.isArchived && " · archived"}
                        </p>
                      </div>
                      <PriorityBadge priority={t.priority} />
                      <span className={cx("w-24 text-right text-xs text-muted", due?.tone === "late" && "font-semibold text-danger", due?.tone === "soon" && "font-medium text-[#a86a00]")}>{due?.text ?? ""}</span>
                      <Select
                        aria-label={`Stage for ${t.title}`}
                        value={t.columnId}
                        disabled={t.project.isArchived}
                        onChange={(e) => changeStage(t, e.target.value)}
                        className="h-9 w-auto min-w-36"
                      >
                        {cols.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
