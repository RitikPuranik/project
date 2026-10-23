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

## 🚀 Architecture & Tech Stack

```
project/
├── backend/                       # Express.js REST API + MongoDB (Mongoose) + JWT Auth
│   ├── server.js                  # Boot only: env, database connection, listen
│   ├── app.js                     # createApp(): middleware + module routes (reused by tests)
│   ├── config/                    # Database connection
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
   ```

5. Start the backend server:
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

## 🔑 First Run & Authentication

1. Open your browser and navigate to `http://localhost:5173/register`.
2. **Default Role**: All newly registered users default to **`viewer`**.
3. **Admin Bootstrap**: The first administrator is designated directly in MongoDB (e.g. `db.users.updateOne({ email: "admin@example.com" }, { $set: { role: "admin" } })`).
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
- `/projects/:id` — Interactive Kanban board with drag-and-drop column workflow
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
- `POST /api/auth/refresh` — Refresh expired JWT access token
- `POST /api/auth/logout` — Invalidate refresh token
- `GET /api/auth/me` — Retrieve authenticated user profile

### Projects (`/api/projects`)
- `GET /api/projects` — List all accessible projects
- `POST /api/projects` — Create a project (Admin only; optional `managerId`)
- `GET /api/projects/:id` — Get project details and columns
- `PUT /api/projects/:id` — Update project information
- `PUT /api/projects/:id/archive` — Toggle project archive state
- `POST /api/projects/:id/clone` — Duplicate project structure (Admin & PM)
- `DELETE /api/projects/:id` — Delete project (Admin only)
- `POST /api/projects/:id/members` — Add member (`role`: `member`, `viewer`, or `project_manager` — admin only)
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
- `GET /api/users?search=` — Search users by name or email
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

Tests: `cd backend && npm test` (roles + concurrency, no MongoDB needed). Browser test of the conflict UI: `frontend/e2e/conflict.e2e.mjs`.
