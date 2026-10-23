import { useAuth } from "@/lib/auth";
import { Avatar, Button, PageHeader, RoleBadge } from "@/components/ui";
import { RoleMatrix } from "@/components/RoleMatrix";
import { ROLE_SUMMARY } from "@/lib/format";

export default function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title="Profile" />
      <section className="max-w-xl rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-4">
          <Avatar person={user} size={64} />
          <div>
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>
        <dl className="mt-6 divide-y divide-line text-sm">
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted">Role</dt>
            <dd>{user.role && <RoleBadge role={user.role} />}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted">What you can do</dt>
            <dd className="max-w-xs text-right">
              {user.role && ROLE_SUMMARY[user.role]}
            </dd>
          </div>
        </dl>
        <div className="mt-6"><Button onClick={logout}>Sign out</Button></div>
      </section>
      <h2 className="mt-10 mb-3 text-lg font-semibold">What each role can do</h2>
      <RoleMatrix current={user.role} />
    </>
  );
}
