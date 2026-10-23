# Orbin — Project & Task Management Platform

A modern, responsive full-stack project and task management system built with Express, MongoDB, React, TypeScript, and Tailwind CSS. Features role-based access control (Admin, Project Manager, Member), interactive Kanban board, customizable columns, task tracking with priorities and subtasks, activity comments, member management, project cloning, and archiving.

---

## 🚀 Architecture & Tech Stack

```
project/
├── backend/            # Express.js REST API + MongoDB (Mongoose) + JWT Auth
│   ├── config/         # Database connection & constants (roles, statuses)
│   ├── controllers/    # Business logic (auth, projects, tasks, users)
│   ├── middleware/     # Role-based access control (`protect`, `authorize`)
│   ├── models/         # Mongoose schemas (User, Project, Task)
│   ├── routes/         # Express API route handlers
│   ├── utils/          # JWT token generation & helpers
│   ├── .env.example    # Backend environment variable template
│   ├── .gitignore      # Ignores .env and node_modules
│   └── package.json
└── frontend/           # React 19 + TypeScript + Vite + Tailwind CSS v4
    ├── src/
    │   ├── components/ # Navbar, TaskModal, ProtectedRoute, etc.
    │   ├── context/    # AuthContext with token state & persistence
    │   ├── lib/        # Axios API client configured via environment variables
    │   ├── pages/      # Dashboard, Projects, Board, Tasks, Team, Users, Profile
    │   └── styles/     # Modern design system & typography
    ├── .env            # Local frontend environment file (VITE_API_URL)
    ├── .env.example    # Frontend environment variable template
    ├── .gitignore      # Ignores local env and build artifacts
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
| Manage Users & Roles (`/users`) | ✅ | ❌ | ❌ | ❌ |
| Create New Projects | ✅ | ✅ | ❌ | ❌ |
| Add Viewers as Project Members | ✅ | ✅ | ❌ | ❌ |
| Clone & Archive Projects | ✅ | ✅ | ❌ | ❌ |
| Manage Project Team Roster | ✅ | ✅ | ❌ | ❌ |
| Create, Edit & Move Tasks | ✅ | ✅ | ✅ (Own projects) | ❌ |
| Add Comments & Checklists | ✅ | ✅ | ✅ | ❌ |
| Delete Projects & Tasks | ✅ | Project-level | ❌ | ❌ |

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
- `/register` — Account registration (first user becomes Admin)
- `/dashboard` — Overview of active projects, assigned tasks, and quick actions
- `/projects` — Project listing, creation, cloning, and archiving
- `/projects/:id` — Interactive Kanban board with drag-and-drop column workflow
- `/projects/:id/tasks` — Tabular task list with status, priority, and assignee filters
- `/projects/:id/team` — Member roster and invitation management
- `/tasks/:id` — Detailed task modal with subtasks, comments, priority, and metadata
- `/users` — Admin-only role management dashboard
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
- `POST /api/projects` — Create a project (Admin & PM)
- `GET /api/projects/:id` — Get project details and columns
- `PUT /api/projects/:id` — Update project information
- `PUT /api/projects/:id/archive` — Toggle project archive state
- `POST /api/projects/:id/clone` — Duplicate project structure (Admin & PM)
- `DELETE /api/projects/:id` — Delete project
- `POST /api/projects/:id/members` — Add member to project
- `DELETE /api/projects/:id/members/:userId` — Remove member from project

### Tasks (`/api/projects/:projectId/tasks`)
- `GET /api/projects/:projectId/tasks` — List tasks with filters (`assignee`, `priority`)
- `POST /api/projects/:projectId/tasks` — Create task
- `PUT /api/projects/:projectId/tasks/:id` — Update task details
- `PUT /api/projects/:projectId/tasks/:id/move` — Update task column position
- `POST /api/projects/:projectId/tasks/:id/subtasks` — Add checklist item
- `PUT /api/projects/:projectId/tasks/:id/subtasks/:subtaskId` — Toggle checklist item
- `POST /api/projects/:projectId/tasks/:id/comments` — Add comment
- `DELETE /api/projects/:projectId/tasks/:id` — Delete task

### Users (`/api/users`)
- `GET /api/users?search=` — Search users by name or email
- `PUT /api/users/:id/role` — Update user role (`admin`, `project_manager`, `member`) (Admin only)

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
