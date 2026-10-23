import { useState } from "react";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/auth";
import { canComment, canDeleteComment, formatDateTime } from "@/shared/lib/format";
import type { Project, Task } from "@/shared/lib/types";
import { Avatar, Button, ConfirmModal, Textarea } from "@/shared/components/ui";

/**
 * Comments for a task: read (everyone with access), add (admin / PM / member) and delete
 * (author, or admin / PM). The API enforces the same rules; this only decides what to show.
 * `act` runs a request and reloads the task, handling conflicts like the rest of the task page.
 */
export function CommentsSection({
  task,
  project,
  base,
  act,
}: {
  task: Task;
  project: Project;
  base: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const commenting = canComment(project, user);

  return (
    <>
      <section aria-labelledby="com-h" className="rounded-2xl border border-line bg-surface p-5">
        <h2 id="com-h" className="mb-4 text-base font-semibold">Comments <span className="text-sm font-normal text-muted">{task.comments.length}</span></h2>
        <ul className="flex flex-col gap-4">
          {task.comments.map((c) => (
            <li key={c._id} className="flex gap-3">
              <Avatar person={c.author} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><span className="font-medium">{c.author.name}</span> <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span></p>
                <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{c.text}</p>
              </div>
              {canDeleteComment(project, user, c.author._id) && (
                <Button size="sm" variant="ghost" className="h-fit text-danger hover:text-danger" aria-label={`Delete comment by ${c.author.name}`} onClick={() => setDeletingComment(c._id)}>
                  Delete
                </Button>
              )}
            </li>
          ))}
          {task.comments.length === 0 && <li className="text-sm text-muted">{commenting ? "No comments yet. Start the conversation." : "No comments yet."}</li>}
        </ul>
        {commenting && <form
          className="mt-5 flex flex-col items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            setPosting(true);
            await act(() => api.post(`${base}/comments`, { text: comment.trim() }));
            setComment("");
            setPosting(false);
          }}
        >
          <Textarea aria-label="Write a comment" placeholder={`Comment as ${user?.name ?? "you"}`} value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-20" />
          <Button type="submit" variant="primary" loading={posting} disabled={!comment.trim()}>Post comment</Button>
        </form>}
      </section>
      <ConfirmModal
        open={!!deletingComment}
        title="Delete this comment?"
        body="This can't be undone."
        confirmLabel="Delete comment"
        onClose={() => setDeletingComment(null)}
        onConfirm={async () => {
          const id = deletingComment;
          setDeletingComment(null);
          if (id) await act(() => api.delete(`${base}/comments/${id}`));
        }}
      />
    </>
  );
}
