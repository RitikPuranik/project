import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import AuthLayout from "./components/AuthLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectLayout from "./pages/ProjectLayout";
import Board from "./pages/Board";
import ProjectTasks from "./pages/ProjectTasks";
import Team from "./pages/Team";
import TaskDetail from "./pages/TaskDetail";
import Users from "./pages/Users";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectLayout />}>
          <Route index element={<Board />} />
          <Route path="tasks" element={<ProjectTasks />} />
          <Route path="team" element={<Team />} />
        </Route>
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/users" element={<Users />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
