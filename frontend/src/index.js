import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { StudentRegistrationForm } from "./components/StudentRegistrationForm";
import "./styles.css";

const ROUTE_VIEWS = [
  { path: "/dashboard", view: "dashboard" },
  { path: "/students", view: "students" },
  { path: "/requested-students", view: "requested-students" },
  { path: "/accounts", view: "accounts" },
  { path: "/student-detail", view: "student-detail" },
  { path: "/tasks", view: "tasks" },
  { path: "/stage-escalations", view: "stage-escalations" },
  { path: "/counselors", view: "counselors" },
  { path: "/branch", view: "branch" },
  { path: "/messages", view: "messages" },
  { path: "/resume", view: "resume" },
  { path: "/uni-database", view: "university" },
  { path: "/university", view: "university" },
  { path: "/calendar", view: "calendar" },
  { path: "/integration", view: "integration" },
  { path: "/finance", view: "finance" },
  { path: "/settings", view: "settings" }
];

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {ROUTE_VIEWS.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={<App key={route.view} initialView={route.view} />}
          />
        ))}
        <Route path="/student-reg-form" element={<StudentRegistrationForm />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
