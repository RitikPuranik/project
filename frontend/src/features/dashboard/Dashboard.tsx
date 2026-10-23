import { Link } from "react-router-dom";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { daysFromToday, dueLabel, greeting, isDone, percent, projectPeople } from "@/shared/lib/format";
import type { Project, Task } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { EmptyState, ErrorNote, PageLoader, PriorityBadge, ProgressRing, StageBar, StatCard, cx } from "@/shared/components/ui";

interface Row {
  project: Project;
  tasks: Task[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, reload } = useFetch<Row[]>(async () => {
    const { data: projects } = await api.get<Project[]>("/projects");
    return Promise.all(
      projects
        .filter((p) => !p.isArchived)
        .map(async (project) => ({
          project,
          tasks: await api.get<Task[]>(`/projects/${project._id}/tasks`).then((r) => r.data).catch(() => []),
        }))
    );
  });

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <PageLoader label="Loading dashboard" />;

  const mine = data
    .flatMap(({ project, tasks }) => tasks.filter((t) => t.assignees.some((a) => a._id === user?._id) && !isDone(t, project)).map((t) => ({ t, project })))
    .sort((a, b) => (a.t.dueDate ?? "9999").localeCompare(b.t.dueDate ?? "9999"));
  const overdue = mine.filter(({ t }) => t.dueDate && daysFromToday(t.dueDate) < 0).length;
  const thisWeek = mine.filter(({ t }) => t.dueDate && daysFromToday(t.dueDate) >= 0 && daysFromToday(t.dueDate) <= 7).length;
  const first = user?.name.split(" ")[0] ?? "there";

  // Workspace-wide numbers for the stat cards (active projects only).
  const allTasks = data.flatMap(({ project, tasks }) => tasks.map((t) => ({ t, project })));
  const doneCount = allTasks.filter(({ t, project }) => isDone(t, project)).length;
  const completion = percent(doneCount, allTasks.length);
  const peopleCount = new Set(data.flatMap(({ project }) => projectPeople(project).map((p) => p._id))).size;

  const headline =
    mine.length === 0
      ? "You're all caught up."
      : overdue > 0
        ? `${overdue} of your tasks ${overdue === 1 ? "is" : "are"} overdue.`
        : thisWeek > 0
          ? `${thisWeek} ${thisWeek === 1 ? "task is" : "tasks are"} due this week.`
          : `${mine.length} open ${mine.length === 1 ? "task" : "tasks"} assigned to you.`;

  return (
    <>
      <p className="text-sm text-muted">{greeting()}, {first}</p>
      <h1 className="mt-1 mb-6 text-[34px] leading-tight font-semibold">{headline}</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active projects" value={data.length} hint="Projects in motion" tone="accent" />
        <StatCard label="Total tasks" value={allTasks.length} hint="Across your projects" tone="blue" progress={completion} />
        <StatCard label="Completed" value={doneCount} hint={`${completion}% completion rate`} tone="accent" progress={completion} />
        <StatCard label="People" value={peopleCount} hint="Collaborating with you" tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="mine-h" className="h-fit rounded-2xl border border-line bg-surface xl:row-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="mine-h" className="text-lg font-semibold">Assigned to you</h2>
            <span className="flex items-center gap-3 text-sm text-muted">{mine.length} open<Link to="/my-tasks" className="font-medium text-accent-strong hover:underline">View all</Link></span>
          </div>
          {mine.length === 0 ? (
            <div className="p-5"><EmptyState title="Nothing assigned" body="Tasks assigned to you will show up here, soonest due first." /></div>
          ) : (
            <ul>
              {mine.slice(0, 12).map(({ t, project }) => {
                const due = dueLabel(t.dueDate);
                return (
                  <li key={t._id} className="border-b border-line last:border-0">
                    <Link to={`/tasks/${t._id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-paper/70">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-xs text-muted">{project.name}</p>
                      </div>
                      <PriorityBadge priority={t.priority} />
                      <span className={cx("w-24 text-right text-xs text-muted", due?.tone === "late" && "font-semibold text-danger", due?.tone === "soon" && "font-medium text-[#a86a00]")}>{due?.text ?? ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="proj-h" className="h-fit rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="proj-h" className="text-lg font-semibold">Projects</h2>
            <Link to="/projects" className="text-sm font-medium text-accent-strong hover:underline">View all</Link>
          </div>
          {data.length === 0 ? (
            <div className="p-5"><EmptyState title="No projects yet" body="Projects you own or belong to appear here." /></div>
          ) : (
            <ul>
              {data.slice(0, 6).map(({ project, tasks }) => (
                <li key={project._id} className="border-b border-line last:border-0">
                  <Link to={`/projects/${project._id}`} className="block px-5 py-3.5 hover:bg-paper/70">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <span className="text-xs text-muted">{tasks.filter((t) => isDone(t, project)).length}/{tasks.length}</span>
                    </div>
                    <StageBar columns={project.columns} tasks={tasks} height={6} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="progress-h" className="h-fit rounded-2xl border border-line bg-surface xl:col-start-2">
          <div className="border-b border-line px-5 py-4">
            <h2 id="progress-h" className="text-lg font-semibold">Task progress</h2>
            <p className="text-sm text-muted">Where the work stands right now.</p>
          </div>
          <div className="flex flex-col items-center gap-5 px-5 py-6">
            <ProgressRing value={completion} />
            <dl className="flex w-full justify-center gap-8 text-sm">
              <div className="text-center">
                <dt className="flex items-center justify-center gap-1.5 text-muted"><span className="size-2 rounded-full bg-accent" aria-hidden />Completed</dt>
                <dd className="font-display mt-0.5 text-xl font-semibold tabular-nums">{doneCount}</dd>
              </div>
              <div className="text-center">
                <dt className="flex items-center justify-center gap-1.5 text-muted"><span className="size-2 rounded-full bg-wash ring-1 ring-line" aria-hidden />Remaining</dt>
                <dd className="font-display mt-0.5 text-xl font-semibold tabular-nums">{allTasks.length - doneCount}</dd>
              </div>
            </dl>
            <Link to="/my-tasks" className="text-sm font-medium text-accent-strong hover:underline">See my tasks →</Link>
          </div>
        </section>
      </div>
    </>
  );
}
