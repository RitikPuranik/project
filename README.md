# ProjectFlow — Project Management Dashboard

A full-stack MERN app: JWT auth with roles (Admin / Project Manager / Member), project boards,
drag-and-drop Kanban, task management (priority, type, due date, story points, subtasks,
labels, comments, multi-assignee), filtering, soft delete, archive, and project cloning.

## What's included vs. simplified
Included and working end-to-end:
- Register/login, JWT access + refresh tokens, "remember me", protected routes, role-based
  permissions (route-level `authorize()` + ownership checks in controllers)
- Project CRUD, soft delete, archive, clone, member add/remove
- Kanban board with drag-and-drop (`@hello-pangea/dnd`), customizable columns
- Task CRUD: priority (color-coded), type, due date, story points, multi-assignee, labels,
  subtask checklist, comments
- Filter tasks by assignee / priority (query params also support type, label, due date range)

Simplified / not wired up (structure is ready, needs real credentials to finish):
- **Email verification & password reset emails** — needs an SMTP/mail provider (e.g. Nodemailer
  + SendGrid). The `User` model has a placeholder note for `resetToken`/`resetExpires` fields.
- **Social login (Google/GitHub)** — needs OAuth app credentials; would plug into
  `authController.js` alongside the existing JWT flow.
- **Rich text editor** — the description field currently stores plain text/HTML string; swap
  the `<textarea>` in `TaskModal.jsx` for something like `react-quill` if you want a real editor.

## Folder structure
```
pm-dashboard/
  backend/     Express + MongoDB + JWT API
  frontend/    React (Vite) client
```

## Prerequisites
- Node.js 18+ and npm
- MongoDB running locally, OR a free MongoDB Atlas cluster (connection string)

## 1. Backend setup
```bash
cd backend
npm install
cp .env.example .env
```
Open `.env` and set:
- `MONGO_URI` — local (`mongodb://127.0.0.1:27017/pm-dashboard`) or your Atlas connection string
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — any long random strings (different from each other)

Start MongoDB locally if you're not using Atlas (skip if you already have `mongod` running):
```bash
# Ubuntu/Debian, if not installed: sudo apt install -y mongodb
sudo systemctl start mongod
```

Run the API:
```bash
npm run dev
```
It starts on `http://localhost:5000`. Check it's alive: `http://localhost:5000/api/health`.

## 2. Frontend setup
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
It starts on `http://localhost:5173` and proxies `/api` calls to the backend (see `vite.config.js`).

## 3. First run
1. Go to `http://localhost:5173/register`.
2. The **first person to register automatically becomes Admin** (see `authController.js`).
   Register a second account normally to test the "Member" role, and use the Admin's
   `PUT /api/users/:id/role` endpoint (via Postman/curl) to promote someone to
   `project_manager` if you want to test that role too.
3. Log in, create a project, open it, add tasks, and drag them across columns.

## Notes for deployment later
- Set `CLIENT_URL` in the backend `.env` to your deployed frontend URL (for CORS).
- Build the frontend with `npm run build` (outputs to `frontend/dist`) and serve it from any
  static host (Vercel, Netlify) or from Express itself.
- Common free hosts: MongoDB Atlas (DB), Render/Railway (API), Vercel/Netlify (frontend).

## Extending it further
- Add the `resetToken` flow + Nodemailer for real password reset emails
- Add Google/GitHub OAuth strategies (`passport-google-oauth20`, `passport-github2`)
- Add a project "activity log" collection to show real member activity history
- Add Socket.io for real-time collaboration (live task updates across users)
