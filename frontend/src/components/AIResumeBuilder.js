import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Upload,
  CheckCircle,
  Loader2,
  ArrowRight,
  Eye,
  ExternalLink,
  RefreshCw,
  User,
  GraduationCap,
  Briefcase,
  Wand2,
  FileText,
  Mail,
  Phone,
  MapPin,
  Plus,
  Trash2,
  Copy,
  Trophy,
  Camera,
  Layout,
  Type,
  Award,
  Languages,
  Heart,
  Target,
  Settings,
  Image as ImageIcon
} from "lucide-react";
import { Button } from "./Button";
import { COMPANY_AI_BRAND, COMPANY_NAME, RESUME_BUILDER_TITLE } from "../companyConfig";
function parseNotesForProgramEducation(notes) {
  const n = String(notes || "");
  const programM = n.match(/Program:\s*([^.]+?)(?:\.|\s+Education:|$)/i);
  const eduM = n.match(/Education:\s*([^.]+?)(?:\.|$)/i);
  if (!programM && !eduM) return null;
  return [
    {
      degree: (programM?.[1] || "").trim() || "Program of interest",
      school: (eduM?.[1] || "").trim()
    }
  ];
}
function buildResumeDataFromStudent(student) {
  const emptyRowExp = { title: "", company: "", period: "" };
  const emptyRowEdu = { degree: "", school: "" };
  const emptyScores = [{ name: "IELTS", score: "" }];
  const base = {
    name: "",
    role: "",
    email: "",
    phone: "",
    experience: [emptyRowExp],
    education: [emptyRowEdu],
    testScores: emptyScores,
    profilePicture: null,
    customSections: []
  };
  if (!student || typeof student !== "object") {
    return base;
  }
  const gv = student.generatedCV && typeof student.generatedCV === "object" ? student.generatedCV : null;
  let data = { ...base };
  if (gv) {
    data = {
      ...base,
      name: String(gv.name || "").trim(),
      role: String(gv.role || "").trim(),
      email: String(gv.email || "").trim(),
      phone: String(gv.phone || "").trim(),
      experience: Array.isArray(gv.experience) && gv.experience.length ? gv.experience.map((e) => ({
        title: String(e?.title || ""),
        company: String(e?.company || ""),
        period: String(e?.period || "")
      })) : [emptyRowExp],
      education: Array.isArray(gv.education) && gv.education.length ? gv.education.map((e) => ({
        degree: String(e?.degree || ""),
        school: String(e?.school || "")
      })) : [emptyRowEdu],
      testScores: Array.isArray(gv.testScores) && gv.testScores.length ? gv.testScores.map((t) => ({
        name: String(t?.name || ""),
        score: String(t?.score || "")
      })) : [...emptyScores],
      customSections: Array.isArray(gv.customSections) ? gv.customSections : [],
      profilePicture: gv.profilePicture || null
    };
  }
  if (String(student.name || "").trim()) {
    data.name = String(student.name).trim();
  }
  if (String(student.email || "").trim()) {
    data.email = String(student.email).trim();
  }
  if (String(student.phone || "").trim()) {
    data.phone = String(student.phone).trim();
  }
  const status = String(student.status || "").trim();
  const country = String(student.country || "").trim();
  if (!String(data.role || "").trim()) {
    data.role = [status, country].filter(Boolean).join(" · ");
  }
  const ieltsVal = String(student.ielts || "").trim();
  if (ieltsVal) {
    const lower = data.testScores.map((t) => String(t.name || "").toLowerCase());
    const idx = lower.findIndex((n) => n.includes("ielts"));
    if (idx >= 0) {
      data.testScores = data.testScores.map((t, i) => i === idx ? { ...t, score: ieltsVal } : t);
    } else {
      data.testScores = [...data.testScores, { name: "IELTS", score: ieltsVal }];
    }
  }
  const avatar = student.avatar;
  if (avatar && !data.profilePicture) {
    data.profilePicture = avatar;
  }
  const parsedEdu = parseNotesForProgramEducation(student.notes);
  const eduIsBlank = data.education.every((e) => !String(e.degree || "").trim() && !String(e.school || "").trim());
  if (parsedEdu && eduIsBlank) {
    data.education = parsedEdu;
  }
  return data;
}
async function captureElementToPdfBlob(htmlElement) {
  if (!htmlElement) {
    throw new Error("Nothing to export.");
  }
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf")
  ]);
  const canvas = await html2canvas(htmlElement, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = canvas.height * pdfWidth / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
  heightLeft -= pdfHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
  }
  return pdf.output("blob");
}
const AIResumeBuilder = ({ onNavigate, onSaveCV, currentStudent, onUploadStudentCv, onUploadStudentDocument, embedMode = false }) => {
  const [step, setStep] = useState("initial");
  const [activeFlow, setActiveFlow] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isOpeningPdfTab, setIsOpeningPdfTab] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [finalUploadError, setFinalUploadError] = useState("");
  const [isFinalUploading, setIsFinalUploading] = useState(false);
  const cvPdfCaptureRef = useRef(null);
  const initialExtractedData = useMemo(() => ({
    name: "Nirash Dilshan Jayantha",
    role: `CO-Founder | ${COMPANY_NAME}`,
    email: "info@abecpremier.com",
    phone: "(+94) 77 96 95 412",
    experience: [
      { title: "Co-Founder & GTM Lead", company: COMPANY_NAME, period: "OCT 2020 \u2013 PRESENT" },
      { title: "Lead Product Designer", company: "Reach Solutions", period: "2017 \u2013 2020" }
    ],
    education: [
      { degree: "Bachelor of Information Technology (BIT)", school: "University of Colombo" },
      { degree: "Higher National Diploma Digital Communication", school: "Aquinas College" }
    ],
    testScores: [
      { name: "IELTS", score: "7.5" }
    ],
    profilePicture: null,
    customSections: []
  }), [COMPANY_NAME]);
  const [editableData, setEditableData] = useState(initialExtractedData);
  const reset = useCallback(() => {
    setStep("initial");
    setActiveFlow(null);
    setProgress(0);
    setUploadedFile(null);
    setEditableData(initialExtractedData);
    setFinalUploadError("");
    setIsFinalUploading(false);
    setIsOpeningPdfTab(false);
  }, [initialExtractedData]);
  const handleDataChange = (field, value) => {
    setEditableData((prev) => ({ ...prev, [field]: value }));
  };
  const updateExperience = (index, field, value) => {
    const newExp = [...editableData.experience];
    newExp[index] = { ...newExp[index], [field]: value };
    handleDataChange("experience", newExp);
  };
  const addExperience = () => {
    handleDataChange("experience", [...editableData.experience, { title: "", company: "", period: "" }]);
  };
  const duplicateExperience = (index) => {
    const newExp = [...editableData.experience];
    newExp.splice(index + 1, 0, { ...newExp[index] });
    handleDataChange("experience", newExp);
  };
  const removeExperience = (index) => {
    handleDataChange("experience", editableData.experience.filter((_, i) => i !== index));
  };
  const updateEducation = (index, field, value) => {
    const newEdu = [...editableData.education];
    newEdu[index] = { ...newEdu[index], [field]: value };
    handleDataChange("education", newEdu);
  };
  const addEducation = () => {
    handleDataChange("education", [...editableData.education, { degree: "", school: "" }]);
  };
  const duplicateEducation = (index) => {
    const newEdu = [...editableData.education];
    newEdu.splice(index + 1, 0, { ...newEdu[index] });
    handleDataChange("education", newEdu);
  };
  const removeEducation = (index) => {
    handleDataChange("education", editableData.education.filter((_, i) => i !== index));
  };
  const updateTestScore = (index, field, value) => {
    const newScores = [...editableData.testScores];
    newScores[index] = { ...newScores[index], [field]: value };
    handleDataChange("testScores", newScores);
  };
  const addTestScore = () => {
    handleDataChange("testScores", [...editableData.testScores, { name: "", score: "" }]);
  };
  const removeTestScore = (index) => {
    handleDataChange("testScores", editableData.testScores.filter((_, i) => i !== index));
  };
  const addCustomSection = () => {
    const newSection = {
      id: Math.random().toString(36).substr(2, 9),
      title: "New Section",
      icon: "Award",
      content: ""
    };
    handleDataChange("customSections", [...editableData.customSections, newSection]);
  };
  const updateCustomSection = (id, field, value) => {
    const newSections = editableData.customSections.map(
      (s) => s.id === id ? { ...s, [field]: value } : s
    );
    handleDataChange("customSections", newSections);
  };
  const removeCustomSection = (id) => {
    handleDataChange("customSections", editableData.customSections.filter((s) => s.id !== id));
  };
  const handleProfilePictureUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        handleDataChange("profilePicture", event.target?.result);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };
  const renderIcon = (iconName, size = 18, className = "") => {
    const icons = {
      Award,
      Languages,
      Heart,
      Target,
      Trophy,
      Briefcase,
      GraduationCap,
      User,
      FileText,
      Mail,
      Phone,
      MapPin,
      Sparkles,
      Wand2,
      Layout,
      Type,
      Settings,
      ImageIcon
    };
    const IconComponent = icons[iconName] || Award;
    return /* @__PURE__ */ jsx(IconComponent, { size, className });
  };
  const startAssistFlow = useCallback(() => {
    if (currentStudent) {
      setEditableData(buildResumeDataFromStudent(currentStudent));
    } else {
      setEditableData(initialExtractedData);
    }
    setActiveFlow("assist");
    setStep("processing");
    setProgress(0);
  }, [currentStudent, initialExtractedData]);
  const uploadCvToSystem = async (file, { advanceToUploading = false } = {}) => {
    if (!onUploadStudentCv || !currentStudent?.id) {
      return { ok: false, error: "Student CV upload is not available." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "File must be under 10MB." };
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    }).catch((error) => ({ __error: error?.message || "Failed to read file." }));
    if (dataUrl && typeof dataUrl === "object" && dataUrl.__error) {
      return { ok: false, error: dataUrl.__error };
    }
    const result = await onUploadStudentCv({
      studentId: currentStudent.id,
      fileName: file.name,
      dataUrl
    });
    if (!result?.ok) {
      return { ok: false, error: result?.error || "Failed to upload CV." };
    }
    setUploadedFile(file);
    if (advanceToUploading) {
      setTimeout(() => {
        setStep("uploading");
      }, 800);
    }
    return { ok: true };
  };
  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadError("");
      if (activeFlow === "update") {
        uploadCvToSystem(file, { advanceToUploading: true }).then((result) => {
          if (!result?.ok) {
            setUploadError(result?.error || "Failed to upload CV.");
          }
        });
        return;
      }
      setUploadedFile(file);
      setTimeout(() => {
        setStep("uploading");
      }, 800);
    }
  };
  useEffect(() => {
    if (step === "processing" || step === "uploading" || step === "refining") {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            if (step === "processing") setStep("extracted");
            if (step === "uploading") setStep("refining");
            if (step === "refining") setStep("preview");
            return 100;
          }
          return prev + (step === "uploading" ? 4 : 2);
        });
      }, 50);
      return () => clearInterval(interval);
    }
    if (step === "success") {
      const timer = setTimeout(() => {
        if (!embedMode) {
          if (onNavigate) {
            onNavigate("dashboard");
          } else {
            window.location.hash = "#dashboard";
          }
        }
        reset();
      }, 3e3);
      return () => clearTimeout(timer);
    }
  }, [step, onNavigate, reset, embedMode]);
  const handleRefineSubmit = () => {
    setStep("refining");
    setProgress(0);
  };
  const handleFinalUpload = useCallback(async () => {
    setFinalUploadError("");
    const cvData = {
      ...editableData,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    let mergeBase = null;
    const wantsCvFile = Boolean(onUploadStudentCv && currentStudent?.id);
    const wantsProfessionalCvDoc = Boolean(onUploadStudentDocument && currentStudent?.id);
    if (wantsCvFile || wantsProfessionalCvDoc) {
      setIsFinalUploading(true);
      try {
        const el = cvPdfCaptureRef.current;
        if (!el) {
          setFinalUploadError("CV layout is not available to upload.");
          setIsFinalUploading(false);
          return;
        }
        const blob = await captureElementToPdfBlob(el);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Failed to read PDF."));
          reader.readAsDataURL(blob);
        });
        const raw = String(editableData.name || "CV").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "-");
        const fileName = `${raw.slice(0, 80) || "Generated-CV"}-AI-CV.pdf`;
        if (wantsCvFile) {
          const result = await onUploadStudentCv({
            studentId: currentStudent.id,
            fileName,
            dataUrl
          });
          if (!result?.ok) {
            setFinalUploadError(result?.error || "Failed to upload CV to the student profile.");
            setIsFinalUploading(false);
            return;
          }
          mergeBase = result.data || null;
        }
        if (wantsProfessionalCvDoc) {
          const docResult = await onUploadStudentDocument({
            studentId: currentStudent.id,
            fileName,
            dataUrl,
            docType: "Professional CV",
            phase: 1,
            tier: "Global"
          });
          if (!docResult?.ok) {
            setFinalUploadError(docResult?.error || "Failed to add the CV under Professional CV in documents.");
            setIsFinalUploading(false);
            return;
          }
          mergeBase = docResult.data || mergeBase;
        }
      } catch (err) {
        setFinalUploadError(err?.message || "Could not generate or upload the CV file.");
        setIsFinalUploading(false);
        return;
      }
      setIsFinalUploading(false);
    }
    if (onSaveCV) {
      await Promise.resolve(onSaveCV(cvData, mergeBase));
    }
    setStep("success");
  }, [editableData, onSaveCV, onUploadStudentCv, onUploadStudentDocument, currentStudent]);
  const handleOpenCvInNewTab = useCallback(async () => {
    setFinalUploadError("");
    const el = cvPdfCaptureRef.current;
    if (!el) {
      setFinalUploadError("CV preview is not ready yet.");
      return;
    }
    setIsOpeningPdfTab(true);
    try {
      const blob = await captureElementToPdfBlob(el);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        URL.revokeObjectURL(url);
        setFinalUploadError("Pop-up was blocked. Allow pop-ups for this site to open the CV.");
        return;
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      setFinalUploadError(err?.message || "Could not open CV in a new tab.");
    } finally {
      setIsOpeningPdfTab(false);
    }
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3", children: [
          RESUME_BUILDER_TITLE,
          /* @__PURE__ */ jsx("span", { className: "text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider", children: "Beta" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-1", children: `Professional resumes powered by ${COMPANY_AI_BRAND} technology.` })
      ] }),
      step !== "initial" && step !== "success" && /* @__PURE__ */ jsxs(Button, { variant: "ghost", onClick: reset, className: "text-slate-500", children: [
        /* @__PURE__ */ jsx(RefreshCw, { size: 16, className: "mr-2" }),
        " Start Over"
      ] })
    ] }),
    currentStudent?.cvFile ? /* @__PURE__ */ jsxs("div", { className: "bg-white border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "h-11 w-11 rounded-lg bg-emerald-600 text-white flex items-center justify-center", children: /* @__PURE__ */ jsx(FileText, { size: 20 }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900", children: currentStudent.cvFile.name || "Uploaded CV" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Uploaded CV in your profile" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx("a", { href: currentStudent.cvFile.url, target: "_blank", rel: "noreferrer", children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", children: [
          /* @__PURE__ */ jsx(Eye, { size: 14, className: "mr-1" }),
          "View"
        ] }) }),
        /* @__PURE__ */ jsx("a", { href: currentStudent.cvFile.url, target: "_blank", rel: "noreferrer", download: currentStudent.cvFile.name || true, children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", children: [
          /* @__PURE__ */ jsx(FileText, { size: 14, className: "mr-1" }),
          "Download"
        ] }) })
      ] })
    ] }) : null,
    /* @__PURE__ */ jsxs(AnimatePresence, { mode: "wait", children: [
      step === "initial" && /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -20 },
          className: "flex flex-col gap-8",
          children: [
            /* @__PURE__ */ jsxs("div", { className: "group relative bg-white border border-gray-200 rounded-3xl p-8 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-500 overflow-hidden", children: [
              /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-100 transition-colors duration-500" }),
              /* @__PURE__ */ jsxs("div", { className: "relative z-10", children: [
                /* @__PURE__ */ jsx("div", { className: "w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-500", children: /* @__PURE__ */ jsx(Sparkles, { size: 28 }) }),
                /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold text-slate-900 mb-3", children: "AI CV Assist" }),
                /* @__PURE__ */ jsx("p", { className: "text-slate-500 mb-8 leading-relaxed", children: "Automatically generate a professional resume using your existing profile data and AI optimization." }),
                /* @__PURE__ */ jsxs("ul", { className: "space-y-3 mb-8", children: [
                  /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-600", children: [
                    /* @__PURE__ */ jsx(CheckCircle, { size: 16, className: "text-emerald-500" }),
                    " Auto-fill from CV.pdf"
                  ] }),
                  /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-600", children: [
                    /* @__PURE__ */ jsx(CheckCircle, { size: 16, className: "text-emerald-500" }),
                    " AI Content Optimization"
                  ] }),
                  /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-600", children: [
                    /* @__PURE__ */ jsx(CheckCircle, { size: 16, className: "text-emerald-500" }),
                    " Modern Editorial Layout"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    onClick: startAssistFlow,
                    className: "w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-lg font-bold shadow-lg shadow-indigo-100 group-hover:gap-4 transition-all",
                    children: [
                      "Generate CV ",
                      /* @__PURE__ */ jsx(ArrowRight, { size: 20 })
                    ]
                  }
                )
              ] })
            ] })
          ]
        },
        "initial"
      ),
      step === "upload-cv" && /* @__PURE__ */ jsx(
        motion.div,
        {
          initial: { opacity: 0, scale: 0.95 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.05 },
          className: "bg-white border border-gray-200 rounded-3xl p-12 shadow-xl text-center space-y-8",
          children: /* @__PURE__ */ jsxs("div", { className: "max-w-md mx-auto", children: [
            /* @__PURE__ */ jsx("div", { className: "w-20 h-20 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6", children: /* @__PURE__ */ jsx(Upload, { size: 32 }) }),
            /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-slate-900", children: "Upload Your Current CV" }),
            /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-2 mb-8", children: `${COMPANY_AI_BRAND} will analyze your existing resume to extract your professional background.` }),
            /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: ".pdf,.doc,.docx",
                  onChange: handleFileUpload,
                  className: "absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "border-2 border-dashed border-slate-200 rounded-2xl p-10 group-hover:border-emerald-400 group-hover:bg-emerald-50/30 transition-all duration-300", children: /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsx(Upload, { className: "mx-auto text-slate-400 group-hover:text-emerald-500 transition-colors", size: 32 }),
                /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-600", children: "Click to upload or drag and drop" }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400", children: "PDF, DOCX or DOC (Max. 10MB)" })
              ] }) })
            ] }),
            uploadedFile && /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                className: "mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between",
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200", children: /* @__PURE__ */ jsx(FileText, { className: "text-emerald-600", size: 20 }) }),
                    /* @__PURE__ */ jsxs("div", { className: "text-left", children: [
                      /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-slate-700 truncate max-w-[200px]", children: uploadedFile.name }),
                      /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-slate-400", children: [
                        (uploadedFile.size / (1024 * 1024)).toFixed(2),
                        " MB"
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx(Loader2, { className: "animate-spin text-emerald-600", size: 20 })
                ]
              }
            ),
            uploadError ? /* @__PURE__ */ jsx("p", { className: "text-xs text-rose-600 mt-3", children: uploadError }) : null
          ] })
        },
        "upload-cv"
      ),
      (step === "processing" || step === "uploading") && /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, scale: 0.95 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.05 },
          className: "bg-white border border-gray-200 rounded-3xl p-12 shadow-xl text-center space-y-8",
          children: [
            /* @__PURE__ */ jsxs("div", { className: "relative w-24 h-24 mx-auto", children: [
              /* @__PURE__ */ jsxs("svg", { className: "w-full h-full transform -rotate-90", children: [
                /* @__PURE__ */ jsx(
                  "circle",
                  {
                    cx: "48",
                    cy: "48",
                    r: "44",
                    stroke: "currentColor",
                    strokeWidth: "8",
                    fill: "transparent",
                    className: "text-gray-100"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "circle",
                  {
                    cx: "48",
                    cy: "48",
                    r: "44",
                    stroke: "currentColor",
                    strokeWidth: "8",
                    fill: "transparent",
                    strokeDasharray: 276,
                    strokeDashoffset: 276 - 276 * progress / 100,
                    className: "text-indigo-600 transition-all duration-300"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsx(Loader2, { className: "animate-spin text-indigo-600", size: 32 }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-slate-900", children: step === "processing" ? `${COMPANY_AI_BRAND} Scanning CV.pdf...` : "Uploading Old CV..." }),
              /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-2", children: `${COMPANY_AI_BRAND} is extracting your professional DNA.` })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "max-w-md mx-auto bg-gray-100 h-2 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx(
              motion.div,
              {
                className: "h-full bg-indigo-600",
                initial: { width: 0 },
                animate: { width: `${progress}%` }
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-center gap-8 text-xs font-bold text-slate-400 uppercase tracking-widest", children: [
              /* @__PURE__ */ jsx("span", { className: progress > 20 ? "text-indigo-600" : "", children: "Parsing" }),
              /* @__PURE__ */ jsx("span", { className: progress > 50 ? "text-indigo-600" : "", children: "Analyzing" }),
              /* @__PURE__ */ jsx("span", { className: progress > 80 ? "text-indigo-600" : "", children: "Optimizing" })
            ] })
          ]
        },
        "processing"
      ),
      step === "extracted" && /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, x: 20 },
          animate: { opacity: 1, x: 0 },
          className: "space-y-6",
          children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-6 shadow-sm", children: [
                /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 mb-6 flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx(User, { size: 18, className: "text-indigo-600" }),
                  " Extracted Profile"
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-col md:flex-row gap-8", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex-shrink-0", children: [
                    /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400 block mb-2 text-center", children: "Profile Photo" }),
                    /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
                      /* @__PURE__ */ jsx("div", { className: "w-32 h-32 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50", children: editableData.profilePicture ? /* @__PURE__ */ jsx("img", { src: editableData.profilePicture, alt: "Profile", className: "w-full h-full object-cover" }) : /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
                        /* @__PURE__ */ jsx(Camera, { className: "mx-auto text-slate-300 mb-1", size: 24 }),
                        /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold text-slate-400", children: "Upload" })
                      ] }) }),
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          type: "file",
                          accept: "image/*",
                          onChange: handleProfilePictureUpload,
                          className: "absolute inset-0 opacity-0 cursor-pointer"
                        }
                      ),
                      editableData.profilePicture && /* @__PURE__ */ jsx(
                        "button",
                        {
                          onClick: () => handleDataChange("profilePicture", null),
                          className: "absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity",
                          children: /* @__PURE__ */ jsx(Trash2, { size: 12 })
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-4", children: [
                    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
                      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Full Name" }),
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "text",
                            value: editableData.name,
                            onChange: (e) => handleDataChange("name", e.target.value),
                            placeholder: "Nirash Dilshan Jayantha",
                            className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          }
                        )
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Current Role" }),
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "text",
                            value: editableData.role,
                            onChange: (e) => handleDataChange("role", e.target.value),
                            placeholder: "CO-Founder | NexGenAI Solutions",
                            className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          }
                        )
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
                      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Email" }),
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "email",
                            value: editableData.email,
                            onChange: (e) => handleDataChange("email", e.target.value),
                            placeholder: "Info@nexgenai.asia",
                            className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          }
                        )
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Phone" }),
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "text",
                            value: editableData.phone,
                            onChange: (e) => handleDataChange("phone", e.target.value),
                            placeholder: "(+94) 77 96 95 412",
                            className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          }
                        )
                      ] })
                    ] })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-6 shadow-sm", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-6", children: [
                  /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx(Briefcase, { size: 18, className: "text-indigo-600" }),
                    " Experience"
                  ] }),
                  /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: addExperience, className: "text-indigo-600 h-8 px-2", children: [
                    /* @__PURE__ */ jsx(Plus, { size: 14, className: "mr-1" }),
                    " Add"
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "space-y-4", children: editableData.experience.map((exp, i) => /* @__PURE__ */ jsxs("div", { className: "group p-4 bg-slate-50 rounded-xl border border-slate-100 relative", children: [
                  /* @__PURE__ */ jsxs("div", { className: "absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity", children: [
                    /* @__PURE__ */ jsx("button", { onClick: () => duplicateExperience(i), className: "p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md transition-all", children: /* @__PURE__ */ jsx(Copy, { size: 14 }) }),
                    /* @__PURE__ */ jsx("button", { onClick: () => removeExperience(i), className: "p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-md transition-all", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                      /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Job Title" }),
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          type: "text",
                          value: exp.title,
                          onChange: (e) => updateExperience(i, "title", e.target.value),
                          placeholder: "e.g. Lead Product Designer",
                          className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                      /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Company" }),
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          type: "text",
                          value: exp.company,
                          onChange: (e) => updateExperience(i, "company", e.target.value),
                          placeholder: `e.g. ${COMPANY_NAME}`,
                          className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1 md:col-span-2", children: [
                      /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Period" }),
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          type: "text",
                          value: exp.period,
                          onChange: (e) => updateExperience(i, "period", e.target.value),
                          placeholder: "e.g. OCT 2020 \u2013 PRESENT",
                          className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-indigo-600 outline-none focus:border-indigo-500 transition-all"
                        }
                      )
                    ] })
                  ] })
                ] }, i)) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-6 shadow-sm", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-6", children: [
                  /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx(GraduationCap, { size: 18, className: "text-indigo-600" }),
                    " Education"
                  ] }),
                  /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: addEducation, className: "text-indigo-600 h-8 px-2", children: [
                    /* @__PURE__ */ jsx(Plus, { size: 14, className: "mr-1" }),
                    " Add"
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "space-y-4", children: editableData.education.map((edu, i) => /* @__PURE__ */ jsxs("div", { className: "group p-4 bg-slate-50 rounded-xl border border-slate-100 relative", children: [
                  /* @__PURE__ */ jsxs("div", { className: "absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity", children: [
                    /* @__PURE__ */ jsx("button", { onClick: () => duplicateEducation(i), className: "p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md transition-all", children: /* @__PURE__ */ jsx(Copy, { size: 14 }) }),
                    /* @__PURE__ */ jsx("button", { onClick: () => removeEducation(i), className: "p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-md transition-all", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4", children: [
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                      /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Degree / Qualification" }),
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          type: "text",
                          value: edu.degree,
                          onChange: (e) => updateEducation(i, "degree", e.target.value),
                          placeholder: "e.g. Bachelor of Information Technology",
                          className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                      /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Institution" }),
                      /* @__PURE__ */ jsx(
                        "input",
                        {
                          type: "text",
                          value: edu.school,
                          onChange: (e) => updateEducation(i, "school", e.target.value),
                          placeholder: "e.g. University of Colombo",
                          className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                        }
                      )
                    ] })
                  ] })
                ] }, i)) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-6 shadow-sm", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-6", children: [
                  /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx(Trophy, { size: 18, className: "text-indigo-600" }),
                    " Test Scores"
                  ] }),
                  /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: addTestScore, className: "text-indigo-600 h-8 px-2", children: [
                    /* @__PURE__ */ jsx(Plus, { size: 14, className: "mr-1" }),
                    " Add"
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: editableData.testScores.map((score, i) => /* @__PURE__ */ jsxs("div", { className: "group p-3 bg-slate-50 rounded-xl border border-slate-100 relative flex items-center gap-3", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex-1 grid grid-cols-2 gap-2", children: [
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "text",
                        value: score.name,
                        onChange: (e) => updateTestScore(i, "name", e.target.value),
                        placeholder: "IELTS",
                        className: "w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-bold text-slate-700 outline-none"
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "text",
                        value: score.score,
                        onChange: (e) => updateTestScore(i, "score", e.target.value),
                        placeholder: "7.5",
                        className: "w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-bold text-indigo-600 outline-none"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx("button", { onClick: () => removeTestScore(i), className: "text-slate-400 hover:text-rose-600 transition-colors", children: /* @__PURE__ */ jsx(Trash2, { size: 14 }) })
                ] }, i)) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-2xl p-6 shadow-sm", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-6", children: [
                  /* @__PURE__ */ jsxs("h3", { className: "font-bold text-slate-900 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx(Layout, { size: 18, className: "text-indigo-600" }),
                    " Custom Sections"
                  ] }),
                  /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: addCustomSection, className: "text-indigo-600 h-8 px-2", children: [
                    /* @__PURE__ */ jsx(Plus, { size: 14, className: "mr-1" }),
                    " Add Section"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
                  editableData.customSections.map((section) => /* @__PURE__ */ jsxs("div", { className: "p-4 bg-slate-50 rounded-xl border border-slate-100 relative group", children: [
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        onClick: () => removeCustomSection(section.id),
                        className: "absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-md transition-all opacity-0 group-hover:opacity-100",
                        children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
                      }
                    ),
                    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-4", children: [
                      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Section Title" }),
                        /* @__PURE__ */ jsx(
                          "input",
                          {
                            type: "text",
                            value: section.title,
                            onChange: (e) => updateCustomSection(section.id, "title", e.target.value),
                            placeholder: "e.g. Projects",
                            className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                          }
                        )
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Icon" }),
                        /* @__PURE__ */ jsx(
                          "select",
                          {
                            value: section.icon,
                            onChange: (e) => updateCustomSection(section.id, "icon", e.target.value),
                            className: "w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 transition-all",
                            children: ["Award", "Languages", "Heart", "Target", "Trophy", "Briefcase", "GraduationCap", "FileText", "Sparkles", "Wand2", "Layout", "Type", "Settings", "ImageIcon"].map((icon) => /* @__PURE__ */ jsx("option", { value: icon, children: icon }, icon))
                          }
                        )
                      ] }),
                      /* @__PURE__ */ jsx("div", { className: "flex items-end pb-1.5", children: /* @__PURE__ */ jsx("div", { className: "w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-indigo-600", children: renderIcon(section.icon) }) })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                      /* @__PURE__ */ jsx("label", { className: "text-[10px] uppercase font-bold text-slate-400", children: "Content" }),
                      /* @__PURE__ */ jsx(
                        "textarea",
                        {
                          value: section.content,
                          onChange: (e) => updateCustomSection(section.id, "content", e.target.value),
                          placeholder: "Add details about this section...",
                          className: "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 outline-none focus:border-indigo-500 transition-all min-h-[100px]"
                        }
                      )
                    ] })
                  ] }, section.id)),
                  editableData.customSections.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-8 border-2 border-dashed border-slate-100 rounded-xl", children: /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-400", children: "No custom sections added yet." }) })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx(
                Button,
                {
                  onClick: handleRefineSubmit,
                  className: "bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8",
                  children: "Continue to preview"
                }
              ) })
            ] })
          ]
        },
        "extracted"
      ),
      step === "refining" && /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          className: "bg-white border border-gray-200 rounded-3xl p-12 shadow-xl text-center space-y-8",
          children: [
            /* @__PURE__ */ jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsx(
              motion.div,
              {
                animate: { rotate: 360 },
                transition: { duration: 2, repeat: Infinity, ease: "linear" },
                className: "w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600",
                children: /* @__PURE__ */ jsx(Sparkles, { size: 40 })
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold text-slate-900", children: activeFlow === "update" ? "Transferring to Latest Education..." : "Refining Content..." }),
              /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-2", children: activeFlow === "update" ? "Integrating IELTS, PTE and latest academic background." : "Applying high-impact verbs and academic alignment." })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "max-w-md mx-auto space-y-2", children: [
              /* @__PURE__ */ jsx("div", { className: "h-2 bg-gray-100 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx(
                motion.div,
                {
                  className: "h-full bg-indigo-600",
                  initial: { width: 0 },
                  animate: { width: `${progress}%` }
                }
              ) }),
              /* @__PURE__ */ jsxs("p", { className: "text-xs font-bold text-indigo-600", children: [
                progress,
                "% Complete"
              ] })
            ] }),
            activeFlow === "update" && progress > 50 && /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                className: "flex justify-center gap-4",
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-100", children: [
                    /* @__PURE__ */ jsx(CheckCircle, { size: 14 }),
                    " IELTS 7.5 Added"
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-100", children: [
                    /* @__PURE__ */ jsx(CheckCircle, { size: 14 }),
                    " PTE 82 Added"
                  ] })
                ]
              }
            )
          ]
        },
        "refining"
      ),
      step === "preview" && /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, scale: 0.9 },
          animate: { opacity: 1, scale: 1 },
          className: "space-y-8",
          children: [
            /* @__PURE__ */ jsxs("div", { className: "bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col gap-5", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-4", children: [
                /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(CheckCircle, { size: 24 }) }),
                /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx("h3", { className: "font-bold text-emerald-900", children: "Resume Ready!" }),
                  /* @__PURE__ */ jsx("p", { className: "text-sm text-emerald-700 mt-1", children: "Your AI-optimized CV is ready for download." })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:flex-wrap gap-3 w-full items-end sm:items-center sm:justify-end", children: [
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    variant: "outline",
                    disabled: isFinalUploading || isOpeningPdfTab,
                    onClick: handleOpenCvInNewTab,
                    className: "w-auto bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                    children: [
                      isOpeningPdfTab ? /* @__PURE__ */ jsx(Loader2, { size: 16, className: "mr-2 animate-spin" }) : /* @__PURE__ */ jsx(ExternalLink, { size: 16, className: "mr-2" }),
                      " ",
                      isOpeningPdfTab ? "Opening…" : "Open in new tab"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    disabled: isFinalUploading || isOpeningPdfTab,
                    onClick: handleFinalUpload,
                    className: "w-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-100 border-none px-6 disabled:opacity-60",
                    children: [
                      isFinalUploading ? /* @__PURE__ */ jsx(Loader2, { size: 16, className: "mr-2 animate-spin" }) : /* @__PURE__ */ jsx(Upload, { size: 16, className: "mr-2" }),
                      isFinalUploading ? "Uploading…" : " Update & Upload CV to System"
                    ]
                  }
                )
              ] }),
              finalUploadError ? /* @__PURE__ */ jsx("p", { className: "text-sm text-rose-600 text-right", children: finalUploadError }) : null
            ] }),
            /* @__PURE__ */ jsxs("div", { ref: cvPdfCaptureRef, className: "bg-white border border-gray-200 rounded-3xl shadow-2xl overflow-hidden max-w-4xl mx-auto", children: [
              /* @__PURE__ */ jsxs("div", { className: "h-12 bg-slate-900 flex items-center justify-between px-6", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5", children: [
                  /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded-full bg-rose-500" }),
                  /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded-full bg-amber-500" }),
                  /* @__PURE__ */ jsx("div", { className: "w-3 h-3 rounded-full bg-emerald-500" })
                ] }),
                /* @__PURE__ */ jsx("span", { className: "text-[10px] text-slate-400 font-mono uppercase tracking-widest", children: `${COMPANY_AI_BRAND} CV Preview` }),
                /* @__PURE__ */ jsx("div", { className: "w-12" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "p-12 bg-white min-h-[800px]", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start border-b-2 border-slate-900 pb-8 mb-8", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex gap-6 items-start", children: [
                    editableData.profilePicture && /* @__PURE__ */ jsx("div", { className: "w-24 h-24 rounded-2xl overflow-hidden border-2 border-slate-900 flex-shrink-0", children: /* @__PURE__ */ jsx("img", { src: editableData.profilePicture, alt: "Profile", className: "w-full h-full object-cover" }) }),
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-black text-slate-900 uppercase tracking-tighter", children: editableData.name }),
                      /* @__PURE__ */ jsx("p", { className: "text-indigo-600 font-bold mt-1", children: editableData.role })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "text-right text-xs text-slate-500 space-y-1", children: [
                    /* @__PURE__ */ jsx("p", { children: editableData.email }),
                    /* @__PURE__ */ jsx("p", { children: editableData.phone }),
                    /* @__PURE__ */ jsx("p", { children: "Colombo, Sri Lanka" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 gap-8", children: [
                  /* @__PURE__ */ jsxs("div", { className: "col-span-4 space-y-8 border-r border-slate-100 pr-8", children: [
                    /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Contact" }),
                      /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-[11px] text-slate-600 font-medium", children: [
                        /* @__PURE__ */ jsxs("p", { className: "flex items-center gap-2", children: [
                          /* @__PURE__ */ jsx(Mail, { size: 12, className: "text-indigo-400" }),
                          " ",
                          editableData.email
                        ] }),
                        /* @__PURE__ */ jsxs("p", { className: "flex items-center gap-2", children: [
                          /* @__PURE__ */ jsx(Phone, { size: 12, className: "text-indigo-400" }),
                          " ",
                          editableData.phone
                        ] }),
                        /* @__PURE__ */ jsxs("p", { className: "flex items-center gap-2", children: [
                          /* @__PURE__ */ jsx(MapPin, { size: 12, className: "text-indigo-400" }),
                          " Colombo, Sri Lanka"
                        ] })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Skills" }),
                      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: ["AI Product Design", "GTM Strategy", "B2B Growth", "UI/UX", "SaaS", "Framer", "Product Management"].map((skill) => /* @__PURE__ */ jsx("span", { className: "text-[9px] font-bold bg-slate-50 text-slate-700 px-2 py-1 rounded border border-slate-100 uppercase", children: skill }, skill)) })
                    ] }),
                    /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Test Scores" }),
                      /* @__PURE__ */ jsx("div", { className: "space-y-3", children: editableData.testScores.map((score, i) => /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 p-3 rounded-xl border border-slate-100", children: [
                        /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-[10px] font-bold mb-1", children: [
                          /* @__PURE__ */ jsx("span", { children: score.name }),
                          /* @__PURE__ */ jsxs("span", { className: "text-indigo-600", children: [
                            score.score,
                            " Overall"
                          ] })
                        ] }),
                        /* @__PURE__ */ jsx("div", { className: "w-full bg-slate-200 h-1 rounded-full overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "bg-indigo-500 h-full", style: { width: `${Math.min(100, parseFloat(score.score) / 9 * 100)}%` } }) })
                      ] }, i)) })
                    ] }),
                    /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsx("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4", children: "Languages" }),
                      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                        /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-[10px] font-bold", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "English" }),
                          /* @__PURE__ */ jsx("span", { className: "text-indigo-600", children: "Native" })
                        ] }),
                        /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-[10px] font-bold", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "Sinhala" }),
                          /* @__PURE__ */ jsx("span", { className: "text-indigo-600", children: "Native" })
                        ] })
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "col-span-8 space-y-10", children: [
                    /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsxs("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2", children: [
                        /* @__PURE__ */ jsx("span", { className: "w-6 h-[1px] bg-slate-900" }),
                        " Professional Experience"
                      ] }),
                      /* @__PURE__ */ jsx("div", { className: "space-y-8", children: editableData.experience.map((exp, i) => /* @__PURE__ */ jsxs("div", { className: "relative pl-6 border-l border-slate-100", children: [
                        /* @__PURE__ */ jsx("div", { className: "absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-600" }),
                        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-baseline mb-1", children: [
                          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-base", children: exp.title }),
                          /* @__PURE__ */ jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-wider", children: exp.period })
                        ] }),
                        /* @__PURE__ */ jsx("p", { className: "text-sm text-indigo-600 font-bold mb-3", children: exp.company }),
                        /* @__PURE__ */ jsxs("ul", { className: "space-y-2", children: [
                          /* @__PURE__ */ jsxs("li", { className: "text-xs text-slate-600 leading-relaxed flex gap-2", children: [
                            /* @__PURE__ */ jsx("span", { className: "text-indigo-400 mt-1.5 w-1 h-1 rounded-full bg-indigo-400 shrink-0" }),
                            "Spearheaded GTM strategies resulting in 40% market share growth within the first year."
                          ] }),
                          /* @__PURE__ */ jsxs("li", { className: "text-xs text-slate-600 leading-relaxed flex gap-2", children: [
                            /* @__PURE__ */ jsx("span", { className: "text-indigo-400 mt-1.5 w-1 h-1 rounded-full bg-indigo-400 shrink-0" }),
                            "Orchestrated cross-functional teams to deliver AI-driven B2B solutions for global clients."
                          ] })
                        ] })
                      ] }, i)) })
                    ] }),
                    /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsxs("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2", children: [
                        /* @__PURE__ */ jsx("span", { className: "w-6 h-[1px] bg-slate-900" }),
                        " Education"
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-6", children: [
                        activeFlow === "update" && /* @__PURE__ */ jsxs(
                          motion.div,
                          {
                            initial: { opacity: 0, x: -10 },
                            animate: { opacity: 1, x: 0 },
                            className: "p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl relative overflow-hidden",
                            children: [
                              /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 p-2", children: /* @__PURE__ */ jsx("span", { className: "text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase", children: "New" }) }),
                              /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: "Master of Business Administration (MBA)" }),
                              /* @__PURE__ */ jsx("p", { className: "text-xs text-indigo-600 font-bold", children: "In Progress - 2026" }),
                              /* @__PURE__ */ jsx("p", { className: "text-[10px] text-slate-500 mt-1 italic", children: "Specializing in AI Strategy & Digital Transformation" })
                            ]
                          }
                        ),
                        editableData.education.map((edu, i) => /* @__PURE__ */ jsxs("div", { className: "pl-6 border-l border-slate-100", children: [
                          /* @__PURE__ */ jsx("h3", { className: "font-bold text-slate-900 text-sm", children: edu.degree }),
                          /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 font-medium", children: edu.school })
                        ] }, i))
                      ] })
                    ] }),
                    editableData.customSections.map((section) => /* @__PURE__ */ jsxs("section", { children: [
                      /* @__PURE__ */ jsxs("h2", { className: "text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2", children: [
                        /* @__PURE__ */ jsx("span", { className: "w-6 h-[1px] bg-slate-900" }),
                        " ",
                        section.title
                      ] }),
                      /* @__PURE__ */ jsx("div", { className: "pl-6 border-l border-slate-100", children: /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-600 leading-relaxed whitespace-pre-wrap", children: section.content }) })
                    ] }, section.id))
                  ] })
                ] })
              ] })
            ] })
          ]
        },
        "preview"
      ),
      step === "success" && /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, scale: 0.8 },
          animate: { opacity: 1, scale: 1 },
          className: "flex flex-col items-center justify-center py-20 space-y-6",
          children: [
            /* @__PURE__ */ jsx("div", { className: "w-32 h-32 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-xl shadow-emerald-100", children: /* @__PURE__ */ jsx(
              motion.div,
              {
                initial: { scale: 0 },
                animate: { scale: 1 },
                transition: { type: "spring", damping: 12 },
                children: /* @__PURE__ */ jsx(CheckCircle, { size: 64 })
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ jsx("h2", { className: "text-4xl font-black text-slate-900 uppercase tracking-tighter", children: "Success!" }),
              /* @__PURE__ */ jsx("p", { className: "text-slate-500 mt-2", children: embedMode ? "The resume was saved to this student's profile." : "Your CV has been updated and saved to your profile." })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-400 animate-pulse", children: embedMode ? "Returning to the builder in 3 seconds..." : "Exiting in 3 seconds..." })
          ]
        },
        "success"
      )
    ] })
  ] });
};
export {
  AIResumeBuilder
};
