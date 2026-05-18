import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoginScreen } from "./components/LoginScreen";
import { clearLoginSession, getLoginSessionUser, hasLoginSession, normalizePortalRole, saveLoginSession } from "./authSession";
import { createAccount, createStudent, getAccounts, getStudents, updateStudent, updateAccountAvatar, updateAccountProfileContact, updateStudentAvatar, uploadStudentCv, uploadStudentDocument, uploadStudentProfileOtherDocument, uploadStudentUniversityOfferLetters, sendChatMessage, getChats, getMeetingSettings, updateMeetingSettings, getBookings, createBooking, deleteBooking, getAppointments, createAppointment, updateAppointment, getActivities, createActivity, getInvoices, createInvoice, updateInvoice, getTasks, createTask, updateTask, deleteReqStudent, getWhatsappStatus, getReqStudents } from "./authApi";
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
import { StaffFinanceHub } from "./components/StaffFinanceHub";
import { CalendarScheduler } from "./components/CalendarScheduler";
import { CounselorManagement } from "./components/CounselorManagement";
import { AccountsManagement } from "./components/AccountsManagement";
import { AdminSettings } from "./components/AdminSettings";
import { RequestedStudents } from "./components/RequestedStudents";
import { AIResumeBuilder } from "./components/AIResumeBuilder";
import { CreateTaskModal } from "./components/CreateTaskModal";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { Bell, X } from "lucide-react";
import { filterTasksForCounselor } from "./counselorTaskScope";
import { toAbsoluteAssetUrl, DEFAULT_USER_AVATAR } from "./apiConfig";
import {
  buildBranchCounselorIdentitySet,
  computePipelineEscalations,
  computeRequirementViolations,
  filterEscalationsForCounselor,
  filterEscalationsForManager,
  filterRequirementViolationsForCounselor,
  filterRequirementViolationsForManager,
  normalizePipelineStatus,
  reconcileStudentSlaViolationsWithDocuments,
  studentMatchesManagerBranch,
  branchesMatch
} from "./pipeline";
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
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
  integration: "/integration",
  finance: "/finance",
  settings: "/settings",
  "student-detail": "/student-detail",
  "requested-students": "/requested-students",
  "stage-escalations": "/stage-escalations"
};

function App({ initialView = "dashboard" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authenticatedUser, setAuthenticatedUser] = useState(getLoginSessionUser());
  const [isAuthenticated, setIsAuthenticated] = useState(hasLoginSession);
  const [adminAvatar, setAdminAvatar] = useState(DEFAULT_USER_AVATAR);
  const [students, setStudents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
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
  const [currentRole, setCurrentRole] = useState(() => {
    const role = normalizePortalRole(authenticatedUser?.role);
    return role === "Manager" || role === "Team Lead" || role === "Counselor" || role === "Country Coordinator" || role === "Student" ? role : "Admin";
  });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [studentDetailFocusTaskId, setStudentDetailFocusTaskId] = useState(null);
  const [isCreateTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [taskModalStudent, setTaskModalStudent] = useState(null);
  const [counselorListResetSignal, setCounselorListResetSignal] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [studentMessagesInitialPeerId, setStudentMessagesInitialPeerId] = useState(null);
  const [studentCalendarFocusCounselorId, setStudentCalendarFocusCounselorId] = useState(null);
  const [whatsappConnectionStatus, setWhatsappConnectionStatus] = useState("disconnected");
  const [requestedStudentsCount, setRequestedStudentsCount] = useState(0);
  const [assignmentAlerts, setAssignmentAlerts] = useState([]);
  const whatsappStatusFailuresRef = useRef(0);
  const whatsappPollUserIdRef = useRef("");
  const WHATSAPP_DISCONNECT_NOTIFY_AFTER_MS = 5 * 60 * 1000;
  const whatsappDisconnectNotifyAnchorRef = useRef(0);
  const whatsappDisconnectNotifiedRef = useRef(false);
  const toastStackRef = useRef(null);
  const hasRequestedStudentsHydratedRef = useRef(false);
  const requestedStudentsCountRef = useRef(0);
  const previousStudentCounselorMapRef = useRef(new Map());
  const counselorInboundChatNotifyHydratedRef = useRef(false);
  const notifiedCounselorInboundChatIdsRef = useRef(/* @__PURE__ */ new Set());
  const lastCounselorChatNotifyUserIdRef = useRef("");
  const tasksFetchCycleReadyRef = useRef(false);
  const taskAssignNotifySeededRef = useRef(false);
  const previousTaskDirectAssignRef = useRef(/* @__PURE__ */ new Map());
  const previousInvoiceStatusRef = useRef(new Map());
  const invoiceNotifyHydratedRef = useRef(false);
  const appDataLoaded = true;
  const addNotification = useCallback((title, message, type = "info", link = null, durationMs = 5000) => {
    const id = generateId("notif");
    const notification = {
      id,
      title,
      message,
      type,
      timestamp: new Date().toISOString(),
      ...(link && typeof link === "object" ? { link } : {})
    };
    setNotifications((prev) => [...prev, notification]);
    setNotificationHistory((prev) => [notification, ...prev].slice(0, 100));
    const ttl = Number(durationMs);
    const ms = Number.isFinite(ttl) && ttl > 0 ? ttl : 5000;
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, ms);
  }, []);
  const tryShowDesktopAssignmentNotice = useCallback((title, body) => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, {
        body,
        icon: `${window.location.origin}/favicon.ico`
      });
    } catch {
      /* ignore */
    }
  }, []);
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
          avatar: authenticatedUser.role === "Admin" ? adminAvatar : authenticatedUser.avatar || DEFAULT_USER_AVATAR
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
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || DEFAULT_USER_AVATAR,
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
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar || byEmail.avatar) || DEFAULT_USER_AVATAR
        };
      }
      return {
        id: authenticatedUser?.id || "EMP002",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: "Counselor",
        branch: authenticatedUser?.branch || "Colombo HQ",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || DEFAULT_USER_AVATAR
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
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar || byEmail.avatar) || DEFAULT_USER_AVATAR
        };
      }
      return {
        id: authenticatedUser?.id || "COORD-1",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: "Country Coordinator",
        branch: authenticatedUser?.branch || "Colombo HQ",
        country: authenticatedUser?.country || "",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || DEFAULT_USER_AVATAR
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
          avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar || byEmail.avatar) || DEFAULT_USER_AVATAR
        };
      }
      return {
        id: authenticatedUser?.id || (currentRole === "Manager" ? "EMP004" : "EMP005"),
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email),
        role: currentRole,
        branch: authenticatedUser?.branch || "Colombo HQ",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(authenticatedUser?.avatar) || DEFAULT_USER_AVATAR
      };
    } else {
      return {
        id: authenticatedUser?.id || "ADMIN",
        name: authenticatedUser?.username || toDisplayName(authenticatedUser?.email || "Admin"),
        role: "Admin",
        branch: authenticatedUser?.branch || "",
        email: authenticatedUser?.email || "",
        avatar: toAbsoluteAssetUrl(adminAvatar) || DEFAULT_USER_AVATAR
      };
    }
  };
  const currentUser = getCurrentUserObject();
  const normalizeIdentity = (value) => String(value || "").trim().toLowerCase();
  /** Match pipeline scope: primary counselor, else inquiry counselor (legacy rows may only set one). */
  const effectiveAssignedCounselorKey = (student) => {
    const primary = normalizeIdentity(student?.counselor);
    const inquiry = normalizeIdentity(student?.inquiryCounselorId);
    const isUnassigned = (v) => !v || v === "unassigned" || v === "none" || v === "null";
    if (!isUnassigned(primary)) return primary;
    if (!isUnassigned(inquiry)) return inquiry;
    return "";
  };
  const counselorIdentitySet = useMemo(() => {
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
    return identitySet;
  }, [
    authenticatedUser?.id,
    authenticatedUser?.email,
    authenticatedUser?.username,
    currentUser?.id,
    currentUser?.email,
    currentUser?.name,
    employees
  ]);
  useEffect(() => {
    if (currentRole !== "Counselor") {
      setAssignmentAlerts([]);
      previousStudentCounselorMapRef.current = new Map();
      return;
    }
    const nextMap = new Map(
      (students || []).map((student) => [String(student.id || ""), effectiveAssignedCounselorKey(student)])
    );
    const previousMap = previousStudentCounselorMapRef.current;
    if (previousMap.size === 0) {
      if (!(students || []).length) return;
      previousStudentCounselorMapRef.current = nextMap;
      return;
    }
    const nextAlerts = [];
    (students || []).forEach((student) => {
      const studentId = String(student.id || "").trim();
      if (!studentId) return;
      const currentCounselor = effectiveAssignedCounselorKey(student);
      const previousCounselor = previousMap.get(studentId) || "";
      const isAssignedNowToMe = counselorIdentitySet.has(currentCounselor);
      const wasAssignedToMeBefore = counselorIdentitySet.has(previousCounselor);
      if (!isAssignedNowToMe || wasAssignedToMeBefore) return;
      const wasKnownStudent = previousMap.has(studentId);
      nextAlerts.push({
        id: `assign-alert-${studentId}-${Date.now()}`,
        studentId,
        studentName: student.name || studentId,
        type: wasKnownStudent ? "reassigned" : "new"
      });
    });
    if (nextAlerts.length > 0) {
      setAssignmentAlerts((prev) => {
        const merged = [...nextAlerts, ...prev];
        const seen = new Set();
        return merged.filter((item) => {
          const key = `${item.studentId || item.studentName}-${item.type}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 10);
      });
      nextAlerts.forEach((alert) => {
        const title =
          alert.type === "reassigned" ? "Student reassigned to you" : "New student assigned to you";
        const message = `${alert.studentName} — reach out and start onboarding.`;
        addNotification(title, message, "info", { studentId: alert.studentId }, 14000);
        tryShowDesktopAssignmentNotice(title, message);
      });
    }
    previousStudentCounselorMapRef.current = nextMap;
  }, [students, currentRole, counselorIdentitySet, addNotification, tryShowDesktopAssignmentNotice]);
  useEffect(() => {
    if (currentRole !== "Counselor") return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    const onFirstInteraction = () => {
      Notification.requestPermission().catch(() => {});
      window.removeEventListener("pointerdown", onFirstInteraction);
    };
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    return () => window.removeEventListener("pointerdown", onFirstInteraction);
  }, [currentRole]);
  const counselorScopedStudents = (() => {
    if (currentRole !== "Counselor") return students;
    if (counselorIdentitySet.size === 0) return [];
    return students.filter((student) => {
      const counselorId = normalizeIdentity(student.counselor);
      const inquiryCounselorId = normalizeIdentity(student.inquiryCounselorId);
      const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
      const historyMatch = history.some((id) => counselorIdentitySet.has(normalizeIdentity(id)));
      return (
        counselorIdentitySet.has(counselorId) ||
        counselorIdentitySet.has(inquiryCounselorId) ||
        historyMatch
      );
    });
  })();
  const managerDataScope = useMemo(() => {
    // Branch scoping applies to managers only. Admins always see all branches.
    if (currentRole !== "Manager") {
      return { active: false, branchKey: "", branchLabel: "" };
    }
    const raw = String(currentUser?.branch || authenticatedUser?.branch || "").trim();
    return { active: !!raw, branchKey: raw.toLowerCase(), branchLabel: raw };
  }, [currentRole, currentUser?.branch, authenticatedUser?.branch]);
  const branchCounselorIdentitySet = useMemo(() => {
    if (!managerDataScope.active || !managerDataScope.branchLabel) return new Set();
    return buildBranchCounselorIdentitySet(employees, managerDataScope.branchLabel);
  }, [employees, managerDataScope.active, managerDataScope.branchLabel]);
  const managerScopedStudents = useMemo(() => {
    if ((currentRole !== "Manager" && currentRole !== "Admin") || !managerDataScope.active) return students;
    return students.filter((s) =>
      studentMatchesManagerBranch(s, managerDataScope.branchLabel, branchCounselorIdentitySet)
    );
  }, [students, currentRole, managerDataScope.active, managerDataScope.branchLabel, branchCounselorIdentitySet]);
  const managerScopedStudentIds = useMemo(
    () =>
      new Set(
        managerScopedStudents
          .map((s) => String(s?.id ?? "").trim())
          .filter(Boolean)
      ),
    [managerScopedStudents]
  );
  const managerScopedTasks = useMemo(() => {
    if ((currentRole !== "Manager" && currentRole !== "Admin") || !managerDataScope.active) return tasks;
    return tasks.filter((t) => {
      const sid = t.student_id || t.studentId;
      if (!sid) return false;
      return managerScopedStudentIds.has(String(sid));
    });
  }, [tasks, currentRole, managerDataScope.active, managerScopedStudentIds]);
  const managerScopedEmployees = useMemo(() => {
    if ((currentRole !== "Manager" && currentRole !== "Admin") || !managerDataScope.active) return employees;
    return employees.filter((e) => branchesMatch(e.branch, managerDataScope.branchLabel));
  }, [employees, currentRole, managerDataScope.active, managerDataScope.branchLabel]);
  const managerScopedActivities = useMemo(() => {
    if ((currentRole !== "Manager" && currentRole !== "Admin") || !managerDataScope.active) return activities;
    return activities.filter((a) => {
      const sid = a.studentId || a.student_id;
      if (!sid) return true;
      return managerScopedStudentIds.has(String(sid));
    });
  }, [activities, currentRole, managerDataScope.active, managerScopedStudentIds]);
  const managerScopedAppointments = useMemo(() => {
    if ((currentRole !== "Manager" && currentRole !== "Admin") || !managerDataScope.active) return appointments;
    const branchCounselorIds = new Set(
      managerScopedEmployees.map((e) => String(e?.id ?? "").trim()).filter(Boolean)
    );
    return appointments.filter((apt) => {
      const sid = String(apt.studentId ?? "").trim();
      const cid = String(apt.counselorId ?? "").trim();
      return managerScopedStudentIds.has(sid) || branchCounselorIds.has(cid);
    });
  }, [
    appointments,
    currentRole,
    managerDataScope.active,
    managerScopedStudentIds,
    managerScopedEmployees
  ]);
  const managerScopedInvoices = useMemo(() => {
    if ((currentRole !== "Manager" && currentRole !== "Admin") || !managerDataScope.active) return invoices;
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
      return filterTasksForCounselor(tasks, currentUser, counselorScopedStudents, counselorIdentitySet).length;
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
    counselorIdentitySet,
    counselorScopedStudents,
    countryCoordinatorScope.active,
    countryCoordinatorScopedTasks,
    countryCoordinatorScopedStudents
  ]);
  useEffect(() => {
    const staffTaskNotifyRoles = /* @__PURE__ */ new Set(["Counselor", "Country Coordinator"]);
    if (!staffTaskNotifyRoles.has(currentRole)) {
      return;
    }
    if (!tasksFetchCycleReadyRef.current) {
      return;
    }
    const taskDirectlyAssignsIdentities = (task) => {
      const assignedTo = Array.isArray(task.assigned_to) ? task.assigned_to : [];
      const relatedCounselorIds = Array.isArray(task.counselor_ids) ? task.counselor_ids : [];
      return (
        assignedTo.some((assignee) => counselorIdentitySet.has(normalizeIdentity(assignee))) ||
        relatedCounselorIds.some((counselorId) => counselorIdentitySet.has(normalizeIdentity(counselorId)))
      );
    };
    const createdBySelf = (task) => {
      const c = normalizeIdentity(task.createdBy);
      return Boolean(c) && counselorIdentitySet.has(c);
    };
    const scopedTasks = (() => {
      if (currentRole === "Counselor") {
        const sidSet = new Set(
          (counselorScopedStudents || []).map((s) => String(s?.id || "").trim()).filter(Boolean)
        );
        return (tasks || []).filter((t) => {
          const sid = String(t.student_id || t.studentId || "").trim();
          if (!sid) return true;
          return sidSet.has(sid);
        });
      }
      if (currentRole === "Country Coordinator" && countryCoordinatorScope.active) {
        return (tasks || []).filter((t) => {
          const sid = String(t.student_id || t.studentId || "").trim();
          if (!sid) return false;
          return countryCoordinatorStudentIds.has(sid);
        });
      }
      return tasks || [];
    })();
    const nextMap = /* @__PURE__ */ new Map();
    for (const task of scopedTasks) {
      const id = String(task?.id || "").trim();
      if (!id) continue;
      nextMap.set(id, taskDirectlyAssignsIdentities(task));
    }
    if (!taskAssignNotifySeededRef.current) {
      previousTaskDirectAssignRef.current = nextMap;
      taskAssignNotifySeededRef.current = true;
      return;
    }
    const prev = previousTaskDirectAssignRef.current;
    for (const task of scopedTasks) {
      const id = String(task?.id || "").trim();
      if (!id) continue;
      const now = taskDirectlyAssignsIdentities(task);
      const was = prev.get(id) ?? false;
      if (now && !was && !createdBySelf(task)) {
        const sid = String(task.student_id || task.studentId || "").trim();
        const student = sid ? students.find((s) => String(s.id || "").trim() === sid) : null;
        const studentName = String(student?.name || "").trim() || sid || "A student";
        const title = prev.has(id) ? "Task assigned to you" : "New task assigned";
        const body = `${String(task.task || "Task").trim()} — ${studentName}.`;
        addNotification(title, body, "info", sid ? { studentId: sid } : null);
        tryShowDesktopAssignmentNotice(title, body);
      }
    }
    previousTaskDirectAssignRef.current = nextMap;
  }, [
    tasks,
    currentRole,
    students,
    counselorIdentitySet,
    counselorScopedStudents,
    countryCoordinatorScope.active,
    countryCoordinatorStudentIds,
    addNotification,
    tryShowDesktopAssignmentNotice
  ]);
  const pipelineEscalationsAll = useMemo(() => computePipelineEscalations(students), [students]);
  const managerScopedEscalations = useMemo(() => {
    if (currentRole !== "Manager" && currentRole !== "Admin") return [];
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
  const requirementViolationsAll = useMemo(
    () => computeRequirementViolations(students),
    [students]
  );
  const managerScopedRequirementViolations = useMemo(() => {
    if (currentRole !== "Manager" && currentRole !== "Admin") return [];
    if (!managerDataScope.active || !managerDataScope.branchLabel) return requirementViolationsAll;
    return filterRequirementViolationsForManager(requirementViolationsAll, managerDataScope.branchLabel);
  }, [
    requirementViolationsAll,
    currentRole,
    managerDataScope.active,
    managerDataScope.branchLabel
  ]);
  const teamLeadScopedRequirementViolations = useMemo(() => {
    if (currentRole !== "Team Lead") return [];
    const b = String(currentUser?.branch || authenticatedUser?.branch || "").trim();
    if (!b) return requirementViolationsAll;
    return filterRequirementViolationsForManager(requirementViolationsAll, b);
  }, [requirementViolationsAll, currentRole, currentUser?.branch, authenticatedUser?.branch]);
  const counselorScopedRequirementViolations = useMemo(
    () => filterRequirementViolationsForCounselor(requirementViolationsAll, currentUser, counselorScopedStudents),
    [requirementViolationsAll, currentUser, counselorScopedStudents]
  );
  const countryCoordinatorScopedRequirementViolations = useMemo(
    () => filterRequirementViolationsForCounselor(requirementViolationsAll, currentUser, countryCoordinatorScopedStudents),
    [requirementViolationsAll, currentUser, countryCoordinatorScopedStudents]
  );
  const pipelineEscalationNavBadge = useMemo(() => {
    if (currentRole === "Admin") {
      if (managerDataScope.active && managerDataScope.branchLabel) {
        const total = managerScopedEscalations.length + managerScopedRequirementViolations.length;
        return total > 0 ? String(total) : "";
      }
      const total = pipelineEscalationsAll.length + requirementViolationsAll.length;
      return total > 0 ? String(total) : "";
    }
    if (currentRole === "Manager") {
      const total = managerScopedEscalations.length + managerScopedRequirementViolations.length;
      return total > 0 ? String(total) : "";
    }
    if (currentRole === "Team Lead") {
      const total = teamLeadScopedEscalations.length + teamLeadScopedRequirementViolations.length;
      return total > 0 ? String(total) : "";
    }
    return "";
  }, [
    currentRole,
    pipelineEscalationsAll.length,
    managerScopedEscalations.length,
    teamLeadScopedEscalations.length,
    requirementViolationsAll.length,
    managerScopedRequirementViolations.length,
    teamLeadScopedRequirementViolations.length,
    managerDataScope.active,
    managerDataScope.branchLabel
  ]);
  const counselorStageNavBadge = useMemo(() => {
    if (currentRole === "Counselor") {
      const total = counselorScopedEscalations.length + counselorScopedRequirementViolations.length;
      return total > 0 ? String(total) : "";
    }
    if (currentRole === "Country Coordinator") {
      const total = countryCoordinatorScopedEscalations.length + countryCoordinatorScopedRequirementViolations.length;
      return total > 0 ? String(total) : "";
    }
    return "";
  }, [
    currentRole,
    counselorScopedEscalations.length,
    countryCoordinatorScopedEscalations.length,
    counselorScopedRequirementViolations.length,
    countryCoordinatorScopedRequirementViolations.length
  ]);
  const headerAvatar = currentRole === "Admin" ? toAbsoluteAssetUrl(adminAvatar) : toAbsoluteAssetUrl(currentUser?.avatar) || DEFAULT_USER_AVATAR;

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
        avatar: toAbsoluteAssetUrl(account.avatar) || DEFAULT_USER_AVATAR
      }));
      setEmployees(mapped);
    };
    loadEmployees();
  }, [currentRole, counselorIdentitySet]);
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
    if (currentRole !== "Counselor") return;
    previousStudentCounselorMapRef.current = new Map(
      (students || []).map((student) => [
        String(student.id || "").trim(),
        effectiveAssignedCounselorKey(student)
      ])
    );
  }, [currentRole, authenticatedUser?.id, authenticatedUser?.email]);
  useEffect(() => {
    const loadStudents = async () => {
      const result = await getStudents();
      if (!result.ok) return;
      setStudents(() => {
        const nextStudents = Array.isArray(result.data) ? result.data : [];
        return nextStudents;
      });
    };
    loadStudents();
    const intervalId = setInterval(loadStudents, 5e3);
    return () => clearInterval(intervalId);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== VIEW_TO_PATH["student-detail"]) return;
    const sid = (searchParams.get("student") || "").trim();
    const taskFocus = (searchParams.get("task") || "").trim();
    setStudentDetailFocusTaskId(taskFocus || null);
    if (!sid) return;
    const match = students.find((s) => String(s.id ?? "").trim() === sid);
    if (match) setSelectedStudent(match);
    else if (students.length > 0) setSelectedStudent(null);
  }, [searchParams, students]);
  useEffect(() => {
    let cancelled = false;
    tasksFetchCycleReadyRef.current = false;
    taskAssignNotifySeededRef.current = false;
    previousTaskDirectAssignRef.current = /* @__PURE__ */ new Map();
    const loadTasks = async () => {
      const result = await getTasks();
      if (cancelled) return;
      if (!result.ok) return;
      tasksFetchCycleReadyRef.current = true;
      setTasks(result.data);
    };
    loadTasks();
    const pollTasksRoles = new Set(["Counselor", "Country Coordinator"]);
    if (!pollTasksRoles.has(currentRole)) return undefined;
    const intervalId = setInterval(loadTasks, 5e3);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole]);
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
    let cancelled = false;
    const staffRoles = new Set(["Counselor", "Admin", "Manager", "Country Coordinator"]);
    const pollInvoices = async () => {
      const result = await getInvoices();
      if (!result.ok || cancelled) return;
      const next = result.data || [];
      if (staffRoles.has(currentRole)) {
        for (const inv of next) {
          const id = String(inv.id || "").trim();
          if (!id) continue;
          const newStatus = String(inv.status || "");
          const prevStatus = previousInvoiceStatusRef.current.get(id);
          if (!invoiceNotifyHydratedRef.current) {
            previousInvoiceStatusRef.current.set(id, newStatus);
            continue;
          }
          if (prevStatus === newStatus) continue;
          const studentId = String(inv.studentId || "").trim();
          const student = students.find((s) => String(s.id || "").trim() === studentId);
          const studentName = String(student?.name || "").trim() || studentId || "A student";
          const counselorId = String(student?.inquiryCounselorId || student?.counselor || "").trim();
          const concernsCounselor =
            currentRole === "Counselor" && counselorId && counselorIdentitySet.has(counselorId);
          const concernsStaff = currentRole === "Admin" || currentRole === "Manager";
          const shouldNotify = concernsCounselor || concernsStaff;
          if (shouldNotify && newStatus === "Verifying" && prevStatus !== "Verifying") {
            addNotification(
              "Invoice evidence uploaded",
              `${studentName} uploaded payment evidence for invoice ${id}.`,
              "info",
              studentId ? { studentId } : null
            );
            tryShowDesktopAssignmentNotice(
              "Invoice evidence uploaded",
              `${studentName} uploaded payment evidence for invoice ${id}.`
            );
          }
          if (shouldNotify && newStatus === "Paid" && prevStatus === "Verifying") {
            addNotification(
              "Invoice payment approved",
              `Payment evidence for ${studentName}'s invoice ${id} was approved.`,
              "success",
              studentId ? { studentId } : null
            );
          }
          previousInvoiceStatusRef.current.set(id, newStatus);
        }
        invoiceNotifyHydratedRef.current = true;
      }
      setInvoices(next);
    };
    pollInvoices();
    const intervalId = setInterval(pollInvoices, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole, students, counselorIdentitySet, addNotification, tryShowDesktopAssignmentNotice]);
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
      counselorInboundChatNotifyHydratedRef.current = false;
      notifiedCounselorInboundChatIdsRef.current = /* @__PURE__ */ new Set();
      lastCounselorChatNotifyUserIdRef.current = "";
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
      if (currentRole !== "Counselor" && currentRole !== "Country Coordinator") {
        return;
      }
      if (userId !== lastCounselorChatNotifyUserIdRef.current) {
        lastCounselorChatNotifyUserIdRef.current = userId;
        counselorInboundChatNotifyHydratedRef.current = false;
        notifiedCounselorInboundChatIdsRef.current = /* @__PURE__ */ new Set();
      }
      const inboundUnread = (result.data || []).filter((msg) => {
        if (String(msg.receiverId || "").trim() !== userId) return false;
        if (String(msg.senderId || "").trim() === userId) return false;
        if (msg.read === true) return false;
        return true;
      });
      if (!counselorInboundChatNotifyHydratedRef.current) {
        for (const m of inboundUnread) {
          const mid = String(m.id || "").trim();
          if (mid) notifiedCounselorInboundChatIdsRef.current.add(mid);
        }
        counselorInboundChatNotifyHydratedRef.current = true;
        return;
      }
      for (const m of inboundUnread) {
        const mid = String(m.id || "").trim();
        if (!mid || notifiedCounselorInboundChatIdsRef.current.has(mid)) continue;
        notifiedCounselorInboundChatIdsRef.current.add(mid);
        const sid = String(m.senderId || "").trim();
        const student = students.find((s) => String(s.id || "").trim() === sid);
        const label = String(student?.name || "").trim() || "A student";
        const preview = String(m.content || "").trim();
        const body =
          preview.length > 120
            ? `${preview.slice(0, 117)}...`
            : preview || (m.attachment ? "Sent an attachment" : "New message");
        const title = `${label} messaged you`;
        addNotification(title, body, "info", { view: "messages" });
        tryShowDesktopAssignmentNotice(title, body);
      }
    };
    loadUnreadCount();
    const intervalId = setInterval(loadUnreadCount, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole, currentUser?.id, students, addNotification, tryShowDesktopAssignmentNotice]);
  useEffect(() => {
    let cancelled = false;
    const canTrackRequestedStudents = currentRole === "Admin" || currentRole === "Manager";
    if (!canTrackRequestedStudents) {
      hasRequestedStudentsHydratedRef.current = false;
      requestedStudentsCountRef.current = 0;
      setRequestedStudentsCount(0);
      return;
    }
    const loadRequestedStudents = async () => {
      const params =
        (currentRole === "Manager" || currentRole === "Admin") && managerDataScope.active && managerDataScope.branchLabel
          ? { branch: managerDataScope.branchLabel }
          : {};
      const result = await getReqStudents(params);
      if (!result.ok || cancelled) return;
      const nextCount = Array.isArray(result.data) ? result.data.length : 0;
      const previousCount = requestedStudentsCountRef.current;
      setRequestedStudentsCount(nextCount);
      if (hasRequestedStudentsHydratedRef.current && nextCount > previousCount) {
        const delta = nextCount - previousCount;
        addNotification(
          "Requested Students",
          `${delta} new requested student${delta > 1 ? "s are" : " is"} waiting in the table.`,
          "warning",
          { view: "requested-students" }
        );
      }
      requestedStudentsCountRef.current = nextCount;
      hasRequestedStudentsHydratedRef.current = true;
    };
    loadRequestedStudents();
    const intervalId = setInterval(loadRequestedStudents, 5e3);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole, managerDataScope.active, managerDataScope.branchLabel]);
  useEffect(() => {
    let cancelled = false;
    const isCounselor = currentRole === "Counselor";
    const userId = String(currentUser?.id || "").trim();
    if (!isCounselor || !userId) {
      whatsappPollUserIdRef.current = "";
      setWhatsappConnectionStatus("disconnected");
      return;
    }
    if (whatsappPollUserIdRef.current !== userId) {
      whatsappPollUserIdRef.current = userId;
      whatsappStatusFailuresRef.current = 0;
      whatsappDisconnectNotifyAnchorRef.current = Date.now();
      whatsappDisconnectNotifiedRef.current = false;
      setWhatsappConnectionStatus("disconnected");
    }
    const loadStatus = async () => {
      const result = await getWhatsappStatus(userId);
      if (cancelled) return;
      if (!result.ok) {
        whatsappStatusFailuresRef.current += 1;
        if (whatsappStatusFailuresRef.current >= 3) {
          setWhatsappConnectionStatus("disconnected");
        }
        return;
      }
      whatsappStatusFailuresRef.current = 0;
      setWhatsappConnectionStatus(String(result.data?.status || "disconnected"));
    };
    loadStatus();
    const intervalId = setInterval(loadStatus, 4000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentRole, currentUser?.id]);
  useEffect(() => {
    if (currentRole !== "Counselor") return;
    const userId = String(currentUser?.id || "").trim();
    if (!userId) return;
    const tick = () => {
      if (whatsappDisconnectNotifiedRef.current) return;
      const elapsed = Date.now() - whatsappDisconnectNotifyAnchorRef.current;
      if (elapsed < WHATSAPP_DISCONNECT_NOTIFY_AFTER_MS) return;
      const status = whatsappConnectionStatus;
      const isLive = status === "connected" || status === "authenticated";
      const isPending = status === "connecting" || status === "awaiting_qr_scan";
      if (!isLive && !isPending) {
        whatsappDisconnectNotifiedRef.current = true;
        addNotification("WhatsApp disconnected", "Your WhatsApp session ended or was disconnected.", "info");
      }
    };
    tick();
    const intervalId = setInterval(tick, 4000);
    return () => clearInterval(intervalId);
  }, [currentRole, currentUser?.id, whatsappConnectionStatus, addNotification]);
  const handleNavigate = (view, options = {}) => {
    if (view === "counselors" && currentView === "counselors") {
      setCounselorListResetSignal((prev) => prev + 1);
    }
    const counselorNav = String(options?.counselorId ?? "").trim();
    if (view === "messages") {
      setStudentMessagesInitialPeerId(counselorNav || null);
    } else {
      setStudentMessagesInitialPeerId(null);
    }
    if (view === "calendar") {
      setStudentCalendarFocusCounselorId(counselorNav || null);
    } else {
      setStudentCalendarFocusCounselorId(null);
    }
    setCurrentView(view);
    const nextPath = VIEW_TO_PATH[view];
    if (nextPath && window.location.pathname !== nextPath) {
      navigate(nextPath);
    }
    if (view !== "student-detail") {
      setSelectedStudent(null);
      setStudentDetailFocusTaskId(null);
    }
    if (view !== "tasks") {
      setSelectedTaskId(null);
    }
  };
  const handleSelectStudent = (student, options) => {
    if (!student) return;
    const sid = String(student.id ?? "").trim();
    if (!sid) return;
    const latestStudent = students.find((s) => String(s.id ?? "").trim() === sid) || student;
    setSelectedStudent(latestStudent);
    setCurrentView("student-detail");
    const focus = options?.focusTaskId != null ? String(options.focusTaskId).trim() : "";
    setStudentDetailFocusTaskId(focus || null);
    const path = VIEW_TO_PATH["student-detail"];
    if (!path) return;
    const qs = new URLSearchParams();
    qs.set("student", sid);
    if (focus) qs.set("task", focus);
    const profileTab = String(options?.profileTab || "").trim().toLowerCase();
    const allowedProfileTabs = new Set(["pipeline", "resume", "show-money", "visa-pilot", "ledger"]);
    if (profileTab && allowedProfileTabs.has(profileTab)) {
      qs.set("tab", profileTab);
    }
    navigate({ pathname: path, search: `?${qs.toString()}` });
  };
  const handleSelectTask = (taskId) => {
    const id = String(taskId || "").trim();
    setStudentDetailFocusTaskId(null);
    setSelectedTaskId(id || null);
    setCurrentView("tasks");
    const path = VIEW_TO_PATH.tasks;
    if (path && typeof window !== "undefined" && window.location.pathname !== path) {
      navigate(path);
    }
  };
  const handleNotificationNavigate = useCallback(
    (notification) => {
      const raw = notification?.link;
      if (!raw || typeof raw !== "object") return;

      const explicitTaskId = String(raw.taskId || "").trim();
      const studentId = String(raw.studentId || "").trim();
      const view = String(raw.view || "").trim();

      if (view === "messages" && VIEW_TO_PATH.messages) {
        handleNavigate("messages");
        return;
      }

      const openTask = (tid) => {
        const id = String(tid || "").trim();
        if (!id) return;
        setStudentDetailFocusTaskId(null);
        setSelectedTaskId(id);
        setCurrentView("tasks");
        const path = VIEW_TO_PATH.tasks;
        if (path && typeof window !== "undefined" && window.location.pathname !== path) {
          navigate(path);
        }
      };

      const openStudent = (sid) => {
        const student = students.find((s) => String(s.id || "").trim() === String(sid).trim());
        if (!student) return;
        handleSelectStudent(student);
      };

      if (explicitTaskId) {
        openTask(explicitTaskId);
        return;
      }

      if (studentId) {
        const sid = studentId;
        const forStudent = tasks.filter((t) => String(t.student_id || t.studentId || "").trim() === sid);
        const intake = forStudent.find((t) => /intake|onboarding|new student/i.test(String(t.task || "")));
        const pending = forStudent.filter((t) => String(t.status || "").trim() !== "Completed");
        const chosen = intake || pending[0] || forStudent[0];
        if (chosen?.id) {
          openTask(chosen.id);
          return;
        }
        openStudent(sid);
        return;
      }

      if (view && VIEW_TO_PATH[view]) {
        handleNavigate(view);
      }
    },
    [tasks, students, navigate, handleNavigate, handleSelectStudent]
  );
  const handleDismissAssignmentAlert = (alertId) => {
    const id = String(alertId || "").trim();
    if (!id) return;
    setAssignmentAlerts((prev) => prev.filter((item) => String(item.id || "").trim() !== id));
  };
  const handleStudentMovedToRequests = (studentId) => {
    const targetId = String(studentId || "").trim();
    if (!targetId) return;
    setStudents((prev) => prev.filter((s) => String(s.id || "").trim() !== targetId));
    setTasks((prev) => prev.filter((t) => String(t.student_id || t.studentId || "").trim() !== targetId));
    if (String(selectedStudent?.id || "").trim() === targetId) {
      setSelectedStudent(null);
    }
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
    const slaNext = reconcileStudentSlaViolationsWithDocuments(payload);
    if (slaNext !== void 0) {
      payload = { ...payload, slaViolations: slaNext };
    }
    if (previous && String(previous.status || "") !== String(updatedStudent.status || "")) {
      payload = { ...payload, stageEnteredAt: new Date().toISOString() };
    }
    const newTasks = generateTasks(payload);
    if (newTasks.length > 0) {
      await handleAddTasks(newTasks, { suppressTaskSyncNotification: true });
    }
    setStudents((prev) => prev.map((s) => s.id === payload.id ? payload : s));
    if (selectedStudent?.id === payload.id) {
      setSelectedStudent(payload);
    }
    const persisted = await updateStudent(payload.id, payload);
    if (!persisted.ok) {
      addNotification("Save failed", persisted.error || "Failed to save student changes.", "error");
      return { ok: false, error: persisted.error };
    }
    const savedStudent = persisted.data;
    setStudents((prev) => prev.map((s) => s.id === savedStudent.id ? savedStudent : s));
    if (selectedStudent?.id === savedStudent.id) {
      setSelectedStudent(savedStudent);
    }
    const prevStage = normalizePipelineStatus(previous?.status);
    const nextStage = normalizePipelineStatus(savedStudent.status);
    if (previous && prevStage !== "Application" && nextStage === "Application") {
      const sid = String(savedStudent.id || "").trim();
      const pendingIntake = tasksRef.current.filter((t) => {
        const tid = String(t.student_id || t.studentId || "").trim();
        if (!sid || tid !== sid) return false;
        if (!String(t.task || "").trim().startsWith("New student intake")) return false;
        return String(t.status || "").trim().toLowerCase() !== "completed";
      });
      if (pendingIntake.length > 0) {
        handleUpdateTasks(pendingIntake.map((t) => ({ ...t, status: "Completed" })));
      }
    }
    return {
      ok: true,
      data: savedStudent,
      documentWhatsappNotifications: persisted.documentWhatsappNotifications || [],
    };
  };
  const handleAssignStudentCounselor = async (student, counselorId, counselorName = "") => {
    const targetId = String(student?.id || "").trim();
    const nextCounselorId = String(counselorId || "").trim();
    if (!targetId || !nextCounselorId) return;
    setStudents((prev) => prev.map((s) => String(s.id || "").trim() === targetId ? {
      ...s,
      counselor: nextCounselorId,
      counselorName: counselorName || s.counselorName || ""
    } : s));
    const persisted = await updateStudent(targetId, {
      counselor: nextCounselorId,
      counselorName: counselorName || ""
    });
    if (!persisted.ok) {
      addNotification("Assignment failed", persisted.error || "Failed to assign counselor.", "error");
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
      phone: String(payload?.phone || "").trim(),
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
      avatar: DEFAULT_USER_AVATAR
    };
    setEmployees((prev) => [...prev, newEmployee]);
    addNotification("Counselor added", `${newEmployee.name} profile created and saved to accounts.`, "success");
    return { ok: true, data: accountResult.data || newEmployee };
  };
  const handleAddStudent = async (payload) => {
    let scopedPayload = payload;
    if ((currentRole === "Manager" || currentRole === "Admin") && managerDataScope.active && managerDataScope.branchLabel) {
      scopedPayload = { ...payload, branch: managerDataScope.branchLabel };
    }
    if (currentRole === "Country Coordinator" && countryCoordinatorScope.active && countryCoordinatorScope.countryLabel) {
      scopedPayload = { ...scopedPayload, country: countryCoordinatorScope.countryLabel };
    }
    const result = await createStudent(scopedPayload);
    if (!result.ok) {
      return { ok: false, error: result.error || "Failed to create student." };
    }
    const created = result.data;
    setStudents((prev) => [created, ...prev]);
    addNotification("Student onboarded", `${created.name} added successfully.`, "success");

    const counselorKey = effectiveAssignedCounselorKey(created);
    const hasCounselor = Boolean(counselorKey);
    if (hasCounselor) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      const dueDate = due.toISOString().split("T")[0];
      const taskPayload = {
        task: `New student intake — ${created.name}`,
        student_id: created.id,
        assigned_to: [counselorKey],
        counselor_ids: [counselorKey],
        priority: "High",
        status: "Pending",
        dueDate,
        isPrivate: true,
        tier: "Global",
        phase: 1,
        createdBy: String(currentUser?.id || authenticatedUser?.id || currentRole || "")
      };
      const taskResult = await createTask(taskPayload);
      if (taskResult.ok) {
        setTasks((prev) => [taskResult.data, ...prev]);
        handleAddActivity({
          user: currentRole,
          role: currentRole,
          action: "created task",
          target: taskResult.data.task,
          type: "task"
        });
      } else {
        addNotification(
          "Onboarding task not created",
          taskResult.error || "Student was saved but the counselor task could not be created.",
          "warning"
        );
      }
    }

    return { ok: true, data: created };
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
      (currentRole === "Manager" || currentRole === "Admin") && managerDataScope.active && managerDataScope.branchLabel
        ? managerDataScope.branchLabel
        : counselorBranch || String(requestRow.nearestOffice || "").trim() || "Colombo HQ";
    const random = Math.random().toString(36).slice(-5);
    const password = `Stu@${new Date().getFullYear()}${random}`;
    const reqRef = String(requestRow.id || "").trim();
    const notes = reqRef ? `Interest form (${reqRef}).` : "From interest form.";
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
      notes,
      city: String(requestRow.city || "").trim(),
      livingStatus: String(requestRow.livingStatus || "").trim(),
      visaRejectionAnyCountry: String(requestRow.visaRejectionAnyCountry || "No").trim(),
      currentEducationLevel: String(requestRow.currentEducationLevel || "").trim(),
      intendedProgram: String(requestRow.intendedProgram || "").trim(),
      message: String(requestRow.message || "").trim(),
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
      const base = fallbackAssignees.map((id) => String(id || "").trim()).filter(Boolean);
      if (base.length === 0 && resolvedCounselor) base.push(resolvedCounselor);
      if (!newTask.isPrivate && relatedStudent?.id) base.push(String(relatedStudent.id));
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
    const wa = saved.taskAssignmentWhatsapp;
    if (wa && wa.status === "sent") {
      addNotification("WhatsApp sent", "The student was notified about the new task.", "success");
    } else if (wa && wa.attempted && wa.status === "failed") {
      addNotification("WhatsApp failed", wa.reason || "Could not send task notification to the student.", "warning");
    } else if (wa && wa.status === "skipped" && String(wa.reason || "").trim()) {
      addNotification("WhatsApp skipped", wa.reason, "warning");
    }
    return { ok: true, data: saved.data };
  };
  const handleAddTasks = async (newTasks, options = {}) => {
    const suppressTaskSyncNotification = options.suppressTaskSyncNotification === true;
    if (!Array.isArray(newTasks) || newTasks.length === 0) {
      return { ok: true, data: [] };
    }
    const results = await Promise.all(
      newTasks.map(async (task) => {
        const relatedStudent = students.find((s) => String(s.id || "") === String(task.student_id || ""));
        const resolvedCounselor = String(relatedStudent?.counselor || "").trim();
        const fallbackAssignees = Array.isArray(task.assigned_to) ? task.assigned_to : [];
        const autoAssignedTo = (() => {
          const base = fallbackAssignees.map((id) => String(id || "").trim()).filter(Boolean);
          if (base.length === 0 && resolvedCounselor) base.push(resolvedCounselor);
          if (!task.isPrivate && relatedStudent?.id) base.push(String(relatedStudent.id));
          return Array.from(new Set(base));
        })();
        const payload = {
          ...task,
          assigned_to: autoAssignedTo,
          createdBy: String(currentUser?.id || authenticatedUser?.id || currentRole || "")
        };
        const saved = await createTask(payload);
        return { payload, saved };
      })
    );
    const savedTasks = results.filter((item) => item.saved?.ok && item.saved?.data).map((item) => item.saved.data);
    const failedTasks = results.filter((item) => !item.saved?.ok);
    if (savedTasks.length > 0) {
      setTasks((prev) => [...savedTasks, ...prev]);
      handleAddActivity({
        user: "System",
        role: "Admin",
        action: `dispatched ${savedTasks.length} automated tasks`,
        target: "Intelligent Engine",
        type: "system"
      });
    }
    if (failedTasks.length > 0 && !suppressTaskSyncNotification) {
      addNotification(
        "Task sync issue",
        `${failedTasks.length} task(s) could not be saved to backend.`,
        "warning"
      );
    }
    return {
      ok: failedTasks.length === 0,
      data: savedTasks,
      error: failedTasks.length > 0 ? `${failedTasks.length} task(s) failed to save.` : ""
    };
  };
  const handleUpdateTasks = (updatedTasks) => {
    setTasks((prev) => {
      const newTasks = [...prev];
      updatedTasks.forEach((updated) => {
        const uid = String(updated?.id ?? "").trim();
        const index = newTasks.findIndex((t) => String(t?.id ?? "").trim() === uid);
        if (index !== -1) {
          const merged = { ...newTasks[index], ...updated, id: newTasks[index].id };
          if (newTasks[index].status !== merged.status) {
            handleAddActivity({
              user: currentRole,
              role: currentRole,
              action: `moved task to ${merged.status}`,
              target: merged.task,
              type: "task"
            });
          }
          newTasks[index] = merged;
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
  const handleReassignDeskTask = async (sourceTask) => {
    if (!sourceTask) return;
    const sid = String(sourceTask.student_id || sourceTask.studentId || "").trim();
    if (!sid) {
      addNotification("Reassign", "This task is not linked to a student, so a reassignment task could not be created.", "error");
      return;
    }
    const related = students.find((s) => String(s.id || "").trim() === sid);
    const studentName = String(related?.name || sid).trim() || sid;
    let counselorId = String(related?.counselor || "").trim();
    const sidLower = sid.toLowerCase();
    if (!counselorId && Array.isArray(sourceTask.assigned_to)) {
      for (const a of sourceTask.assigned_to) {
        const aid = String(a || "").trim();
        if (aid && aid.toLowerCase() !== sidLower) {
          counselorId = aid;
          break;
        }
      }
    }
    if (!counselorId) {
      addNotification(
        "Reassign",
        "No counselor is assigned for this student. Assign a counselor on the student profile first.",
        "error"
      );
      return;
    }
    const counselorEmp = employees.find(
      (e) => String(e.id || "").trim().toLowerCase() === counselorId.toLowerCase()
    );
    const counselorDisplay =
      String(counselorEmp?.name || counselorEmp?.username || counselorEmp?.email || "").trim() || "Counselor";
    const sourceTitle = String(sourceTask.task || "Task").trim() || "Task";
    const truncated = sourceTitle.length > 140 ? `${sourceTitle.slice(0, 140)}…` : sourceTitle;
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    const newTaskPayload = {
      task: `Reassign (manager): Review handoff for "${truncated}" — ${studentName}`,
      student_id: sid,
      assigned_to: [counselorId],
      counselor_ids: [counselorId],
      priority: "High",
      status: "Pending",
      dueDate,
      isPrivate: true,
      tier: "Global",
      phase: 1,
      isBlocking: false
    };
    const result = await handleAddTask(newTaskPayload);
    if (!result || result.ok === false) return;
    const created = result.data;
    const tid = String(created?.id || "").trim();
    const chatText = `Manager reassignment: a new HIGH priority task was added to your list for ${studentName}: "${String(created?.task || newTaskPayload.task).slice(0, 220)}${String(created?.task || newTaskPayload.task).length > 220 ? "…" : ""}". Please open Task Manager.`;
    const msgRes = await handleSendMessage(chatText, counselorId);
    if (msgRes?.ok) {
      addNotification(
        "Reassign sent",
        `High priority task created for ${counselorDisplay}, and they were notified in Messages.`,
        "success",
        tid ? { taskId: tid } : null
      );
    } else {
      addNotification(
        "Task created",
        `High priority task created for ${counselorDisplay}, but the portal message could not be sent (${msgRes?.error || "unknown"}).`,
        "warning",
        tid ? { taskId: tid } : null
      );
    }
    tryShowDesktopAssignmentNotice("Reassign sent", `New high priority task for ${counselorDisplay}.`);
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
    previousInvoiceStatusRef.current.set(String(saved.data.id || ""), String(saved.data.status || ""));
    let action = "updated invoice";
    if (saved.data.status === "Paid") action = "confirmed payment";
    if (saved.data.status === "Verifying") action = "uploaded payment proof";
    if (saved.data.status === "Pending" && saved.invoiceWhatsappNotification?.decision === "rejected") {
      action = "rejected payment proof";
    }
    handleAddActivity({ user: currentRole, role: currentRole, action, target: `${saved.data.id}`, type: "finance", studentId: saved.data.studentId });
    if (saved.data.status === "Verifying" && currentRole === "Student") {
      addNotification(
        "Evidence uploaded",
        `Payment evidence for invoice ${saved.data.id} was submitted for review.`,
        "success"
      );
    }
    return { ok: true, data: saved.data, invoiceWhatsappNotification: saved.invoiceWhatsappNotification || null };
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
  const handleSaveCV = (cvData, mergeBase) => {
    const base = mergeBase || (currentRole === "Student" ? currentUser : selectedStudent);
    if (!base?.id) {
      return Promise.resolve({ ok: false });
    }
    return handleUpdateStudent({
      ...base,
      generatedCV: cvData
    });
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
  const handleUploadStudentDocument = async ({ studentId, dataUrl, fileName, docType, phase, tier, taskDocumentLink }) => {
    if (!studentId) return { ok: false, error: "Student account not found." };
    if (!dataUrl) return { ok: false, error: "No document file selected." };
    if (!docType) return { ok: false, error: "Document type is required." };
    const result = await uploadStudentDocument(studentId, { dataUrl, fileName, docType, phase, tier, taskDocumentLink });
    if (!result.ok) return result;
    const slaNext = reconcileStudentSlaViolationsWithDocuments(result.data);
    const updatedStudent =
      slaNext !== void 0 ? { ...result.data, slaViolations: slaNext } : result.data;
    setStudents((prev) => prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s));
    if (selectedStudent?.id === updatedStudent.id) {
      setSelectedStudent(updatedStudent);
    }
    return { ok: true, data: updatedStudent, document: result.document || null };
  };
  const handleUploadStudentProfileOtherDocument = async ({ studentId, dataUrl, fileName, label, slot, append }) => {
    if (!studentId) return { ok: false, error: "Student account not found." };
    if (!dataUrl) return { ok: false, error: "No document file selected." };
    if (!append && (!slot || slot < 1)) return { ok: false, error: "Choose a document slot." };
    const result = await uploadStudentProfileOtherDocument(studentId, { dataUrl, fileName, label, slot, append });
    if (!result.ok) return result;
    const updatedStudent = result.data;
    setStudents((prev) => prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s));
    if (selectedStudent?.id === updatedStudent.id) {
      setSelectedStudent(updatedStudent);
    }
    return { ok: true, data: updatedStudent, profileOtherDocument: result.profileOtherDocument || null };
  };
  const handleUploadStudentUniversityOfferLetters = async ({ studentId, offerStatus, files }) => {
    if (!studentId) return { ok: false, error: "Student account not found." };
    if (!offerStatus) return { ok: false, error: "Select an offer status." };
    if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "Choose at least one offer letter." };
    const result = await uploadStudentUniversityOfferLetters(studentId, { offerStatus, files });
    if (!result.ok) return result;
    const updatedStudent = result.data;
    setStudents((prev) => prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s));
    if (selectedStudent?.id === updatedStudent.id) {
      setSelectedStudent(updatedStudent);
    }
    return {
      ok: true,
      data: updatedStudent,
      universityOfferLetters: result.universityOfferLetters || [],
      offerLetterWhatsappNotifications: result.offerLetterWhatsappNotifications || []
    };
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
            : (currentRole === "Manager" || currentRole === "Admin") && managerDataScope.active
              ? managerScopedStudents
              : students;
      return /* @__PURE__ */ jsx(ChatInterface, { currentRole, currentUser, messages, onSendMessage: handleSendMessage, students: chatStudents, employees, initialChatPeerId: studentMessagesInitialPeerId });
    }
    if (currentView === "resume") {
      return /* @__PURE__ */ jsx(AIResumeBuilder, {
        onNavigate: handleNavigate,
        onSaveCV: handleSaveCV,
        currentStudent: currentRole === "Student" ? currentUser : selectedStudent || null,
        onUploadStudentCv: handleUploadStudentCv,
        onUploadStudentDocument: handleUploadStudentDocument
      });
    }
    if (currentView === "university") {
      const uniStudents =
        currentRole === "Admin" && managerDataScope.active ? managerScopedStudents : students;
      return /* @__PURE__ */ jsx(UniversityKnowledgeBase, { onNavigate: handleNavigate, currentRole, students: uniStudents });
    }
    if (currentView === "calendar") {
      const calendarAppointments =
        (currentRole === "Manager" || currentRole === "Admin") && managerDataScope.active
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
        focusCounselorId: currentRole === "Student" ? studentCalendarFocusCounselorId : null,
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
      onNotify: addNotification,
      onSendStaffMessage: handleSendMessage,
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
      onUploadStudentProfileOtherDocument: handleUploadStudentProfileOtherDocument,
      onUploadStudentUniversityOfferLetters: handleUploadStudentUniversityOfferLetters,
      onUploadStudentCv: handleUploadStudentCv,
      currentUser,
      authenticatedUser,
      highlightTaskId: studentDetailFocusTaskId,
      onNavigateToTask: (tid) => {
        const id = String(tid || "").trim();
        if (!id) return;
        setStudentDetailFocusTaskId(null);
        handleSelectTask(id);
      },
      allStudents: students,
      onDismissAssignmentAlert: handleDismissAssignmentAlert,
      onStudentMovedToRequests: handleStudentMovedToRequests,
      onSelectStudent: handleSelectStudent
    };
    if (currentRole === "Student") {
      const studentUser = currentUser;
      const studentVisibleTasks = tasks.filter((task) => !task.isPrivate);
      if (currentView === "dashboard") return /* @__PURE__ */ jsx(StudentDashboard, { student: studentUser, onNavigate: handleNavigate, tasks: studentVisibleTasks, onUpdateTasks: handleUpdateTasks, employees, onUploadDocument: handleUploadStudentDocument });
      if (currentView === "tasks") return /* @__PURE__ */ jsx(TaskManager, { userRole: "Student", tasks: studentVisibleTasks, student: studentUser, onUpdateStudent: handleUpdateStudent, onAddActivity: handleAddActivity, currentUser, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, employees, onUploadStudentDocument: handleUploadStudentDocument });
      if (currentView === "finance") return /* @__PURE__ */ jsx(FinanceModule, { student: studentUser, invoices, userRole: "Student", onUpdateInvoice: handleUpdateInvoice, onNotify: addNotification });
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
      const openStudentContextForTask = (task) => {
        const sid = String(task?.student_id || task?.studentId || "").trim();
        const tid = String(task?.id ?? "").trim();
        const stu = coordStudents.find((s) => String(s.id || "").trim() === sid);
        if (!stu) {
          if (tid) handleSelectTask(tid);
          else handleNavigate("tasks");
          return;
        }
        handleSelectStudent(stu, tid ? { focusTaskId: tid } : undefined);
      };
      if (currentView === "stage-escalations") {
        const coordEsc = currentRole === "Counselor" ? counselorScopedEscalations : countryCoordinatorScopedEscalations;
        const coordReq = currentRole === "Counselor" ? counselorScopedRequirementViolations : countryCoordinatorScopedRequirementViolations;
        return /* @__PURE__ */ jsx(StageEscalations, {
          escalations: coordEsc,
          requirementViolations: coordReq,
          employees,
          variant: "counselor",
          onOpenStudent: openEscalationStudent
        });
      }
      if (currentRole === "Counselor" && currentView === "integration") {
        return /* @__PURE__ */ jsx(IntegrationPanel, { currentUser });
      }
      if (currentView === "branch") {
        const coordBranch = String(currentUser?.branch || authenticatedUser?.branch || "").trim();
        return /* @__PURE__ */ jsx(BranchAnalytics, { scopeBranch: coordBranch || null });
      }
      if (currentView === "dashboard") return /* @__PURE__ */ jsx(CounselorDashboard, { onNavigate: handleNavigate, tasks: coordTasks, currentUser, counselorIdentitySet: currentRole === "Counselor" ? counselorIdentitySet : null, students: coordStudents, allStudents: students, employees, onSelectStudent: handleSelectStudent, onSelectTask: handleSelectTask, onOpenStudentTask: openStudentContextForTask, assignmentAlerts, onDismissAssignmentAlert: handleDismissAssignmentAlert, onUpdateStudent: handleUpdateStudent, onStudentMovedToRequests: handleStudentMovedToRequests });
      if (currentView === "students") return /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: coordStudents, onUpdateStudent: handleUpdateStudent, onAssignStudentCounselor: handleAssignStudentCounselor, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser, counselorIdentitySet: currentRole === "Counselor" ? counselorIdentitySet : null });
      if (currentView === "tasks") return /* @__PURE__ */ jsx(TaskManager, { userRole: currentRole, tasks: coordTasks, currentUser, counselorIdentitySet: currentRole === "Counselor" ? counselorIdentitySet : null, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, monitoredStudents: coordStudents, employees, onSelectStudent: handleSelectStudent, onNavigate: handleNavigate });
      if (currentView === "student-detail") {
        const selectedSid = selectedStudent ? String(selectedStudent.id ?? "").trim() : "";
        const studentInScope = selectedSid ? coordStudents.find((s) => String(s.id ?? "").trim() === selectedSid) : null;
        return selectedStudent && studentInScope
          ? /* @__PURE__ */ jsx(StudentProfile, { ...coordProfileProps, student: studentInScope, userRole: currentRole })
          : /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: coordStudents, onUpdateStudent: handleUpdateStudent, onAssignStudentCounselor: handleAssignStudentCounselor, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser, counselorIdentitySet: currentRole === "Counselor" ? counselorIdentitySet : null });
      }
      if (currentView === "finance") {
        return /* @__PURE__ */ jsx(StaffFinanceHub, {
          students: coordStudents,
          invoices: coordProfileProps.invoices,
          onOpenStudentLedger: (stu) => handleSelectStudent(stu, { profileTab: "ledger" })
        });
      }
      return /* @__PURE__ */ jsx(CounselorDashboard, { onNavigate: handleNavigate, tasks: coordTasks, currentUser, counselorIdentitySet: currentRole === "Counselor" ? counselorIdentitySet : null, students: coordStudents, allStudents: students, employees, onSelectStudent: handleSelectStudent, onSelectTask: handleSelectTask, onOpenStudentTask: openStudentContextForTask, assignmentAlerts, onDismissAssignmentAlert: handleDismissAssignmentAlert, onUpdateStudent: handleUpdateStudent, onStudentMovedToRequests: handleStudentMovedToRequests });
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
      if (currentView === "dashboard") return /* @__PURE__ */ jsx(ManagerDashboard, {
        activities: mgrActivities,
        tasks: mgrTasks,
        students: mgrStudents,
        employees: mgrEmployees,
        currentUser,
        onNavigate: handleNavigate,
        onReassignDeskTask: handleReassignDeskTask,
        invoices: mgrProfileProps.invoices,
        onUpdateInvoice: handleUpdateInvoice,
        onSelectStudent: handleSelectStudent,
        onNotify: addNotification,
        canApproveInvoicePayments: currentRole === "Manager"
      });
      if (currentView === "counselors") return /* @__PURE__ */ jsx(CounselorManagement, { onNavigate: handleNavigate, students: mgrStudents, employees: mgrEmployees, tasks: mgrTasks, onTransferStudents: handleTransferStudents, onAddActivity: handleAddActivity, onAddCounselor: handleAddCounselor, currentRole, authenticatedUserEmail: authenticatedUser?.email || "", resetSignal: counselorListResetSignal });
      if (currentRole === "Manager" && currentView === "branch") return /* @__PURE__ */ jsx(BranchAnalytics, { scopeBranch: managerDataScope.active ? managerDataScope.branchLabel : null, students: managerDataScope.active ? mgrStudents : void 0, branchScopedStudents: managerDataScope.active });
      if (currentView === "students") return /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: mgrStudents, onUpdateStudent: handleUpdateStudent, onAssignStudentCounselor: handleAssignStudentCounselor, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      if (currentView === "tasks") {
        const escBlock = currentRole === "Manager" ? managerScopedEscalations : teamLeadScopedEscalations;
        const reqBlock = currentRole === "Manager" ? managerScopedRequirementViolations : teamLeadScopedRequirementViolations;
        return /* @__PURE__ */ jsxs(Fragment, {
          children: [
            /* @__PURE__ */ jsx(StageEscalations, {
              escalations: escBlock,
              requirementViolations: reqBlock,
              employees: mgrEmployees,
              variant: "manager",
              onOpenStudent: openEscalationStudent
            }),
            /* @__PURE__ */ jsx(TaskManager, {
              userRole: "Manager",
              tasks: mgrTasks,
              currentUser,
              selectedTaskId,
              onUpdateTasks: handleUpdateTasks,
              onAddTask: handleAddTask,
              monitoredStudents: mgrStudents,
              employees: mgrEmployees,
              onSelectStudent: handleSelectStudent,
              onNavigate: handleNavigate,
              wrapClassName: "mt-8"
            })
          ]
        });
      }
      if (currentView === "student-detail") return selectedStudent && mgrStudents.some((s) => s.id === selectedStudent.id) ? /* @__PURE__ */ jsx(StudentProfile, { ...mgrProfileProps, student: selectedStudent, userRole: "Manager" }) : /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: mgrStudents, onUpdateStudent: handleUpdateStudent, onAssignStudentCounselor: handleAssignStudentCounselor, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      if (currentView === "requested-students") return /* @__PURE__ */ jsx(RequestedStudents, { userRole: currentRole, scopeBranch: managerDataScope.active ? managerDataScope.branchLabel : null, onAddFromRequest: handleAddFromRequest });
      if (currentView === "finance") {
        return /* @__PURE__ */ jsx(StaffFinanceHub, {
          students: mgrStudents,
          invoices: mgrProfileProps.invoices,
          onOpenStudentLedger: (stu) => handleSelectStudent(stu, { profileTab: "ledger" })
        });
      }
      return /* @__PURE__ */ jsx(ManagerDashboard, {
        activities: mgrActivities,
        tasks: mgrTasks,
        students: mgrStudents,
        employees: mgrEmployees,
        currentUser,
        onNavigate: handleNavigate,
        onReassignDeskTask: handleReassignDeskTask,
        invoices: mgrProfileProps.invoices,
        onUpdateInvoice: handleUpdateInvoice,
        onSelectStudent: handleSelectStudent,
        onNotify: addNotification,
        canApproveInvoicePayments: currentRole === "Manager"
      });
    }
    const adminBranchScoped = currentRole === "Admin" && managerDataScope.active;
    const adminViewStudents = adminBranchScoped ? managerScopedStudents : students;
    const adminViewTasks = adminBranchScoped ? managerScopedTasks : tasks;
    const adminViewEmployees = adminBranchScoped ? managerScopedEmployees : employees;
    const adminViewActivities = adminBranchScoped ? managerScopedActivities : activities;
    const adminViewProfileProps = adminBranchScoped
      ? { ...studentProfileProps, tasks: adminViewTasks, invoices: managerScopedInvoices }
      : studentProfileProps;
    switch (currentView) {
      case "dashboard":
        return /* @__PURE__ */ jsx(AdminDashboard, {
          activities: adminViewActivities,
          tasks: adminViewTasks,
          students: adminViewStudents,
          employees: adminViewEmployees,
          invoices: adminBranchScoped ? managerScopedInvoices : invoices,
          currentUser,
          onSelectStudent: handleSelectStudent,
          studentsScopeLabel: adminBranchScoped ? managerDataScope.branchLabel || null : null,
        });
      case "counselors":
        return /* @__PURE__ */ jsx(CounselorManagement, { onNavigate: handleNavigate, students: adminViewStudents, employees: adminViewEmployees, tasks: adminViewTasks, onTransferStudents: handleTransferStudents, onAddCounselor: handleAddCounselor, currentRole, authenticatedUserEmail: authenticatedUser?.email || "", resetSignal: counselorListResetSignal });
      case "accounts":
        return /* @__PURE__ */ jsx(AccountsManagement, {
          onAdminAvatarUpdated: (row) => {
            setAdminAvatar(toAbsoluteAssetUrl(row.avatar) || DEFAULT_USER_AVATAR);
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
              "Password reset",
              `Password updated for ${row.username} (${row.email}). Share the new password with them securely.`,
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
        return /* @__PURE__ */ jsx(BranchAnalytics, { scopeBranch: adminBranchScoped ? managerDataScope.branchLabel : null });
      case "students":
        return /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: adminViewStudents, onUpdateStudent: handleUpdateStudent, onAssignStudentCounselor: handleAssignStudentCounselor, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      case "requested-students":
        return /* @__PURE__ */ jsx(RequestedStudents, { userRole: currentRole, scopeBranch: adminBranchScoped ? managerDataScope.branchLabel : null, onAddFromRequest: handleAddFromRequest });
      case "student-detail":
        return selectedStudent && adminViewStudents.some((s) => s.id === selectedStudent.id) ? /* @__PURE__ */ jsx(StudentProfile, { ...adminViewProfileProps, student: selectedStudent, userRole: "Admin" }) : /* @__PURE__ */ jsx(StudentList, { onSelectStudent: handleSelectStudent, students: adminViewStudents, onUpdateStudent: handleUpdateStudent, onAssignStudentCounselor: handleAssignStudentCounselor, onNavigate: handleNavigate, onAddActivity: handleAddActivity, userRole: currentRole, onAddStudent: handleAddStudent, currentUser, authenticatedUser });
      case "finance":
        return /* @__PURE__ */ jsx(StaffFinanceHub, {
          students: adminViewStudents,
          invoices: adminViewProfileProps.invoices,
          onOpenStudentLedger: (stu) => handleSelectStudent(stu, { profileTab: "ledger" })
        });
      case "tasks":
        return /* @__PURE__ */ jsxs(Fragment, {
          children: [
            /* @__PURE__ */ jsx(StageEscalations, {
              escalations: managerScopedEscalations,
              requirementViolations: managerScopedRequirementViolations,
              employees,
              variant: "admin",
              onOpenStudent: openEscalationStudent
            }),
            /* @__PURE__ */ jsx(TaskManager, { userRole: "Admin", tasks: adminViewTasks, currentUser, selectedTaskId, onUpdateTasks: handleUpdateTasks, onAddTask: handleAddTask, monitoredStudents: adminViewStudents, employees, onSelectStudent: handleSelectStudent, onNavigate: handleNavigate })
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
        const nextRole = normalizePortalRole(user?.role);
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
        onNotificationNavigate: handleNotificationNavigate,
        onUpdateProfileAvatar: handleUpdateProfileAvatar,
        onUpdateProfileContact: handleUpdateProfileContact,
        navMyTasksCount,
        requestedStudentsBadge: (currentRole === "Admin" || currentRole === "Manager") && requestedStudentsCount > 0 ? String(requestedStudentsCount) : "",
        pipelineEscalationBadge: pipelineEscalationNavBadge,
        counselorStageEscalationBadge: counselorStageNavBadge,
        counselorStudentsBadge: "",
        pageLoading: !appDataLoaded,
        showWhatsappNavIndicator: currentRole === "Counselor",
        whatsappConnectionStatus,
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
        students: currentRole === "Country Coordinator" && countryCoordinatorScope.active ? countryCoordinatorScopedStudents : currentRole === "Counselor" ? counselorScopedStudents : currentRole === "Admin" && managerDataScope.active ? managerScopedStudents : students,
        employees
      }
    ),
    /* @__PURE__ */ jsx("div", { ref: toastStackRef, className: "fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none", children: notifications.map((n) => {
      const toastHasLink = Boolean(n.link && (n.link.taskId || n.link.studentId || n.link.view));
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `bg-white border border-gray-200 rounded-xl shadow-xl p-4 flex items-start gap-4 animate-in slide-in-from-right duration-300 pointer-events-auto max-w-sm${toastHasLink ? " cursor-pointer hover:bg-slate-50" : ""}`,
          ...(toastHasLink ? {
            role: "button",
            tabIndex: 0,
            onClick: () => handleNotificationNavigate(n),
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleNotificationNavigate(n);
              }
            }
          } : {}),
          children: [
            /* @__PURE__ */ jsx("div", { className: `w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${n.type === "success" ? "bg-emerald-100 text-emerald-600" : n.type === "warning" ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"}`, children: /* @__PURE__ */ jsx(Bell, { size: 20 }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-900 truncate", children: n.title }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 mt-0.5 leading-relaxed", children: n.message })
            ] }),
            /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                setNotifications((prev) => prev.filter((notif) => notif.id !== n.id));
              },
              className: "text-slate-400 hover:text-slate-600",
              children: /* @__PURE__ */ jsx(X, { size: 14 })
            })
          ]
        },
        n.id
      );
    }) })
  ] });
}
var App_default = App;
export {
  App_default as default
};
