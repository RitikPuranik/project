import { Link } from "react-router-dom";
import { dueLabel } from "@/lib/format";
import type { Task } from "@/lib/types";
import { AvatarStack, PriorityBadge, TypeBadge, cx } from "./ui";

export function TaskCard({
  task,
  done,
  dragging,
  readOnly,
  ...drag
}: {
  task: Task;
  done: boolean;
  dragging?: boolean;
  readOnly?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  const due = dueLabel(task.dueDate);
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <article
      {...drag}
      draggable={!readOnly}
      className={cx(
        "rounded-xl border border-line bg-surface p-3 transition-colors hover:border-[#c0c4dc]",
        !readOnly && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40"
      )}
    >
      <Link to={`/tasks/${task._id}`} draggable={false} className="block text-[15px] leading-snug font-medium hover:text-accent-strong">
        {task.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <TypeBadge type={task.type} />
      </div>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span key={l} className="rounded bg-wash px-1.5 py-0.5 text-xs text-muted">{l}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-3">
          {due && !done && (
            <span className={cx(due.tone === "late" && "font-semibold text-danger", due.tone === "soon" && "font-medium text-[#a86a00]")}>{due.text}</span>
          )}
          {task.subtasks.length > 0 && <span>{subDone}/{task.subtasks.length} subtasks</span>}
        </span>
        {task.assignees.length > 0 && <AvatarStack people={task.assignees} max={3} size={22} />}
      </div>
    </article>
  );
}
