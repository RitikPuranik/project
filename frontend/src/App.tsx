import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/shared/components/AppShell";
import AuthLayout from "@/features/auth/AuthLayout";
import Login from "@/features/auth/Login";
import GoogleCallback from "@/features/auth/GoogleCallback";
import Register from "@/features/auth/Register";
import ForgotPassword from "@/features/auth/ForgotPassword";
import Dashboard from "@/features/dashboard/Dashboard";
import Projects from "@/features/projects/Projects";
import ProjectLayout from "@/features/projects/ProjectLayout";
import Board from "@/features/tasks/Board";
import ProjectTasks from "@/features/tasks/ProjectTasks";
import Team from "@/features/projects/Team";
import TaskDetail from "@/features/tasks/TaskDetail";
import Users from "@/features/users/Users";
import Profile from "@/features/auth/Profile";

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/auth/google/callback" element={<GoogleCallback />} />
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
