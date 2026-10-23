import { createContext, useContext } from "react";
import type { Project } from "./types";

export interface ProjectCtx {
  project: Project;
  reload: () => void;
  canManage: boolean;
}
export const ProjectContext = createContext<ProjectCtx | null>(null);
export function useProject(): ProjectCtx {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside a project route");
  return ctx;
}
