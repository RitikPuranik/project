import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { formatDate, projectPeople } from "@/shared/lib/format";
import type { Project, Task } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { AvatarStack, Button, EmptyState, ErrorNote, Input, PageHeader, PageLoader, Segmented, StageBar, StatusPill, useToast } from "@/shared/components/ui";
import { ProjectForm } from "@/features/projects/ProjectForm";

interface Row {
  project: Project;
  tasks: Task[];
}

export default function Projects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("active");

  const { data, error, loading, reload } = useFetch<Row[]>(async () => {
    const { data: projects } = await api.get<Project[]>("/projects");
    return Promise.all(
      projects.map(async (project) => ({
        project,
        tasks: await api.get<Task[]>(`/projects/${project._id}/tasks`).then((r) => r.data).catch(() => []),
      }))
    );
  });

  const canCreate = user?.role === "admin";
  const rows = (data ?? []).filter(
    (r) =>
      (status === "all" || (status === "archived") === !!r.project.isArchived) &&
      r.project.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const archivedCount = (data ?? []).filter((r) => r.project.isArchived).length;
  const total = (data ?? []).length;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Everything your team is working on."
        actions={canCreate && <Button variant="primary" onClick={() => setCreating(true)}>New project</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Input type="search" aria-label="Search projects" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
        <Segmented
          label="Project status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active", count: total - archivedCount },
            { value: "archived", label: "Archived", count: archivedCount },
            { value: "all", label: "All", count: total },
          ]}
        />
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && <PageLoader label="Loading projects" />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={data?.length ? "No projects match" : "No projects yet"}
          body={data?.length ? "Try a different search or status filter." : canCreate ? "Create your first project to start adding tasks." : "You'll see projects here once someone adds you to one."}
          action={!data?.length && canCreate ? <Button variant="primary" onClick={() => setCreating(true)}>New project</Button> : undefined}
        />
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ project, tasks }) => {
          const last = project.columns[project.columns.length - 1];
          const done = last ? tasks.filter((t) => t.columnId === [...project.columns].sort((a, b) => a.order - b.order).at(-1)!.id).length : 0;
          return (
            <li key={project._id}>
              <Link to={`/projects/${project._id}`} className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-[#cdbf9f]">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg leading-snug font-semibold">{project.name}</h2>
                    <StatusPill archived={!!project.isArchived} />
                  </div>
                  <p className="clamp-2 mt-1 min-h-10 text-sm text-muted">{project.description || "No description yet."}</p>
                </div>
                <div>
                  <StageBar columns={project.columns} tasks={tasks} />
                  <p className="mt-2 flex justify-between text-xs text-muted">
                    <span>{tasks.length === 0 ? "No tasks yet" : `${done} of ${tasks.length} tasks done`}</span>
                    <span>{projectPeople(project).length} {projectPeople(project).length === 1 ? "member" : "members"}</span>
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <AvatarStack people={projectPeople(project)} />
                  {project.endDate && <span className="text-xs text-muted">Ends {formatDate(project.endDate)}</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {creating && (
        <ProjectForm
          open
          onClose={() => setCreating(false)}
          onSaved={(p) => {
            toast("Project created");
            navigate(`/projects/${p._id}`);
          }}
        />
      )}
    </>
  );
}
