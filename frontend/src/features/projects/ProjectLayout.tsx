import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import api, { TASKS_CHANGED } from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { canManageProject, errorMessage, formatDate, isDone, percent, projectPeople } from "@/shared/lib/format";
import { ProjectContext } from "@/features/projects/projectContext";
import type { Project, Task } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { AvatarStack, Button, ConfirmModal, ErrorNote, PageLoader, StatusPill, cx, useToast } from "@/shared/components/ui";
import { ProjectForm } from "@/features/projects/ProjectForm";

/** Status / task counts / completion / manager. Refetches whenever any task is written. */
function ProjectMetrics({ project }: { project: Project }) {
  const { data: tasks, reload } = useFetch(() => api.get<Task[]>(`/projects/${project._id}/tasks`).then((r) => r.data), [project._id]);
  useEffect(() => {
    window.addEventListener(TASKS_CHANGED, reload);
    return () => window.removeEventListener(TASKS_CHANGED, reload);
  }, [reload]);

  const total = tasks?.length ?? 0;
  const done = (tasks ?? []).filter((t) => isDone(t, project)).length;
  const manager = project.members.find((m) => m.role === "project_manager")?.user;
  const items: [string, React.ReactNode][] = [
    ["Status", <StatusPill key="s" archived={!!project.isArchived} />],
    ["Tasks", tasks ? total : "–"],
    ["Completed", tasks ? `${done} / ${total} · ${percent(done, total)}%` : "–"],
    ["Project manager", manager?.name ?? <span className="font-normal text-muted">Not assigned</span>],
  ];
  return (
    <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="bg-surface px-5 py-3.5">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ProjectLayout() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: project, error, reload } = useFetch(() => api.get<Project>(`/projects/${id}`).then((r) => r.data), [id]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [permanent, setPermanent] = useState(false);

  if (error && !project) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorNote message={error} onRetry={reload} />
        <Link to="/projects" className="text-sm font-medium text-accent-strong underline">Back to projects</Link>
      </div>
    );
  }
  if (!project) return <PageLoader label="Loading project" />;

  const canManage = canManageProject(project, user);
  const canClone = user?.role === "admin" || user?.role === "project_manager";
  const canDelete = user?.role === "admin";

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const tab = ({ isActive }: { isActive: boolean }) =>
    cx(
      "relative px-1 pb-3 text-sm font-medium transition-colors",
      isActive ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent" : "text-muted hover:text-ink"
    );

  const dates = [project.startDate && formatDate(project.startDate), project.endDate && formatDate(project.endDate)].filter(Boolean);

  return (
    <ProjectContext.Provider value={{ project, reload, canManage }}>
      <Link to="/projects" className="mb-3 inline-block text-sm text-muted hover:text-ink">← Projects</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] leading-tight font-semibold">{project.name}</h1>
            {project.isArchived && <StatusPill archived />}
          </div>
          {project.description && <p className="mt-1 max-w-2xl text-sm text-muted">{project.description}</p>}
          {dates.length > 0 && <p className="mt-1 text-xs text-faint">{dates.join(" – ")}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AvatarStack people={projectPeople(project)} />
          {canManage && (
            <>
              {!project.isArchived && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
              <Button size="sm" onClick={() => run(() => api.put(`/projects/${project._id}/archive`), project.isArchived ? "Project restored" : "Project archived")}>
                {project.isArchived ? "Unarchive" : "Archive"}
              </Button>
            </>
          )}
          {canClone && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const { data } = await api.post<Project>(`/projects/${project._id}/clone`);
                  toast("Project cloned");
                  navigate(`/projects/${data._id}`);
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
            >
              Clone
            </Button>
          )}
          {canDelete && <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleting(true)}>Delete</Button>}
        </div>
      </div>

      <ProjectMetrics project={project} />

      <nav aria-label="Project" className="mt-6 mb-6 flex gap-6 border-b border-line">
        <NavLink to={`/projects/${project._id}`} end className={tab}>Board</NavLink>
        <NavLink to={`/projects/${project._id}/tasks`} className={tab}>Tasks</NavLink>
        <NavLink to={`/projects/${project._id}/team`} className={tab}>Team</NavLink>
      </nav>

      <Outlet />

      {editing && (
        <ProjectForm
          open
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast("Project updated");
            reload();
          }}
        />
      )}
      <ConfirmModal
        open={deleting}
        title="Delete this project?"
        body={
          permanent
            ? `"${project.name}", all of its tasks and their comments will be erased for good. This can't be undone.`
            : `"${project.name}" and its tasks will be removed from everyone's view.`
        }
        confirmLabel={permanent ? "Delete permanently" : "Delete project"}
        onClose={() => {
          setDeleting(false);
          setPermanent(false);
        }}
        onConfirm={async () => {
          try {
            await api.delete(`/projects/${project._id}`, { params: permanent ? { permanent: true } : undefined });
            toast(permanent ? "Project permanently deleted" : "Project deleted");
            navigate("/projects", { replace: true });
          } catch (err) {
            toast(errorMessage(err), "error");
            setDeleting(false);
            setPermanent(false);
          }
        }}
      >
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} className="size-4 accent-[#b0412c]" />
          Delete permanently (can&apos;t be undone)
        </label>
      </ConfirmModal>
    </ProjectContext.Provider>
  );
}
