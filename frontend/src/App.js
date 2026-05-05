import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoginScreen } from "./components/LoginScreen";
import { clearLoginSession, getLoginSessionUser, hasLoginSession, saveLoginSession } from "./authSession";
import { createAccount, createStudent, getAccounts, getStudents, updateStudent, updateAccountAvatar, updateAccountProfileContact, updateStudentAvatar, uploadStudentCv, uploadStudentDocument, sendChatMessage, getChats, getMeetingSettings, updateMeetingSettings, getBookings, createBooking, deleteBooking, getAppointments, createAppointment, updateAppointment, getActivities, createActivity, getInvoices, createInvoice, updateInvoice, getTasks, createTask, updateTask, deleteReqStudent } from "./authApi";
import { AdminDashboard } from "./components/AdminDashboard";
import { ManagerDashboard } from "./components/ManagerDashboard";
import { StudentList } from "./components/StudentList";
import { StudentProfile } from "./components/StudentProfile";
import { TaskManager } from "./components/TaskManager";
import { StageEscalations } from "./components/StageEscalations";
import { BranchAnalytics } from "./components/BranchAnalytics";
import { CounselorDashboard } from "./components/CounselorDashboard";
import { StudentDashboard } from "./components/StudentDashboard";
import { ChatInterface } from "./components/ChatInterface";
import { UniversityKnowledgeBase } from "./components/UniversityKnowledgeBase";
import { FinanceModule } from "./components/FinanceModule";
import { CalendarScheduler } from "./components/CalendarScheduler";
import { CounselorManagement } from "./components/CounselorManagement";
import { AccountsManagement } from "./components/AccountsManagement";
import { AdminSettings } from "./components/AdminSettings";
import { RequestedStudents } from "./components/RequestedStudents";
import { AIResumeBuilder } from "./components/AIResumeBuilder";
import { CreateTaskModal } from "./components/CreateTaskModal";
import { Bell, X } from "lucide-react";
import { filterTasksForCounselor } from "./counselorTaskScope";
import {
  computePipelineEscalations,
  filterEscalationsForCounselor,
  filterEscalationsForManager,
  normalizePipelineStatus
} from "./pipeline";
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const API_BASE = typeof process !== "undefined" && process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL
  : "http://localhost:3334";
const toAbsoluteAssetUrl = (avatar) => {
  if (!avatar) return avatar;
  if (String(avatar).startsWith("/assets/")) {
    return `${API_BASE}${avatar}`;
  }
  return avatar;
};
const VIEW_TO_PATH = {
  dashboard: "/dashboard",
  students: "/students",
  accounts: "/accounts",
  tasks: "/tasks",
  counselors: "/counselors",
  branch: "/branch",
  messages: "/messages",
  resume: "/resume",
  university: "/uni-database",
  calendar: "/calendar",
  finance: "/finance",
  settings: "/settings",
  "student-detail": "/student-detail",
  "requested-students": "/requested-students",
  "stage-escalations": "/stage-escalations"
};

function App({ initialView = "dashboard" }) {
  const navigate = useNavigate();
  const [authenticatedUser, setAuthenticatedUser] = useState(getLoginSessionUser());
  const [isAuthenticated, setIsAuthenticated] = useState(hasLoginSession);
  const [adminAvatar, setAdminAvatar] = useState("/CEO.png");
  const [students, setStudents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [messages, setMessages] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [bookingBlocks, setBookingBlocks] = useState([]);
  const [meetingSettings, setMeetingSettings] = useState({
    meetingDurationMinutes: 30,
    daySchedules: {
      0: { isOpen: true, startHour: 8, endHour: 17 },
      1: { isOpen: true, startHour: 8, endHour: 17 },
      2: { isOpen: true, startHour: 8, endHour: 17 },
      3: { isOpen: true, startHour: 8, endHour: 17 },
      4: { isOpen: true, startHour: 8, endHour: 17 },
      5: { isOpen: true, startHour: 8, endHour: 17 },
      6: { isOpen: true, startHour: 8, endHour: 17 }
    }
  });
  const [currentView, setCurrentView] = useState(initialView);
  const [currentRole, setCurrentRole] = useState(
    authenticatedUser?.role === "Manager" || authenticatedUser?.role === "Team Lead" || authenticatedUser?.role === "Counselor" || authenticatedUser?.role === "Country Coordinator" || authenticatedUser?.role === "Student" ? authenticatedUser.role : "Admin"
  );
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isCreateTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [taskModalStudent, setTaskModalStudent] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const addNotification = (title, message, type = "info") => {
    const id = generateId("notif");
    const notification = { id, title, message, type, timestamp: new Date().toISOString() };
    setNotifications((prev) => [...prev, notification]);
    setNotificationHistory((prev) => [notification, ...prev].slice(0, 100));
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5e3);
  };
  const toDisplayName = (email) => {
    const local = String(email || "").split("@")[0] || "User";
    return local.split(/[._-]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  };

  const getCurrentUserObject = () => {
    if (authenticatedUser && currentRole === authenticatedUser.role) {
      const byEmail = employees.find((e) => e.email.toLowerCase() === String(authenticatedUser.email || "").toLowerCase());
      if (byEmail) return byEmail;
      if (authenticatedUser.role === "Manager" || authenticatedUser.role === "Team Lead" || authenticatedUser.role === "Counselor" || authenticatedUser.role === "Country Coordinator" || authenticatedUser.role === "Admin") {
        return {
          id: authenticatedUser.id || `AUTH-${authenticatedUser.role}`,
          name: toDisplayName(authenticatedUser.email),
          role: authenticatedUser.role,
          branch: authenticatedUser.branch || "Colombo HQ",
          country: authenticatedUser.country || "",
          email: authenticatedUser.email || "",
          avatar: authenticatedUser.role === "Admin" ? adminAvatar : authenticatedUser.avatar || "/CEO.png"
        };
      }
    }
    if (currentRole === "Student") {
      const authenticatedStudent = students.find(
        (s) => String(s.email || "").toLowerCase() === String(authenticatedUser?.email || "").toLowerCase()
      );
      if (authenticatedStudent) return authenticatedStudent;
      if (students[0]) return students[0];
      return {
        id: authenticatedUser?.id || "STU-UNKNOWN",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: "Student",
        branch: authenticatedUser?.branch || "Colombo HQ",
        email: authenticatedUser?.email || "",
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || "/canadian.png",
      };
    } else if (currentRole === "Counselor") {
      const authEmail = String(authenticatedUser?.email || "").toLowerCase();
      const byEmail = employees.find((e) => String(e.email || "").toLowerCase() === authEmail);
      if (byEmail) {
        return {
          ...byEmail,
          id: authenticatedUser?.id || byEmail.id,
          role: "Counselor",
          email: authenticatedUser?.email || byEmail.email,
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar || byEmail.avatar) || "/assets/default-male-avatar.svg"
        };
      }
      return {
        id: authenticatedUser?.id || "EMP002",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: "Counselor",
        branch: authenticatedUser?.branch || "Colombo HQ",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || "/assets/default-male-avatar.svg"
      };
    } else if (currentRole === "Country Coordinator") {
      const authEmail = String(authenticatedUser?.email || "").toLowerCase();
      const byEmail = employees.find((e) => String(e.email || "").toLowerCase() === authEmail);
      if (byEmail) {
        return {
          ...byEmail,
          id: authenticatedUser?.id || byEmail.id,
          role: "Country Coordinator",
          email: authenticatedUser?.email || byEmail.email,
          country: byEmail.country || authenticatedUser?.country || "",
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar || byEmail.avatar) || "/assets/default-male-avatar.svg"
        };
      }
      return {
        id: authenticatedUser?.id || "COORD-1",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: "Country Coordinator",
        branch: authenticatedUser?.branch || "Colombo HQ",
        country: authenticatedUser?.country || "",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || "/assets/default-male-avatar.svg"
      };
    } else if (currentRole === "Manager" || currentRole === "Team Lead") {
      const authEmail = String(authenticatedUser?.email || "").toLowerCase();
      const byEmail = employees.find((e) => String(e.email || "").toLowerCase() === authEmail);
      if (byEmail) {
        return {
          ...byEmail,
          id: authenticatedUser?.id || byEmail.id,
          role: currentRole,
          email: authenticatedUser?.email || byEmail.email,
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar || byEmail.avatar) || "/assets/default-male-avatar.svg"
        };
      }
      return {
        id: authenticatedUser?.id || (currentRole === "Manager" ? "EMP004" : "EMP005"),
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: currentRole,
        branch: authenticatedUser?.branch || "Colombo HQ",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || "/assets/default-male-avatar.svg"
      };
    } else {
      return {
        id: authenticatedUser?.id || "ADMIN",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email || "Admin"),
        role: "Admin",
        branch: authenticatedUser?.branch || "",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(adminAvatar) || "/CEO.png"
      };
    }
  };
  const currentUser = getCurrentUserObject();
  const normalizeIdentity = (value) => String(value || "").trim().toLowerCase();
  const counselorScopedStudents = (() => {
    if (currentRole !== "Counselor") return students;
    const identitySet = /* @__PURE__ */ new Set();
    const addIdentity = (value) => {
      const normalized = normalizeIdentity(value);
      if (normalized) identitySet.add(normalized);
    };
    addIdentity(authenticatedUser?.id);
    addIdentity(authenticatedUser?.email);
    addIdentity(authenticatedUser?.username);
    addIdentity(currentUser?.id);
    addIdentity(currentUser?.email);
    addIdentity(currentUser?.name);
    const legacyEmployee = employees.find(
      (employee) => normalizeIdentity(employee.email) && normalizeIdentity(employee.email) === normalizeIdentity(authenticatedUser?.email)
    );
    addIdentity(legacyEmployee?.id);
    addIdentity(legacyEmployee?.name);
    if (identitySet.size === 0) return [];
    return students.filter((student) => identitySet.has(normalizeIdentity(student.counselor)));
  })();
  const managerDataScope = useMemo(() => {
    if (currentRole !== "Manager") {
      return { active: false, branchKey: "", branchLabel: "" };
    }
    const raw = String(currentUser?.branch || authenticatedUser?.branch || "").trim();
    return { active: !!raw, branchKey: raw.toLowerCase(), branchLabel: raw };
  }, [currentRole, currentUser?.branch, authenticatedUser?.branch]);
  const managerScopedStudents = useMemo(() => {
    if (currentRole !== "Manager" || !managerDataScope.active) return students;
    return students.filter(
      (s) => String(s.branch || "").trim().toLowerCase() === managerDataScope.branchKey
    );
  }, [students, currentRole, managerDataScope.active, managerDataScope.branchKey]);
  const managerScopedStudentIds = useMemo(
    () => new Set(managerScopedStudents.map((s) => s.id)),
    [managerScopedStudents]
  );
  const managerScopedTasks = useMemo(() => {
    if (currentRole !== "Manager" || !managerDataScope.active) return tasks;
    return tasks.filter((t) => {
      const sid = t.student_id || t.studentId;
      if (!sid) return false;
      return managerScopedStudentIds.has(String(sid));
    });
  }, [tasks, currentRole, managerDataScope.active, managerScopedStudentIds]);
  const managerScopedEmployees = useMemo(() => {
    if (currentRole !== "Manager" || !managerDataScope.active) return employees;
    return employees.filter(
      (e) => String(e.branch || "").trim().toLowerCase() === managerDataScope.branchKey
    );
  }, [employees, currentRole, managerDataScope.active, managerDataScope.branchKey]);
  const managerScopedActivities = useMemo(() => {
    if (currentRole !== "Manager" || !managerDataScope.active) return activities;
    return activities.filter((a) => {
      const sid = a.studentId || a.student_id;
      if (!sid) return true;
      return managerScopedStudentIds.has(String(sid));
    });
  }, [activities, currentRole, managerDataScope.active, managerScopedStudentIds]);
  const managerScopedAppointments = useMemo(() => {
    if (currentRole !== "Manager" || !managerDataScope.active) return appointments;
    return appointments.filter((apt) => managerScopedStudentIds.has(String(apt.studentId || "")));
  }, [appointments, currentRole, managerDataScope.active, managerScopedStudentIds]);
  const managerScopedInvoices = useMemo(() => {
    if (currentRole !== "Manager" || !managerDataScope.active) return invoices;
    return invoices.filter((inv) => managerScopedStudentIds.has(String(inv.studentId || "")));
  }, [invoices, currentRole, managerDataScope.active, managerScopedStudentIds]);
  const countryCoordinatorScope = useMemo(() => {
    if (currentRole !== "Country Coordinator") {
      return { active: false, countryKey: "", countryLabel: "" };
    }
    const raw = String(authenticatedUser?.country || currentUser?.country || "").trim();
    return { active: !!raw, countryKey: raw.toLowerCase(), countryLabel: raw };
  }, [currentRole, authenticatedUser?.country, currentUser?.country]);
  const countryCoordinatorScopedStudents = useMemo(() => {
    if (currentRole !== "Country Coordinator" || !countryCoordinatorScope.active) return students;
    return students.filter(
      (s) => String(s.country || "").trim().toLowerCase() === countryCoordinatorScope.countryKey
    );
  }, [students, currentRole, countryCoordinatorScope.active, countryCoordinatorScope.countryKey]);
  const countryCoordinatorStudentIds = useMemo(
    () => new Set(countryCoordinatorScopedStudents.map((s) => s.id)),
    [countryCoordinatorScopedStudents]
  );
  const countryCoordinatorScopedTasks = useMemo(() => {
    if (currentRole !== "Country Coordinator" || !countryCoordinatorScope.active) return tasks;
    return tasks.filter((t) => {
      const sid = t.student_id || t.studentId;
      if (!sid) return false;
      return countryCoordinatorStudentIds.has(String(sid));
    });
  }, [tasks, currentRole, countryCoordinatorScope.active, countryCoordinatorStudentIds]);
  const countryCoordinatorScopedAppointments = useMemo(() => {
    if (currentRole !== "Country Coordinator" || !countryCoordinatorScope.active) return appointments;
    return appointments.filter((apt) => countryCoordinatorStudentIds.has(String(apt.studentId || "")));
  }, [appointments, currentRole, countryCoordinatorScope.active, countryCoordinatorStudentIds]);
  const countryCoordinatorScopedInvoices = useMemo(() => {
    if (currentRole !== "Country Coordinator" || !countryCoordinatorScope.active) return invoices;
    return invoices.filter((inv) => countryCoordinatorStudentIds.has(String(inv.studentId || "")));
  }, [invoices, currentRole, countryCoordinatorScope.active, countryCoordinatorStudentIds]);
  const navMyTasksCount = useMemo(() => {
    if (currentRole === "Counselor") {
      return filterTasksForCounselor(tasks, currentUser, counselorScopedStudents).length;
    }
    if (currentRole === "Country Coordinator") {
      const coordTasks = countryCoordinatorScope.active ? countryCoordinatorScopedTasks : tasks;
      const monitoredStudents = countryCoordinatorScopedStudents;
      const ids = new Set((monitoredStudents || []).map((s) => String(s?.id || "").trim()).filter(Boolean));
      return (coordTasks || []).filter((task) => ids.has(String(task.student_id || task.studentId || "").trim())).length;
    }
    return void 0;
  }, [
    currentRole,
    tasks,
    currentUser,
    counselorScopedStudents,
    countryCoordinatorScope.active,
    countryCoordinatorScopedTasks,
    countryCoordinatorScopedStudents
  ]);
  const pipelineEscalationsAll = useMemo(() => computePipelineEscalations(students), [students]);
  const managerScopedEscalations = useMemo(() => {
    if (currentRole !== "Manager") return [];
    if (!managerDataScope.active || !managerDataScope.branchLabel) return pipelineEscalationsAll;
    return filterEscalationsForManager(pipelineEscalationsAll, managerDataScope.branchLabel, employees);
  }, [
    pipelineEscalationsAll,
    currentRole,
    managerDataScope.active,
    managerDataScope.branchLabel,
    employees
  ]);
  const teamLeadScopedEscalations = useMemo(() => {
    if (currentRole !== "Team Lead") return [];
    const b = String(currentUser?.branch || authenticatedUser?.branch || "").trim();
    if (!b) return pipelineEscalationsAll;
    return filterEscalationsForManager(pipelineEscalationsAll, b, employees);
  }, [pipelineEscalationsAll, currentRole, currentUser?.branch, authenticatedUser?.branch, employees]);
  const counselorScopedEscalations = useMemo(
    () => filterEscalationsForCounselor(pipelineEscalationsAll, currentUser, counselorScopedStudents),
    [pipelineEscalationsAll, currentUser, counselorScopedStudents]
  );
  const countryCoordinatorScopedEscalations = useMemo(
    () => filterEscalationsForCounselor(pipelineEscalationsAll, currentUser, countryCoordinatorScopedStudents),
    [pipelineEscalationsAll, currentUser, countryCoordinatorScopedStudents]
  );
  const pipelineEscalationNavBadge = useMemo(() => {
    if (currentRole === "Admin" && pipelineEscalationsAll.length > 0) return String(pipelineEscalationsAll.length);
    if (currentRole === "Manager" && managerScopedEscalations.length > 0) return String(managerScopedEscalations.length);
    if (currentRole === "Team Lead" && teamLeadScopedEscalations.length > 0) return String(teamLeadScopedEscalations.length);
    return "";
  }, [
    currentRole,
    pipelineEscalationsAll.length,
    managerScopedEscalations.length,
    teamLeadScopedEscalations.length
  ]);
  const counselorStageNavBadge = useMemo(() => {
    if (currentRole === "Counselor" && counselorScopedEscalations.length > 0) return String(counselorScopedEscalations.length);
    if (currentRole === "Country Coordinator" && countryCoordinatorScopedEscalations.length > 0) {
      return String(countryCoordinatorScopedEscalations.length);
    }
    return "";
  }, [
    currentRole,
    counselorScopedEscalations.length,
    countryCoordinatorScopedEscalations.length
  ]);
  const headerAvatar = currentRole === "Admin" ? toAbsoluteAssetUrl(adminAvatar) : toAbsoluteAssetUrl(currentUser?.avatar) || "/canadian.png";

  useEffect(() => {
    const loadEmployees = async () => {
      const result = await getAccounts();
      if (!result.ok) return;
      const mapped = result.data.filter((account) => account.role !== "Admin").map((account) => ({
        id: account.id,
        name: account.username || toDisplayName(account.email),
        username: account.username || toDisplayName(account.email),
        role: account.role,
        branch: account.branch || "",
        email: account.email || "",
        phone: account.phone || "",
        teamLeadId: account.teamLeadId || "",
        teamLeadName: account.teamLeadName || "",
        country: account.country || "",
        avatar: toAbsoluteAssetUrl(account.avatar) || "/assets/default-male-avatar.svg"
      }));
      setEmployees(mapped);
    };
    loadEmployees();
  }, []);
  useEffect(() => {
    const loadAdminAvatar = async () => {
      const result = await getAccounts();
      if (!result.ok) return;
      const admin = result.data.find((a) => a.role === "Admin");
      if (admin?.avatar) setAdminAvatar(toAbsoluteAssetUrl(admin.avatar));
    };
    loadAdminAvatar();
  }, []);
  useEffect(() => {
    const loadStudents = async () => {
      const result = await getStudents();
      if (!result.ok) return;
      setStudents(result.data);
    };
    loadStudents();
  }, []);
  useEffect(() => {
    const loadTasks = async () => {
      const result = await getTasks();
      if (!result.ok) return;
      setTasks(result.data);
    };
    loadTasks();
  }, []);
  useEffect(() => {
    const loadMeetingSettings = async () => {
      const result = await getMeetingSettings();
      if (!result.ok) return;
      setMeetingSettings(result.data);
    };
    loadMeetingSettings();
  }, []);
  useEffect(() => {
    const loadAppointments = async () => {
      const result = await getAppointments();
      if (!result.ok) return;
      setAppointments(result.data);
    };
    loadAppointments();
  }, []);
  useEffect(() => {
    const loadBookingBlocks = async () => {
      const result = await getBookings();
      if (!result.ok) return;
      setBookingBlocks(result.data);
    };
    loadBookingBlocks();
  }, []);
  useEffect(() => {
    const loadInvoices = async () => {
      const result = await getInvoices();
      if (!result.ok) return;
      setInvoices(result.data);
    };
    loadInvoices();
  }, []);
  useEffect(() => {
    const loadActivities = async () => {
      const result = await getActivities();
      if (!result.ok) return;
      setActivities(result.data);
    };
    loadActivities();
  }, []);
  useEffect(() => {
    const syncAuthenticatedUserAvatar = async () => {
      if (!authenticatedUser?.email) return;
      const result = await getAccounts();
      if (!result.ok) return;
      const account = result.data.find(
        (row) => String(row.email || "").toLowerCase() === String(authenticatedUser.email || "").toLowerCase()
      );
      if (!account?.avatar) return;
      setAuthenticatedUser((prev) => {
        if (!prev) return prev;
        if (prev.avatar === account.avatar) return prev;
        return { ...prev, avatar: toAbsoluteAssetUrl(account.avatar) };
      });
    };
    syncAuthenticatedUserAvatar();
  }, [authenticatedUser?.email]);
  useEffect(() => {
    let cancelled = false;
    const canShowUnreadBadge = currentRole === "Student" || currentRole === "Counselor" || currentRole === "Country Coordinator";
    if (!canShowUnreadBadge) {
      setUnreadMessageCount(0);
      return;
    }
    const userId = String(currentUser?.id || "").trim();
    if (!userId) {
      setUnreadMessageCount(0);
      return;
    }
    const loadUnreadCount = async () => {
      const result = await getChats(userId, { markRead: false });
      if (!result.ok || cancelled) return;
      const unread = (result.data || []).filter(
        (msg) => String(msg.receiverId || "") === userId && msg.read !== true
      ).length;
      setUnreadMessageCount(unread);
    };
    loadUnreadCount();
    const intervalId = setInterval(loadUnreadCount, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole, currentUser?.id]);
  const handleNavigate = (view) => {
    setCurrentView(view);
    const nextPath = VIEW_TO_PATH[view];
    if (nextPath && window.location.pathname !== nextPath) {
      navigate(nextPath);
    }
    if (view !== "student-detail") {
      setSelectedStudent(null);
    }
    if (view !== "tasks") {
      setSelectedTaskId(null);
    }
  };
  const handleSelectStudent = (student) => {
    const latestStudent = students.find((s) => s.id === student.id) || student;
    setSelectedStudent(latestStudent);
    setCurrentView("student-detail");
  };
  const handleSelectTask = (taskId) => {
    setSelectedTaskId(taskId);
    setCurrentView("tasks");
  };
  const handleAddActivity = (act) => {
    const genericLabels = new Set(["Counselor", "Country Coordinator", "Manager", "Team Lead", "Admin", "Student", "System"]);
    const explicitActor = String(act.actorName || "").trim();
    const explicitUser = String(act.user || "").trim();
    const sessionName = String(currentUser?.name || authenticatedUser?.username || "").trim();
    const actorName = explicitActor && !genericLabels.has(explicitActor) ? explicitActor : explicitUser && !genericLabels.has(explicitUser) ? explicitUser : sessionName || explicitUser || explicitActor || "System";
    const inferredStudentName = act.studentName || selectedStudent?.name || "";
    const inferredStudentId = act.studentId || selectedStudent?.id || "";
    const targetStudent = students.find((item) => item.id === inferredStudentId || item.name === inferredStudentName) || selectedStudent;
    const assignedCounselor = employees.find((employee) => employee.id === targetStudent?.counselor);
    const explicitCounselor = String(act.counselorName || "").trim();
    const counselorName = explicitCounselor && !genericLabels.has(explicitCounselor) ? explicitCounselor : assignedCounselor?.name || assignedCounselor?.username || (String(act.role || currentRole) === "Counselor" ? actorName : "");
    const nowIso = new Date().toISOString();
    const newActivity = {
      ...act,
      id: generateId("act"),
      timestamp: "Just now",
      createdAt: nowIso,
      actorName,
      studentName: inferredStudentName,
      studentId: inferredStudentId,
      counselorName
    };
    setActivities((prev) => [newActivity, ...prev]);
    createActivity(newActivity);
  };
  const handleUpdateStudent = async (updatedStudent) => {
    const previous = students.find((s) => s.id === updatedStudent.id);
    let payload = { ...updatedStudent };
    if (previous && String(previous.status || "") !== String(updatedStudent.status || "")) {
      payload = { ...payload, stageEnteredAt: new Date().toISOString() };
    }
    const newTasks = generateTasks(payload);
    if (newTasks.length > 0) {
      handleAddTasks(newTasks);
      addNotification("Auto Task Generation", `${newTasks.length} new tasks generated for ${payload.name}`, "info");
    }
    setStudents((prev) => prev.map((s) => s.id === payload.id ? payload : s));
    if (selectedStudent?.id === payload.id) {
      setSelectedStudent(payload);
    }
    const persisted = await updateStudent(payload.id, payload);
    if (!persisted.ok) {
      addNotification("Save failed", persisted.error || "Failed to save student changes.", "error");
      return;
    }
    const savedStudent = persisted.data;
    setStudents((prev) => prev.map((s) => s.id === savedStudent.id ? savedStudent : s));
    if (selectedStudent?.id === savedStudent.id) {
      setSelectedStudent(savedStudent);
    }
  };
  const handleTransferStudents = (fromCounselorId, toCounselorId) => {
    setStudents((prev) => prev.map((s) => s.counselor === fromCounselorId ? { ...s, counselor: toCounselorId } : s));
    setTasks((prev) => prev.map((t) => {
      if (t.assigned_to.includes(fromCounselorId)) {
        return {
          ...t,
          assigned_to: t.assigned_to.map((id) => id === fromCounselorId ? toCounselorId : id)
        };
      }
      return t;
    }));
    const fromName = employees.find((e) => e.id === fromCounselorId)?.name || fromCounselorId;
    const toName = employees.find((e) => e.id === toCounselorId)?.name || toCounselorId;
    handleAddActivity({
      user: currentUser?.name || "System",
      role: currentRole,
      action: "transferred students",
      target: `from ${fromName} to ${toName}`,
      type: "system"
    });
  };
  const handleAddCounselor = async (payload) => {
    const email = String(payload?.email || "").trim().toLowerCase();
    if (!email) {
      return { ok: false, error: "Email is required." };
    }
    const exists = employees.some((e) => e.email.toLowerCase() === email);
    if (exists) {
      return { ok: false, error: "A counselor with this email already exists." };
    }
    const maxEmployeeNumber = employees.reduce((max, employee) => {
      const match = String(employee.id || "").match(/^EMP(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const enteredPassword = String(payload?.password || "").trim();
    if (!enteredPassword) {
      return { ok: false, error: "Password is required." };
    }
    const accountResult = await createAccount({
      username: String(payload?.name || "").trim(),
      email,
      password: enteredPassword,
      role: "Consultor",
      branch: String(payload?.branch || "Colombo HQ").trim(),
      teamLeadId: "",
      teamLeadName: "",
      teamLeadEmail: ""
    });
    if (!accountResult.ok) {
      return { ok: false, error: accountResult.error || "Failed to save counselor account." };
    }
    const newEmployee = {
      id: `EMP${String(maxEmployeeNumber + 1).padStart(3, "0")}`,
      name: String(payload?.name || "").trim(),
      role: "Consultor",
      branch: String(payload?.branch || "Colombo HQ"),
      email,
      phone: String(payload?.phone || "").trim(),
      teamLeadId: "",
      teamLeadName: "",
      avatar: "/assets/default-male-avatar.svg"
    };
    setEmployees((prev) => [...prev, newEmployee]);
    addNotification("Counselor added", `${newEmployee.name} profile created and saved to accounts.`, "success");
    return { ok: true, data: accountResult.data || newEmployee };
  };
  const handleAddStudent = async (payload) => {
    let scopedPayload = payload;
    if (currentRole === "Manager" && managerDataScope.active && managerDataScope.branchLabel) {
      scopedPayload = { ...payload, branch: managerDataScope.branchLabel };
    }
    if (currentRole === "Country Coordinator" && countryCoordinatorScope.active && countryCoordinatorScope.countryLabel) {
      scopedPayload = { ...scopedPayload, country: countryCoordinatorScope.countryLabel };
    }
    const result = await createStudent(scopedPayload);
    if (!result.ok) {
      return { ok: false, error: result.error || "Failed to create student." };
    }
    setStudents((prev) => [result.data, ...prev]);
    addNotification("Student onboarded", `${result.data.name} added successfully.`, "success");
    return { ok: true, data: result.data };
  };
  const handleAddFromRequest = async (requestRow, { counselorId, priority: rawPriority }) => {
    if (!requestRow || !counselorId) {
      return { ok: false, error: "Select a counselor to continue." };
    }
    const allowedPriorities = new Set(["Low", "Medium", "High"]);
    const priority = allowedPriorities.has(String(rawPriority || "").trim())
      ? String(rawPriority).trim()
      : "Medium";
    let counselorBranch = "";
    const accountsRes = await getAccounts();
    if (accountsRes.ok) {
      const acc = accountsRes.data.find((a) => String(a.id || "") === String(counselorId));
      if (acc) counselorBranch = String(acc.branch || "").trim();
    }
    const byEmp = employees.find((e) => String(e.id || "") === String(counselorId));
    if (!counselorBranch && byEmp) counselorBranch = String(byEmp.branch || "").trim();
    const branch =
      currentRole === "Manager" && managerDataScope.active && managerDataScope.branchLabel
        ? managerDataScope.branchLabel
        : counselorBranch || String(requestRow.nearestOffice || "").trim() || "Colombo HQ";
    const random = Math.random().toString(36).slice(-5);
    const password = `Stu@${new Date().getFullYear()}${random}`;
    const noteParts = [
      `Interest form (${requestRow.id || "web"}).`,
      requestRow.city ? `City: ${requestRow.city}.` : "",
      requestRow.intendedProgram ? `Program: ${requestRow.intendedProgram}.` : "",
      requestRow.currentEducationLevel ? `Education: ${requestRow.currentEducationLevel}.` : "",
      requestRow.message ? `Message: ${requestRow.message}` : ""
    ];
    const notes = noteParts.filter(Boolean).join(" ").trim().slice(0, 1900);
    const payload = {
      name: String(requestRow.name || "").trim(),
      country: String(requestRow.countryToVisit || "").trim() || "UK",
      branch,
      email: String(requestRow.email || "").trim().toLowerCase(),
      phone: String(requestRow.phone || "").trim(),
      password,
      ielts: "Pending",
      gpa: "0.0",
      status: "Inquiry",
      budget: "",
      priority,
      counselor: counselorId,
      notes: notes || "From interest form.",
      lastEducationDate: new Date().toISOString().split("T")[0],
      documents: []
    };
    const created = await handleAddStudent(payload);
    if (!created.ok) {
      return created;
    }
    const reqId = String(requestRow.id || "").trim();
    let requestRowRemoved = !reqId;
    if (reqId) {
      const removed = await deleteReqStudent(reqId);
      requestRowRemoved = removed.ok;
      if (!removed.ok) {
        addNotification(
          "Interest form entry",
          removed.error || "Student was added, but the request could not be removed from the server file.",
          "warning"
        );
      }
    }
    return { ...created, requestRowRemoved };
  };
  const handleAddTask = async (newTask) => {
    const relatedStudent = students.find((s) => String(s.id || "") === String(newTask.student_id || ""));
    const resolvedCounselor = String(relatedStudent?.counselor || "").trim();
    const fallbackAssignees = Array.isArray(newTask.assigned_to) ? newTask.assigned_to : [];
    const autoAssignedTo = (() => {
      const base = [];
      if (resolvedCounselor) base.push(resolvedCounselor);
      if (!newTask.isPrivate && relatedStudent?.id) base.push(String(relatedStudent.id));
      if (base.length === 0) {
        return fallbackAssignees;
      }
      return Array.from(new Set(base));
    })();
    const payload = {
      ...newTask,
      assigned_to: autoAssignedTo,
      createdBy: String(currentUser?.id || authenticatedUser?.id || currentRole || "")
    };
    const saved = await createTask(payload);
    if (!saved.ok) {
      addNotification("Task failed", saved.error || "Failed to create task.", "error");
      return { ok: false, error: saved.error || "Failed to create task." };
    }
    setTasks((prev) => [saved.data, ...prev]);
    handleAddActivity({
      user: currentRole,
      role: currentRole,
      action: "created task",
      target: saved.data.task,
      type: "task"
    });
    return { ok: true, data: saved.data };
  };
  const handleAddTasks = (newTasks) => {
    setTasks([...newTasks, ...tasks]);
    if (newTasks.length > 0) {
      handleAddActivity({
        user: "System",
        role: "Admin",
        action: `dispatched ${newTasks.length} automated tasks`,
        target: "Intelligent Engine",
        type: "system"
      });
    }
  };
  const handleUpdateTasks = (updatedTasks) => {
    setTasks((prev) => {
      const newTasks = [...prev];
      updatedTasks.forEach((updated) => {
        const index = newTasks.findIndex((t) => t.id === updated.id);
        if (index !== -1) {
          if (newTasks[index].status !== updated.status) {
            handleAddActivity({
              user: currentRole,
              role: currentRole,
              action: `moved task to ${updated.status}`,
              target: updated.task,
              type: "task"
            });
          }
          newTasks[index] = updated;
        }
      });
      return newTasks;
    });
    updatedTasks.forEach((updatedTask) => {
      updateTask(updatedTask.id, updatedTask);
    });
  };
  const handleSendMessage = async (text, receiverId, attachment = null) => {
    const result = await sendChatMessage({
      senderId: currentUser.id,
      receiverId,
      content: text,
      platform: "portal",
      attachment
    });
    if (!result.ok) {
      addNotification("Message failed", result.error || "Failed to send message.", "error");
      return { ok: false, error: result.error || "Failed to send message." };
    }
    return { ok: true, data: result.data };
  };
  const handleCreateInvoice = async (newInv) => {
    const creatorName = String(currentUser?.name || authenticatedUser?.username || authenticatedUser?.email || currentRole || "System").trim();
    const payload = {
      ...newInv,
      createdByName: creatorName,
      createdById: String(currentUser?.id || authenticatedUser?.id || "").trim()
    };
    const saved = await createInvoice(payload);
    if (!saved.ok) {
      addNotification("Invoice failed", saved.error || "Failed to create invoice.", "error");
      return { ok: false, error: saved.error || "Failed to create invoice." };
    }
    setInvoices((prev) => [saved.data, ...prev]);
    handleAddActivity({ user: currentRole, role: currentRole, action: "generated invoice", target: `${saved.data.currency} ${saved.data.amount} for ${saved.data.studentId}`, type: "finance", studentId: saved.data.studentId });
    return { ok: true, data: saved.data };
  };
  const handleUpdateInvoice = async (updatedInv) => {
    const payload = {
      ...updatedInv,
      actorRole: currentRole,
      actorId: String(currentUser?.id || authenticatedUser?.id || "")
    };
    const saved = await updateInvoice(updatedInv.id, payload);
    if (!saved.ok) {
      addNotification("Invoice failed", saved.error || "Failed to update invoice.", "error");
      return { ok: false, error: saved.error || "Failed to update invoice." };
    }
    setInvoices((prev) => prev.map((inv) => inv.id === saved.data.id ? saved.data : inv));
    let action = "updated invoice";
    if (saved.data.status === "Paid") action = "confirmed payment";
    if (saved.data.status === "Verifying") action = "uploaded payment proof";
    handleAddActivity({ user: currentRole, role: currentRole, action, target: `${saved.data.id}`, type: "finance", studentId: saved.data.studentId });
    return { ok: true, data: saved.data };
  };
  const handleBookAppointment = async (newApt) => {
    const saved = await createAppointment(newApt);
    if (!saved.ok) {
      addNotification("Booking failed", saved.error || "Failed to save appointment.", "error");
      return { ok: false, error: saved.error || "Failed to save appointment." };
    }
    setAppointments((prev) => [...prev, saved.data]);
    const studentName = students.find((s) => s.id === newApt.studentId)?.name || "Unknown Student";
    const counselorName = employees.find((e) => e.id === newApt.counselorId)?.name || "Unknown Counselor";
    const preSessionTask = {
      id: generateId("T-PREP"),
      task: `Prep for ${newApt.type} with ${studentName}`,
      assigned_to: [newApt.counselorId],
      student_id: newApt.studentId,
      priority: "High",
      status: "Pending",
      dueDate: newApt.date,
      // Due by the session time
      tier: "Global",
      // Generic tier
      phase: 1,
      isBlocking: false
    };
    handleAddTask(preSessionTask);
    handleAddActivity({
      user: "System",
      role: "Admin",
      // System action
      action: "orchestrated session",
      target: `${studentName} scheduled a ${newApt.type} session with ${counselorName}`,
      type: "calendar"
    });
    return { ok: true, data: saved.data };
  };
  const generateTasks = (student) => {
    const newTasks = [];
    const existingTaskTypes = tasks.filter((t) => t.student_id === student.id).map((t) => t.documentType);
    const st = normalizePipelineStatus(student.status);
    if (st === "Documentation") {
      const requiredDocs = ["Passport", "Identity", "Transcript", "EnglishProficiency"];
      requiredDocs.forEach((docType) => {
        if (!existingTaskTypes.includes(docType)) {
          newTasks.push({
            id: generateId("T-AUTO"),
            task: `Upload ${docType}`,
            assigned_to: [student.counselor],
            student_id: student.id,
            priority: "High",
            status: "Pending",
            tier: "Global",
            phase: 1,
            isBlocking: true,
            documentType: docType
          });
        }
      });
    }
    if (student.targetUniversity) {
      const universityDocs = ["Portfolio", "ReferenceLetter"];
      universityDocs.forEach((docType) => {
        if (!existingTaskTypes.includes(docType)) {
          newTasks.push({
            id: generateId("T-AUTO"),
            task: `Upload ${docType} for ${student.targetUniversity}`,
            assigned_to: [student.counselor],
            student_id: student.id,
            priority: "Medium",
            status: "Pending",
            tier: "University",
            phase: 3,
            isBlocking: false,
            documentType: docType
          });
        }
      });
    }
    if (st === "Application") {
      let countryDocs = [];
      switch (student.country) {
        case "Australia":
          countryDocs = ["GTE", "OSHC", "Financials"];
          break;
        case "New Zealand":
          countryDocs = ["Financials", "PoliceClearance", "UpfrontMedicals"];
          break;
        case "UK":
          countryDocs = ["TBTest", "Financials"];
          break;
        case "Canada":
          countryDocs = ["SOP", "UpfrontMedicals"];
          break;
      }
      countryDocs.forEach((docType) => {
        if (!existingTaskTypes.includes(docType)) {
          newTasks.push({
            id: generateId("T-AUTO"),
            task: `Upload ${docType}`,
            assigned_to: [student.counselor],
            student_id: student.id,
            priority: "High",
            status: "Pending",
            tier: "Country",
            phase: 2,
            isBlocking: true,
            documentType: docType
          });
        }
      });
    }
    return newTasks;
  };
  const handleUpdateAppointment = async (updatedApt) => {
    const saved = await updateAppointment(updatedApt.id, updatedApt);
    if (!saved.ok) {
      addNotification("Update failed", saved.error || "Failed to update appointment.", "error");
      return { ok: false, error: saved.error || "Failed to update appointment." };
    }
    setAppointments((prev) => prev.map((a) => a.id === saved.data.id ? saved.data : a));
    if (updatedApt.status !== "Scheduled") {
      handleAddActivity({ user: currentRole, role: currentRole, action: `marked session as ${updatedApt.status}`, target: `${updatedApt.title} (${updatedApt.studentId})`, type: "calendar" });
    }
    return { ok: true, data: saved.data };
  };
  const handleUpdateProfileAvatar = async (avatarDataUrl) => {
    if (!authenticatedUser?.email) {
      return { ok: false, error: "No authenticated user." };
    }
    if (!avatarDataUrl || !String(avatarDataUrl).startsWith("data:image/")) {
      return { ok: false, error: "Invalid image selected." };
    }
    if (currentRole === "Student") {
      const studentId = currentUser?.id;
      if (!studentId) return { ok: false, error: "Student account not found." };
      const result = await updateStudentAvatar(studentId, avatarDataUrl);
      if (!result.ok) return result;
      const updatedStudent = result.data;
      setStudents((prev) => prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s));
      if (selectedStudent?.id === updatedStudent.id) {
        setSelectedStudent(updatedStudent);
      }
      setAuthenticatedUser((prev) => {
        const nextUser = { ...(prev || {}), avatar: updatedStudent.avatar };
        saveLoginSession(nextUser);
        return nextUser;
      });
      return { ok: true, data: updatedStudent };
    }
    const result = await updateAccountAvatar(authenticatedUser.email, avatarDataUrl);
    if (!result.ok) return result;
    const updatedAccount = result.data;
    const nextAvatar = toAbsoluteAssetUrl(updatedAccount.avatar);
    if (currentRole === "Admin") {
      setAdminAvatar(nextAvatar);
    }
    setEmployees((prev) => prev.map((e) => String(e.email || "").toLowerCase() === String(updatedAccount.email || "").toLowerCase() ? { ...e, avatar: nextAvatar } : e));
    setAuthenticatedUser((prev) => {
      const nextUser = { ...(prev || {}), avatar: nextAvatar };
      saveLoginSession(nextUser);
      return nextUser;
    });
    return { ok: true, data: updatedAccount };
  };
  const handleUpdateProfileContact = async ({ email, phone }) => {
    if (!authenticatedUser?.email) {
      return { ok: false, error: "No authenticated user." };
    }
    if (currentRole !== "Counselor") {
      return { ok: false, error: "Contact editing is only enabled for counselors." };
    }
    const result = await updateAccountProfileContact(authenticatedUser.email, email, phone);
    if (!result.ok) return result;
    const updatedAccount = result.data;
    setEmployees((prev) => prev.map((employee) => String(employee.id || "") === String(updatedAccount.id || "") ? {
      ...employee,
      email: updatedAccount.email,
      phone: updatedAccount.phone || "",
      role: updatedAccount.role || employee.role
    } : employee));
    setAuthenticatedUser((prev) => {
      const nextUser = { ...(prev || {}), email: updatedAccount.email, phone: updatedAccount.phone || "" };
      saveLoginSession(nextUser);
      return nextUser;
    });
    return { ok: true, data: updatedAccount };
  };
  const handleSaveCV = (cvData) => {
    if (currentRole === "Student") {
      const studentUser = currentUser;
      handleUpdateStudent({
        ...studentUser,
        generatedCV: cvData
      });
    } else if (selectedStudent) {
      handleUpdateStudent({
        ...selectedStudent,
        generatedCV: cvData
      });
    }
  };
  const handleUploadStudentCv = async ({ studentId, fileName, dataUrl }) => {
    if (!studentId) return { ok: false, error: "Student account not found." };
    if (!dataUrl) return { ok: false, error: "No CV file selected." };
    const result = await uploadStudentCv(studentId, dataUrl, fileName);
    if (!result.ok) return result;
    const updatedStudent = result.data;
    setStudents((prev) => prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s));
    if (selectedStudent?.id === updatedStudent.id) {
      setSelectedStudent(updatedStudent);
    }
    return { ok: true, data: updatedStudent };
  };
  const handleUploadStudentDocument = async ({ studentId, dataUrl, fileName, docType, phase, tier }) => {
    if (!studentId) return { ok: false, error: "Student account not found." };
    if (!dataUrl) return { ok: false, error: "No document file selected." };
    if (!docType) return { ok: false, error: "Document type is required." };
    const result = await uploadStudentDocument(studentId, { dataUrl, fileName, docType, phase, tier });
    if (!result.ok) return result;
    const updatedStudent = result.data;
    setStudents((prev) => prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s));
    if (selectedStudent?.id === updatedStudent.id) {
      setSelectedStudent(updatedStudent);
    }
    return { ok: true, data: updatedStudent, document: result.document || null };
  };
  const handleOpenCreateTaskModal = (student) => {
    setTaskModalStudent(student);
    setCreateTaskModalOpen(true);
  };
  const handleCloseCreateTaskModal = () => {
    setTaskModalStudent(null);
    setCreateTaskModalOpen(false);
  };
  const renderContent = () => {
    if (currentView === "messages") {
      const chatStudents =
        currentRole === "Counselor"
          ? counselorScopedStudents
          : currentRole === "Country Coordinator" && countryCoordinatorScope.active
            ? countryCoordinatorScopedStudents
            : currentRole === "Manager" && managerDataScope.active
              ? managerScopedStudents
              : students;
      return /* @__PURE__ */ jsx(ChatInterface, { currentRole, currentUser, messages, onSendMessage: handleSendMessage, students: chatStudents, employees });
    }
    if (currentView === "resume") {
      return /* @__PURE__ */ jsx(AIResumeBuilder, { onNavigate: handleNavigate, onSaveCV: handleSaveCV, currentStudent: currentRole === "Student" ? currentUser : null, onUploadStudentCv: handleUploadStudentCv });
    }
    if (currentView === "university") {
      return /* @__PURE__ */ jsx(UniversityKnowledgeBase, { onNavigate: handleNavigate, currentRole, students });
    }
    if (currentView === "calendar") {
      const calendarAppointments =
        currentRole === "Manager" && managerDataScope.active
          ? managerScopedAppointments
          : currentRole === "Country Coordinator" && countryCoordinatorScope.active
            ? countryCoordinatorScopedAppointments
            : appointments;
      return /* @__PURE__ */ jsx(CalendarScheduler, {
        appointments: calendarAppointments,
        bookingBlocks,
        studentsLookup: students,
        onBookAppointment: handleBookAppointment,
        onUpdateAppointment: handleUpdateAppointment,
        currentRole,
        currentUser,
        employees,
        meetingSettings,
        onAddBusyBooking: async (payload) => {
        const result = await createBooking(payload);
        if (!result.ok) return result;
        setBookingBlocks((prev) => [...prev, result.data]);
        addNotification("Busy time added", "Your blocked time was saved.", "success");
        return result;
      }, onDeleteBusyBooking: async (bookingId) => {
        const result = await deleteBooking(bookingId);
        if (!result.ok) return result;
        setBookingBlocks((prev) => prev.filter((item) => item.id !== bookingId));
        addNotification("Busy time removed", "Blocked time has been removed.", "info");
        return result;
      }
    });
    }
    const studentProfileProps = {
      onBack: () => handleNavigate("students"),
      onNavigate: handleNavigate,
      onUpdateStudent: handleUpdateStudent,
      onAddActivity: handleAddActivity,
      onOpenCreateTaskModal: handleOpenCreateTaskModal,
      invoices,
      onCreateInvoice: handleCreateInvoice,
      onUpdateInvoice: handleUpdateInvoice,
      tasks,
      employees,
      onAddTasks: handleAddTasks,
      onUpdateTasks: handleUpdateTasks,
      activities,
      onUploadStudentDocument: handleUploadStudentDocument,
      currentUser,
      authenticatedUser
    };
    if (currentRole === "Student") {
      const studentUser = currentUser;
      const studentVisibleTasks = tasks.filter((task) => !task.isPrivate);
      if (currentView === "dashboard") return /* @__PURE__ */ jsx(StudentDashboard, { student: studentUser, onNavigate: handleNavigate, tasks: studentVisibleTasks, onUpdateTasks: handleUpdateTasks, employees, onUploadDocument: handleUploadStudentDocument });
      if (currentView === "tasks") return /* @__PURE__ */ jsx(TaskManager, { userRole: "Student", tasks: studentVisibleTasks, student: studentUser, onUpdateStudent: handleUpdateStudent, onAddActivity: handleAddActivity, currentUser, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, employees });
      if (currentView === "finance") return /* @__PURE__ */ jsx(FinanceModule, { student: studentUser, invoices, userRole: "Student", onUpdateInvoice: handleUpdateInvoice });
      return /* @__PURE__ */ jsx(StudentDashboard, { student: studentUser, onNavigate: handleNavigate, tasks: studentVisibleTasks, onUpdateTasks: handleUpdateTasks, employees, onUploadDocument: handleUploadStudentDocument });
    }
    const openEscalationStudent = (studentId) => {
      const latest = students.find((s) => String(s.id) === String(studentId));
      if (latest) handleSelectStudent(latest);
    };
    if (currentRole === "Counselor" || currentRole === "Country Coordinator") {
      const coordStudents = currentRole === "Counselor" ? counselorScopedStudents : countryCoordinatorScopedStudents;
      const coordTasks = currentRole === "Country Coordinator" && countryCoordinatorScope.active ? countryCoordinatorScopedTasks : tasks;
      const coordProfileProps =
        currentRole === "Country Coordinator" && countryCoordinatorScope.active
          ? { ...studentProfileProps, tasks: coordTasks, invoices: countryCoordinatorScopedInvoices }
          : studentProfileProps;
      if (currentView === "stage-escalations") {
        const coordEsc = currentRole === "Counselor" ? counselorScopedEscalations : countryCoordinatorScopedEscalations;
        return /* @__PURE__ */ jsx(StageEscalations, {
          escalations: coordEsc,
          employees,
          variant: "counselor",
          onOpenStudent: openEscalationStudent
        });
      }
      if (currentView === "dashboard") return /* @__PURE__ */ jsx(CounselorDashboard, { onNavigate: handleNavigate, tasks: coordTasks, currentUser, students: coordStudents, allStudents: students, employees, onSelectStudent: handleSelectStudent, onSelectTask: handleSelectTask });
      if (currentView === "students") return /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: coordStudents, onUpdateStudent: handleUpdateStudent, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      if (currentView === "tasks") return /* @__PURE__ */ jsx(TaskManager, { userRole: currentRole, tasks: coordTasks, currentUser, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, monitoredStudents: coordStudents, employees });
      if (currentView === "student-detail") return selectedStudent && coordStudents.some((student) => student.id === selectedStudent.id) ? /* @__PURE__ */ jsx(StudentProfile, { ...coordProfileProps, student: selectedStudent, userRole: currentRole }) : /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: coordStudents, onUpdateStudent: handleUpdateStudent, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      return /* @__PURE__ */ jsx(CounselorDashboard, { onNavigate: handleNavigate, tasks: coordTasks, currentUser, students: coordStudents, allStudents: students, employees, onSelectStudent: handleSelectStudent, onSelectTask: handleSelectTask });
    }
    if (currentRole === "Manager" || currentRole === "Team Lead") {
      const mgrStudents = currentRole === "Manager" && managerDataScope.active ? managerScopedStudents : students;
      const mgrTasks = currentRole === "Manager" && managerDataScope.active ? managerScopedTasks : tasks;
      const mgrEmployees = currentRole === "Manager" && managerDataScope.active ? managerScopedEmployees : employees;
      const mgrActivities = currentRole === "Manager" && managerDataScope.active ? managerScopedActivities : activities;
      const mgrProfileProps =
        currentRole === "Manager" && managerDataScope.active
          ? { ...studentProfileProps, tasks: mgrTasks, invoices: managerScopedInvoices }
          : studentProfileProps;
      if (currentView === "dashboard") return /* @__PURE__ */ jsx(ManagerDashboard, { activities: mgrActivities, tasks: mgrTasks, students: mgrStudents, employees: mgrEmployees, currentUser, onNavigate: handleNavigate });
      if (currentView === "counselors") return /* @__PURE__ */ jsx(CounselorManagement, { onNavigate: handleNavigate, students: mgrStudents, employees: mgrEmployees, tasks: mgrTasks, onTransferStudents: handleTransferStudents, onAddActivity: handleAddActivity, onAddCounselor: handleAddCounselor, currentRole, authenticatedUserEmail: authenticatedUser?.email || "" });
      if (currentRole === "Manager" && currentView === "branch") return /* @__PURE__ */ jsx(BranchAnalytics, { scopeBranch: managerDataScope.active ? managerDataScope.branchLabel : null });
      if (currentView === "students") return /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: mgrStudents, onUpdateStudent: handleUpdateStudent, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      if (currentView === "tasks") {
        const escBlock = currentRole === "Manager" ? managerScopedEscalations : teamLeadScopedEscalations;
        return /* @__PURE__ */ jsxs(Fragment, {
          children: [
            /* @__PURE__ */ jsx(StageEscalations, {
              escalations: escBlock,
              employees: mgrEmployees,
              variant: "manager",
              onOpenStudent: openEscalationStudent
            }),
            /* @__PURE__ */ jsx(TaskManager, { userRole: "Manager", tasks: mgrTasks, currentUser, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, monitoredStudents: mgrStudents, employees: mgrEmployees })
          ]
        });
      }
      if (currentView === "student-detail") return selectedStudent && mgrStudents.some((s) => s.id === selectedStudent.id) ? /* @__PURE__ */ jsx(StudentProfile, { ...mgrProfileProps, student: selectedStudent, userRole: "Manager" }) : /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: mgrStudents, onUpdateStudent: handleUpdateStudent, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      if (currentView === "requested-students") return /* @__PURE__ */ jsx(RequestedStudents, { userRole: currentRole, scopeBranch: managerDataScope.active ? managerDataScope.branchLabel : null, onAddFromRequest: handleAddFromRequest });
      return /* @__PURE__ */ jsx(ManagerDashboard, { activities: mgrActivities, tasks: mgrTasks, students: mgrStudents, employees: mgrEmployees, currentUser, onNavigate: handleNavigate });
    }
    switch (currentView) {
      case "dashboard":
        return /* @__PURE__ */ jsx(AdminDashboard, { activities, tasks, students, invoices });
      case "counselors":
        return /* @__PURE__ */ jsx(CounselorManagement, { onNavigate: handleNavigate, students, employees, tasks, onTransferStudents: handleTransferStudents, onAddCounselor: handleAddCounselor, currentRole, authenticatedUserEmail: authenticatedUser?.email || "" });
      case "accounts":
        return /* @__PURE__ */ jsx(AccountsManagement, {
          onAdminAvatarUpdated: (row) => {
            setAdminAvatar(toAbsoluteAssetUrl(row.avatar) || "/CEO.png");
            addNotification("Profile updated", "Admin profile photo updated.", "success");
          },
          onAccountCreated: (row) =>
            addNotification(
              "Account created",
              `${row.role} account created for ${row.email}.`,
              "success"
            ),
          onResetPassword: (row) =>
            addNotification(
              "Password reset sent",
              `A reset link was sent to ${row.email} (${row.username}).`,
              "success"
            )
        });
      case "settings":
        return currentRole === "Admin" ? /* @__PURE__ */ jsx(AdminSettings, {
          meetingSettings,
          onSaveMeetingSettings: async (payload) => {
            const result = await updateMeetingSettings(payload);
            if (!result.ok) return result;
            setMeetingSettings(result.data);
            return result;
          }
        }) : /* @__PURE__ */ jsx("div", { className: "text-center mt-20 text-slate-400", children: "Settings are available for Admin only." });
      case "branch":
        return /* @__PURE__ */ jsx(BranchAnalytics, {});
      case "students":
        return /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students, onUpdateStudent: handleUpdateStudent, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      case "requested-students":
        return /* @__PURE__ */ jsx(RequestedStudents, { userRole: currentRole, scopeBranch: null, onAddFromRequest: handleAddFromRequest });
      case "student-detail":
        return selectedStudent ? /* @__PURE__ */ jsx(StudentProfile, { ...studentProfileProps, student: selectedStudent, userRole: "Admin" }) : /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students, onUpdateStudent: handleUpdateStudent, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      case "tasks":
        return /* @__PURE__ */ jsxs(Fragment, {
          children: [
            /* @__PURE__ */ jsx(StageEscalations, {
              escalations: pipelineEscalationsAll,
              employees,
              variant: "admin",
              onOpenStudent: openEscalationStudent
            }),
            /* @__PURE__ */ jsx(TaskManager, { userRole: "Admin", tasks, currentUser, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, monitoredStudents: students, employees })
          ]
        });
      default:
        return /* @__PURE__ */ jsx("div", { className: "text-center mt-20 text-slate-400", children: "Under Construction" });
    }
  };
  if (!isAuthenticated) {
    return /* @__PURE__ */ jsx(LoginScreen, {
      onLoggedIn: (user) => {
        setAuthenticatedUser(user || null);
        const nextRole = user?.role;
        if (nextRole === "Manager" || nextRole === "Team Lead" || nextRole === "Counselor" || nextRole === "Country Coordinator" || nextRole === "Student" || nextRole === "Admin") {
          setCurrentRole(nextRole);
        } else {
          setCurrentRole("Admin");
        }
        setCurrentView("dashboard");
        setIsAuthenticated(true);
        navigate("/dashboard");
      }
    });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      Layout,
      {
        activeView: currentView,
        onNavigate: handleNavigate,
        currentRole,
        unreadMessageCount,
        userAvatar: headerAvatar,
        userName: authenticatedUser?.username || currentUser?.name || "",
        userEmail: authenticatedUser?.email || currentUser?.email || "",
        userPhone: currentUser?.phone || authenticatedUser?.phone || "",
        userBranch: currentUser?.branch || authenticatedUser?.branch || "",
        notifications: notificationHistory,
        onClearNotifications: () => setNotificationHistory([]),
        onRemoveNotification: (id) => setNotificationHistory((prev) => prev.filter((n) => n.id !== id)),
        onUpdateProfileAvatar: handleUpdateProfileAvatar,
        onUpdateProfileContact: handleUpdateProfileContact,
        navMyTasksCount,
        pipelineEscalationBadge: pipelineEscalationNavBadge,
        counselorStageEscalationBadge: counselorStageNavBadge,
        onLogout: () => {
          clearLoginSession();
          setAuthenticatedUser(null);
          setIsAuthenticated(false);
        },
        children: renderContent()
      }
    ),
    isCreateTaskModalOpen && /* @__PURE__ */ jsx(
      CreateTaskModal,
      {
        isOpen: isCreateTaskModalOpen,
        onClose: handleCloseCreateTaskModal,
        onSubmit: handleAddTask,
        student: taskModalStudent,
        currentUser,
        userRole: currentRole,
        students: currentRole === "Country Coordinator" && countryCoordinatorScope.active ? countryCoordinatorScopedStudents : currentRole === "Counselor" ? counselorScopedStudents : students,
        employees
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none", children: notifications.map((n) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: "bg-white border border-gray-200 rounded-xl shadow-xl p-4 flex items-start gap-4 animate-in slide-in-from-right duration-300 pointer-events-auto max-w-sm",
        children: [
          /* @__PURE__ */ jsx("div", { className: `w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${n.type === "success" ? "bg-emerald-100 text-emerald-600" : n.type === "warning" ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"}`, children: /* @__PURE__ */ jsx(Bell, { size: 20 }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-900 truncate", children: n.title }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5 leading-relaxed", children: n.message })
          ] }),
          /* @__PURE__ */ jsx("button", { onClick: () => setNotifications((prev) => prev.filter((notif) => notif.id !== n.id)), className: "text-slate-400 hover:text-slate-600", children: /* @__PURE__ */ jsx(X, { size: 14 }) })
        ]
      },
      n.id
    )) })
  ] });
}
var App_default = App;
export {
  App_default as default
};
