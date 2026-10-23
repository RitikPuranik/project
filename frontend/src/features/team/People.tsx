import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { projectPeople } from "@/shared/lib/format";
import type { Person, Project } from "@/shared/lib/types";
import { useFetch } from "@/shared/lib/useFetch";
import { Avatar, EmptyState, ErrorNote, Input, PageHeader, PageLoader, RoleBadge } from "@/shared/components/ui";

interface Entry {
  person: Person;
  projects: Pick<Project, "_id" | "name" | "isArchived">[];
}

/** Everyone you share a project with, with the projects you have in common. */
export default function People() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const { data, error, reload } = useFetch(() => api.get<Project[]>("/projects").then((r) => r.data));

  const people = useMemo<Entry[]>(() => {
    const byId = new Map<string, Entry>();
    for (const project of data ?? []) {
      for (const person of projectPeople(project)) {
        const entry = byId.get(person._id) ?? { person, projects: [] };
        entry.projects.push({ _id: project._id, name: project.name, isArchived: project.isArchived });
        byId.set(person._id, entry);
      }
    }
    return [...byId.values()].sort((a, b) => a.person.name.localeCompare(b.person.name));
  }, [data]);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <PageLoader label="Loading your team" />;

  const needle = q.trim().toLowerCase();
  const shown = people.filter(({ person }) => !needle || person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle));

  return (
    <>
      <PageHeader title="Team" subtitle="People collaborating with you across your projects." />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Input type="search" aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <span className="text-sm text-muted">{shown.length} {shown.length === 1 ? "person" : "people"}</span>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={people.length ? "No one matches" : "No teammates yet"}
          body={people.length ? "Try a different name or email." : "People you share a project with will appear here."}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ person, projects }) => (
            <li key={person._id} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-start gap-3">
                <Avatar person={person} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {person.name}
                    {person._id === user?._id && <span className="ml-2 text-xs font-normal text-muted">You</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{person.email}</p>
                </div>
                {person.role && <RoleBadge role={person.role} />}
              </div>
              <div className="mt-auto">
                <p className="mb-1.5 text-xs text-muted">{projects.length} shared {projects.length === 1 ? "project" : "projects"}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {projects.slice(0, 3).map((p) => (
                    <li key={p._id}>
                      <Link to={`/projects/${p._id}`} className="inline-block max-w-48 truncate rounded-full bg-wash px-2.5 py-0.5 text-xs font-medium text-ink hover:bg-line">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                  {projects.length > 3 && <li className="px-1 py-0.5 text-xs text-muted">+{projects.length - 3} more</li>}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
