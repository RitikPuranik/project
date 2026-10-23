# Orbin — Project & Task Management Platform

A modern, responsive full-stack project and task management system built with Express, MongoDB, React, TypeScript, and Tailwind CSS. Features role-based access control (Admin, Project Manager, Member, Viewer), interactive Kanban board, customizable columns, task tracking with priorities and subtasks, activity comments, member management, project cloning, and archiving.

---

## ✅ What is implemented

| Area | Implemented |
|---|---|
| **Authentication** | Registration (new accounts start as Viewer), login, JWT access + refresh tokens, logout, `GET /auth/me`, automatic token refresh in the frontend |
| **User management** | Admin-only user creation with a chosen role, editing (name, email, role, password reset), role assignment, deactivation / reactivation (`isActive`), admin Users screen. Deactivated users are blocked at login, refresh **and on every request with an otherwise valid JWT** (`403 ACCOUNT_DEACTIVATED`) and are signed out in the UI. Guards: no self-deactivation, no self role change, the last active admin can't be removed |
| **Roles** | Admin, Project Manager, Team Member, Viewer (global), plus a project-level Viewer role for read-only participants |
| **Projects** | Admin-only create and delete; list, details, edit, archive/unarchive, clone, soft delete, customizable columns, dates; members add/remove; admin can assign a Project Manager at creation or from the Team tab. Every project/task read goes through a project-access check (non-participants get 403) |
| **Project UI** | Project list with search/archive filter, creation form (with Project Manager picker), project page with Board / Tasks / Team tabs |
| **Tasks** | Create, list (filters), read one, update, move between columns, delete, subtasks, priorities, types, due dates, labels, story points, multiple assignees. Assignees must be active, non-viewer project participants |
| **Task permissions** | Admin/PM: everything in their projects. Team Member: only tasks assigned to them, and only description / labels / story points, status moves and subtasks. Viewer: read-only. Enforced on the server |
| **Concurrent edits** | Optimistic concurrency via a task `version` (409 on conflict, 428 if missing) with a conflict-resolution UI |
| **Comments** | Add, read (with the task) and delete. Authors delete their own comments; admins and project managers can delete any; Viewers and non-participants can't comment or delete. 2000-character limit. Comments section with delete (and confirmation) on the task page |
| **Dashboard & UI** | Dashboard, Kanban board with drag-and-drop, task list, task detail page, profile, role matrix |
| **Code structure** | Modular on both sides: backend `modules/{auth,users,projects,tasks,comments}` and frontend `features/{auth,dashboard,users,projects,tasks,comments}`, with common code in `shared/` |
| **Tests** | `cd backend && npm test` — authorization, concurrency and user-management regression tests (in-memory database fake, no MongoDB needed) |

---

## 🆕 Workspace additions (ported from the Planora project)

| Area | What was added |
|---|---|
| **Dashboard** | Time-of-day greeting, four stat cards (active projects, total tasks, completed, people), a task-progress ring and a link to *My tasks* |
| **My tasks** (`/my-tasks`) | Every task assigned to you across all projects, grouped *Overdue / Due this week / Later / No due date / Completed*, with Open / Done / All view, project + priority filters and an inline stage dropdown (version-checked, so a stale edit still returns 409) |
| **Team** (`/team`) | Directory of everyone you share a project with, their role and the projects you have in common, with search |
| **Projects list** | Active / Archived / All filter with counts, status pill, member count on each card |
| **Project page** | Metrics strip (status, task count, completed x / y and %, project manager) that refreshes whenever a task changes; admins can choose **Delete permanently** (removes the project, its tasks and comments) instead of the default soft delete |
| **Project team tab** | "Add a member" now lists every eligible person straight away (searchable) via `available-members`, with their global role |
| **Users (admin)** | Projects and Tasks columns per user |
| **Shell** | Grouped sidebar (Workspace / Administration / Account), breadcrumb, *Quick tips* card; dev-only one-click demo accounts on the sign-in page |

New / extended API (all backward compatible; lists remain plain arrays):

| Endpoint | Notes |
|---|---|
| `GET /api/tasks/mine` | Tasks assigned to the caller across accessible projects; `project` is `{ _id, name, columns, isArchived }` |
| `GET /api/projects/:id/members` | Owner + members with project roles (any participant) |
| `GET /api/projects/:id/available-members?search=` | Active, non-admin users not yet on the project (managers/admin only) |
| `GET /api/projects?search=&status=active\|archived` | Name search and status filter (the older `?archived=` still works) |
| `GET /api/projects/:id/tasks?search=&assignee=none&columnId=` | Text search over title/description, unassigned filter, column filter |
| `?page=&limit=` on project and task lists | Opt-in paging; totals in `X-Total-Count`, `X-Total-Pages`, `X-Page`, `X-Limit` response headers |
| `GET /api/users?counts=true` | Admin only: adds `projectCount` and `taskCount` per user |
| `DELETE /api/projects/:id?permanent=true` | Admin only: hard delete of the project and its tasks |
| `PUT /api/tasks/:id/move` | `order` is now optional; omit it to append the task to the end of the column |
| `GET /api/health` | Now reports the database state (`503` when MongoDB is disconnected) |

---

## ✉️ Email (EmailJS)

All emails (OTP codes, forgot password, welcome, password-changed, verification) are sent from the **backend** through one EmailJS template.

**EmailJS template fields** (Email Templates → your template):

| Field | Value |
|---|---|
| Subject | `{{subject}}` |
| To Email | `{{to_email}}` |
| From Name | `{{from_name}}` |
| Content (HTML) | `{{{html_body}}}` |

**Backend `.env`:** `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` (EmailJS → Account → API keys), optional `EMAIL_FROM_NAME`.
In EmailJS → Account → Security, enable **Allow EmailJS API for non-browser applications**, otherwise server calls are rejected.
Without these variables, dev mode just prints the email (including OTP) to the backend console; production refuses to start the reset flow.

| Endpoint | What it does |
|---|---|
| `POST /api/auth/forgot-password` `{email}` | Emails a 6-digit code (same response whether or not the account exists; 60 s resend cooldown) |
| `POST /api/auth/verify-reset-otp` `{email, otp}` | Checks the code (10 min expiry, single use, locks after 5 wrong tries) and returns a 10-minute `resetToken` |
| `POST /api/auth/reset-password` `{resetToken, newPassword}` | Sets the password, signs out all sessions, sends a "password changed" notice; the token stops working once used |
| `POST /api/auth/send-verification` / `verify-email` `{otp}` | Signed-in email-verification OTP (sets `isVerified`; not enforced at login) |

Welcome emails go out on registration, first Google sign-in and admin-created accounts; admin password resets send the "password changed" notice. New email types: add a builder in `shared/email/templates.js` and call `sendEmail()` / `sendEmailQuietly()`.
Frontend: **Forgot password?** link on the sign-in page → `/forgot-password` (three steps: email → verify code → new password).

---

## 🚀 Architecture & Tech Stack

```
project/
├── backend/                       # Express.js REST API + MongoDB (Mongoose) + JWT Auth
│   ├── server.js                  # Boot only: env, database connection, listen
│   ├── app.js                     # createApp(): middleware + module routes (reused by tests)
│   ├── config/                    # Database connection
│   ├── migrations/                # Versioned DB migrations + runner.js
│   ├── scripts/                   # migrate.js, seed.js (CLI entry points)
│   ├── seed/                      # demoData.js (demo users, projects, tasks)
│   ├── modules/                   # One folder per feature, each with its own model/controller/routes
│   │   ├── index.js               # registerRoutes(): mounts every module under /api
│   │   ├── auth/                  # auth.controller.js, auth.routes.js
│   │   ├── users/                 # user.model.js, user.controller.js, user.routes.js
│   │   ├── projects/              # project.model.js, project.controller.js, project.routes.js,
│   │   │                          # project.access.js (project/task access guards)
│   │   ├── tasks/                 # task.model.js, task.controller.js, task.routes.js
│   │   └── comments/              # comment.controller.js, comment.routes.js (mounted under a task)
│   ├── shared/                    # Code used by several modules
│   │   ├── constants/             # roles.js (who may manage / comment)
│   │   ├── middleware/            # auth.js (protect, authorize, blockViewerWrites), errorHandler.js
│   │   └── utils/                 # token.js (JWT), http.js (forbidden, serverError)
│   ├── test/                      # Authorization, concurrency and user-management tests
│   ├── .env.example
│   └── package.json
└── frontend/                      # React 19 + TypeScript + Vite + Tailwind CSS v4
    ├── src/
    │   ├── main.tsx, App.tsx      # Entry point and routes
    │   ├── features/              # One folder per feature (pages + components + context together)
    │   │   ├── auth/              # Login, Register, Profile, AuthLayout, auth context
    │   │   ├── dashboard/         # Dashboard
    │   │   ├── users/             # Users page, UserForm, RoleMatrix
    │   │   ├── projects/          # Projects, ProjectLayout, ProjectForm, Team, project context
    │   │   ├── tasks/             # Board, ProjectTasks, TaskDetail, TaskForm, TaskCard
    │   │   └── comments/          # CommentsSection (add / list / delete)
    │   └── shared/                # Used by several features
    │       ├── components/        # ui kit, AppShell
    │       └── lib/               # api client, types, format & permission helpers, useFetch
    ├── .env.example
    └── package.json
```

---

## 🛠 Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **MongoDB**: Local MongoDB instance (`mongodb://127.0.0.1:27017/orbin`) or MongoDB Atlas URI

---

## 📦 Getting Started

### 1. Backend Setup

1. Open your terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Verify your `backend/.env` file:
   ```env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/orbin
   JWT_SECRET=your_jwt_access_secret_key_here_min_32_chars
   JWT_EXPIRES_IN=1d
   JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_here_min_32_chars
   JWT_REFRESH_EXPIRES_IN=7d
   CLIENT_URL=http://localhost:5173
   # Optional - Google sign-in (see "Google sign-in setup")
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
   ```

5. Apply the database migrations and (optionally) load demo data — see [Database migrations & seed data](#-database-migrations--seed-data):
   ```bash
   npm run migrate
   npm run seed
   ```

6. Start the backend server:
   ```bash
   # Development mode with nodemon
   npm run dev

   # Or standard start
   npm start
   ```
   The backend API will run on **`http://localhost:5000`**. You can verify health status at `http://localhost:5000/api/health`.

---

### 2. Frontend Setup

1. Open a second terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure your `frontend/.env` file:
   ```env
   # Backend API Base URL
   VITE_API_URL=http://localhost:5000/api
   ```
   > **Note:** All API calls in the frontend use `import.meta.env.VITE_API_URL` via `src/lib/api.ts`. There are zero hardcoded URLs in application code.

5. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The client will be running on **`http://localhost:5173`**.

---

## ⚙️ Environment variables

**Backend (`backend/.env`)**

| Variable | Required | Description |
|---|:---:|---|
| `MONGO_URI` | ✅ | MongoDB connection string, e.g. `mongodb://localhost:27017/orbin` or an Atlas URI |
| `JWT_SECRET` | ✅ | Secret for access tokens (32+ characters) |
| `JWT_REFRESH_SECRET` | ✅ | Secret for refresh tokens (32+ characters, different from the above) |
| `JWT_EXPIRES_IN` | | Access-token lifetime (default `1d`) |
| `JWT_REFRESH_EXPIRES_IN` | | Refresh-token lifetime (default `7d`) |
| `PORT` | | API port (default `5000`) |
| `CLIENT_URL` | | Allowed CORS origin, e.g. `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | | Google OAuth "Web application" client ID |
| `GOOGLE_CLIENT_SECRET` | | The client's secret (backend only, never exposed to the browser) |
| `GOOGLE_CALLBACK_URL` | | Redirect URI Google returns to. Default `http://localhost:5000/api/auth/google/callback`; must match the Google client exactly |

**Frontend (`frontend/.env`)**

| Variable | Required | Description |
|---|:---:|---|
| `VITE_API_URL` | | API base URL. Leave unset in dev (Vite proxies `/api` to `localhost:5000`) |

**Google sign-in setup:**
1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Credentials* → *Create credentials* → *OAuth client ID* → type **Web application** (configure the consent screen first if asked; add yourself as a test user while it's in "Testing").
2. Under **Authorized redirect URIs** add `http://localhost:5000/api/auth/google/callback` (your `GOOGLE_CALLBACK_URL`; use your API's public URL in production).
3. Copy the **Client ID** and **Client secret** into `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and restart the backend. Nothing is needed in the frontend `.env`.
4. Click **Continue with Google** on `/login` or `/register`. Flow: browser → `GET /api/auth/google` → Google → `GET /api/auth/google/callback` → back to `CLIENT_URL/auth/google/callback`, signed in.

New Google users start as **Viewer**; an existing account with the same verified email is linked and keeps its role. Deactivated accounts can't sign in. If the variables are missing, the login page shows which ones to set.

---

## 🗄 Database migrations & seed data

MongoDB is schemaless, so migrations are small versioned scripts in `backend/migrations/` (`NNNN_description.js`, each exporting `up(db)` and `down(db)`). Applied migrations are recorded in the `schema_migrations` collection and run in filename order, once.

Run these from `backend/` (they read `MONGO_URI` from `.env`):

| Command | What it does |
|---|---|
| `npm run migrate` | Apply all pending migrations (creates indexes, backfills defaults) |
| `npm run migrate:status` | List which migrations are applied / pending |
| `npm run migrate:down` | Roll back the most recent migration (`npm run migrate:down -- 2` for the last two) |
| `npm run seed` | Apply pending migrations, then create the demo users, projects and tasks. Safe to re-run: existing demo users/projects are kept |
| `npm run seed:reset` | Delete the demo data, then re-create it from scratch (resets demo passwords) |
| `npm run seed:bulk` | Everything `seed` does, **plus a large generated dataset**: 40 users, 20 projects and ~1,500 tasks (with subtasks, comments, labels, due dates, a few archived projects, deactivated users and soft-deleted tasks). Skipped if bulk data already exists |
| `npm run seed:bulk -- --scale=5` | Same, 5× larger (200 users, 100 projects, ~7,500 tasks). `--scale` takes any whole number |
| `npm run seed:bulk:reset` | Remove all demo and bulk data and regenerate it |

To add a migration, create `backend/migrations/0003_your_change.js` exporting `up` and `down`. Seed content lives in `backend/seed/demoData.js` (hand-written demo) and `backend/seed/bulkData.js` (generator; the same scale always produces the same data). Bulk accounts are `user0001@bulk.orbin.test` … with the same demo password; the first two are admins, and bulk projects are named `[Bulk] …`.

Seeded data: five users (one per role plus a second member), an active **Orbin Demo Project** with tasks in every column, subtasks and a comment, and an archived **Legacy Website (Archived)** project.

### Demo credentials

All demo accounts use the password **`Password@123`**.

| Role | Email |
|---|---|
| Admin | `admin@orbin.test` |
| Project Manager | `pm@orbin.test` |
| Team Member | `member@orbin.test` |
| Team Member | `member2@orbin.test` |
| Viewer | `viewer@orbin.test` |

> Demo accounts are for local development only. Don't run `npm run seed` against a production database.

---

## 🔑 First Run & Authentication

1. Open your browser and navigate to `http://localhost:5173/register`.
2. **Default Role**: All newly registered users default to **`viewer`**.
3. **Admin Bootstrap**: Run `npm run seed` for a ready-made admin (`admin@orbin.test`), or designate one directly in MongoDB (e.g. `db.users.updateOne({ email: "admin@example.com" }, { $set: { role: "admin" } })`).
4. **Role Promotions**:
   - **Admin** can promote any user to **Project Manager** (or any other role) from `/users`.
   - **Project Managers** can select **Viewers** and add them to projects as **Members**.

---

## 🔐 Roles, Permissions & Visibility Rules

### Role Capabilities

| Capability | Admin | Project Manager | Team Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| Create, edit & deactivate users, assign roles (`/users`) | ✅ | ❌ | ❌ | ❌ |
| Create & delete projects | ✅ | ❌ | ❌ | ❌ |
| Assign a Project Manager to a project | ✅ | ❌ | ❌ | ❌ |
| Edit, archive & clone projects | ✅ | ✅ (assigned projects) | ❌ | ❌ |
| Manage project team (members, project viewers) | ✅ | ✅ (assigned projects) | ❌ | ❌ |
| Create, assign & delete tasks | ✅ | ✅ (assigned projects) | ❌ | ❌ |
| Edit assigned tasks, change status, subtasks | ✅ | ✅ | ✅ (own assigned tasks, limited fields) | ❌ |
| Read projects, tasks & comments | ✅ (all) | ✅ (own projects) | ✅ (own projects) | ✅ (own projects) |
| Add comments | ✅ | ✅ | ✅ | ❌ |
| Delete comments | ✅ (any) | ✅ (any in own projects) | ✅ (own comments) | ❌ |

### Visibility Hierarchy
- **Admin**: Can see all users, projects, tasks, and system activities across the entire workspace.
- **Project Manager**:
  - Can see other Project Managers.
  - Can see their own project team members (not members of other managers' projects).
  - Can see Viewers (to invite and assign them to projects).
- **Team Member**:
  - Can see fellow members in their projects and their respective Project Manager(s).
  - Cannot see unrelated team members from other projects.
- **Viewer**:
  - Read-only access scoped strictly to themselves until assigned to a project.

---

## 🧭 Frontend Application Routes

- `/login` — User login with JWT access/refresh token exchange
- `/register` — Account registration (new accounts start as Viewer; an admin grants higher roles)
- `/dashboard` — Overview of active projects, assigned tasks, and quick actions
- `/projects` — Project listing, creation, cloning, and archiving
- `/projects/:id` — Interactive Kanban board with drag-and-drop; the **+** on a column opens the full task form (title, assignees, priority, etc.); drag a card onto the **Drag here to delete** zone to delete it (with confirmation)
- `/projects/:id/tasks` — Tabular task list with status, priority, and assignee filters
- `/projects/:id/team` — Member roster and invitation management
- `/tasks/:id` — Detailed task modal with subtasks, comments, priority, and metadata
- `/users` — Admin-only user management (create, edit, roles, deactivate)
- `/profile` — User profile settings and session overview

---

## 📡 Backend API Endpoints

### Auth (`/api/auth`)
- `POST /api/auth/register` — Register a new account
- `POST /api/auth/login` — Sign in and receive access/refresh tokens
- `GET /api/auth/google` — Start Google sign-in (redirects to Google)
- `GET /api/auth/google/callback` — Google redirect target; creates/links the account and returns to the app signed in
- `POST /api/auth/refresh` — Refresh expired JWT access token
- `POST /api/auth/logout` — Invalidate refresh token
- `GET /api/auth/me` — Retrieve authenticated user profile

### Projects (`/api/projects`)
- `GET /api/projects` — List all accessible projects (optional `?archived=true|false`)
- `POST /api/projects` — Create a project (Admin only; optional `managerId`)
- `GET /api/projects/:id` — Get project details and columns
- `PUT /api/projects/:id` — Update project information
- `PUT /api/projects/:id/archive` — Toggle project archive state. Archived projects are read-only (writes return `409 PROJECT_ARCHIVED`)
- `POST /api/projects/:id/clone` — Duplicate project structure (Admin & PM)
- `DELETE /api/projects/:id` — Delete project (Admin only)
- `POST /api/projects/:id/members` — Add member (`role`: `member`, `viewer`, or `project_manager` — admin only)
- `PUT /api/projects/:id/members/:userId/role` — Change a member's project role (`member`, `viewer`, or `project_manager` — admin only)
- `DELETE /api/projects/:id/members/:userId` — Remove member from project

### Tasks (`/api/projects/:projectId/tasks`)
- `GET /api/projects/:projectId/tasks` — List tasks with filters (`assignee`, `priority`)
- `POST /api/projects/:projectId/tasks` — Create task
- `PUT /api/projects/:projectId/tasks/:id` — Update task details
- `PUT /api/projects/:projectId/tasks/:id/move` — Update task column position
- `POST /api/projects/:projectId/tasks/:id/subtasks` — Add checklist item
- `PUT /api/projects/:projectId/tasks/:id/subtasks/:subtaskId` — Toggle checklist item
- `POST /api/projects/:projectId/tasks/:id/comments` — Add comment
- `DELETE /api/projects/:projectId/tasks/:id/comments/:commentId` — Delete comment (author, or admin/PM)
- `DELETE /api/projects/:projectId/tasks/:id` — Delete task

### Users (`/api/users`)
- `GET /api/users?search=&role=&status=` — Search users by name or email; admins can also filter by `role` and `status` (`active` / `inactive`)
- `GET /api/users/:id` — View one user (Admin only)
- `POST /api/users` — Create a user with a role (Admin only)
- `PUT /api/users/:id` — Update name, email, role, password (Admin only)
- `PUT /api/users/:id/role` — Update user role (Admin only)
- `PUT /api/users/:id/deactivate` / `PUT /api/users/:id/activate` — Deactivate or reactivate an account (Admin only)

---

## 🛡 Security & Environment Hygiene

- **`.gitignore`**: Configured in both backend and frontend roots to ensure `.env` files and secrets are never committed to version control.
- **`.env.example`**: Clear templates provided in both `backend` and `frontend` with all required variables.
- **Zero Hardcoded URLs**: API calls use `import.meta.env.VITE_API_URL` falling back to `/api` proxy in dev, and automatic token refresh via Axios interceptors in `frontend/src/lib/api.ts`.

---

## 🔄 Concurrent edits (optimistic concurrency)

Every task has a `version` number (starts at `0`, +1 on each successful change).

- Clients send the version they loaded with every **update, move, subtask toggle** (`body.version`) and **delete** (`?version=N`).
- The server applies the change with a single conditional `findOneAndUpdate({ _id, version })`, so two people saving from the same version can never both succeed — the loser gets **`409 Conflict`** with `{ code: "VERSION_CONFLICT", currentVersion, task }` (the latest task).
- A missing/invalid version is rejected with **`428 Precondition Required`**; editing a task someone deleted meanwhile returns `404`.
- Comments and *adding* a subtask are append-only atomic `$push` operations: they never conflict with edits and don't change the version.
- The edit form sends only the fields you changed. On a 409 it shows what the other person changed and lets you **load the latest version** or **keep your edits** (merged onto the latest) before saving again.

Tests: `cd backend && npm test` (roles, concurrency, users, project members, archiving, Google sign-in, migrations; no MongoDB needed). Browser test of the conflict UI: `frontend/e2e/conflict.e2e.mjs`.
