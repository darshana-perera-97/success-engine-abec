const EMPLOYEES = [
  { "id": "EMP001", "name": "Sandaruwan", "role": "Executive Director", "branch": "Colombo HQ", "email": "sandaruwan@abecpremier.com", avatar: "/CEO.png" },
  { "id": "EMP002", "name": "Senari Marias", "role": "Assistant Team Lead", "branch": "Colombo HQ", "email": "senari@abecpremier.com", "specialty": "UK", availability: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }, avatar: "/1COUN.jpg" },
  { "id": "EMP003", "name": "Samanalee Perera", "role": "Senior Student Counsellor", "branch": "Colombo HQ", "email": "samanalee@abecpremier.com", "specialty": "Canada", availability: { days: [1, 3, 5], startHour: 10, endHour: 18 }, avatar: "/2COUN.jpg" },
  { "id": "EMP004", "name": "Devinda K.", "role": "Manager", "branch": "Kandy", "email": "devinda@abecpremier.com", avatar: "/4COUN.jpg" },
  { "id": "EMP005", "name": "Shone Vandort", "role": "Team Lead", "branch": "Kandy", "email": "shone@abecpremier.com", "specialty": "Australia", avatar: "/Shone-Vandort.jpg" },
  { "id": "EMP006", "name": "Nimali Silva", "role": "Finance Officer", "branch": "Colombo HQ", "email": "finance@abecpremier.com", avatar: "/5COUN.jpg" },
  { "id": "EMP007", "name": "Sanuki Abeyrathna", "role": "Senior Student Counsellor", "branch": "Galle", "email": "sanuki@abecpremier.com", "specialty": "New Zealand", avatar: "/7COUN.jpg" },
  { "id": "EMP008", "name": "Nethmini Julanjala", "role": "Senior Student Counsellor", "branch": "Jaffna", "email": "nethmini@abecpremier.com", "specialty": "UK", avatar: "/8.jpg" },
  { "id": "EMP009", "name": "Ravi Kumar", "role": "Manager", "branch": "Jaffna", "email": "ravi@abecpremier.com", avatar: "/CEOImage.png" },
  { "id": "EMP010", "name": "Tina Fey", "role": "Document Controller", "branch": "Colombo HQ", "email": "docs@abecpremier.com", avatar: "https://picsum.photos/seed/tina/200" },
  { "id": "EMP011", "name": "Shavini Silva", "role": "Senior Student Counsellor", "branch": "Kandy", "email": "shavini@abecpremier.com", "specialty": "Canada", avatar: "https://picsum.photos/seed/shavini/200" },
  { "id": "EMP012", "name": "Samanthie D.", "role": "Visa Officer", "branch": "Colombo HQ", "email": "visa@abecpremier.com", avatar: "https://picsum.photos/seed/samanthie/200" }
];
const STUDENTS = [
  { "id": "STU1001", "name": "Aruni Perera", "country": "New Zealand", "branch": "Colombo HQ", "status": "Counseling", "counselor": "EMP002", "gpa": "3.78", "ielts": "6.0", "notes": "High potential", "lastEducationDate": "2026-01-01", "budget": "25000", "priority": "High", "email": "aruni@gmail.com", "phone": "+94 77 123 4567", "documents": [], avatar: "https://picsum.photos/seed/STU1001/200" },
  { "id": "STU1002", "name": "Malinga Fernando", "country": "Canada", "branch": "Kandy", "status": "Documentation", "counselor": "EMP003", "gpa": "3.96", "ielts": "7.0", "notes": "Docs 80% complete", "lastEducationDate": "2022-05-15", "budget": "35000", "priority": "Medium", "email": "malinga@gmail.com", "phone": "+94 77 234 5678", "documents": [
    { id: "1", name: "Passport_Front.pdf", type: "Passport", status: "Pending", uploadedAt: "2026-02-24", tier: "Global", phase: 1, url: "#" }
  ], avatar: "https://picsum.photos/seed/STU1002/200" },
  { "id": "STU1003", "name": "Thilina De Silva", "country": "Canada", "branch": "Colombo HQ", "status": "Visa Pilot", "counselor": "EMP003", "gpa": "3.19", "ielts": "7.0", "notes": "Waiting for embassy", "lastEducationDate": "2021-12-01", "budget": "30000", "priority": "High", "email": "thilina@gmail.com", "visa": { "Offer": "Completed", "GIC": "Completed", "Biometrics": "In Progress", "Visa": "Pending" }, avatar: "https://picsum.photos/seed/STU1003/200" },
  { "id": "STU1004", "name": "Kasun Silva", "country": "Australia", "branch": "Galle", "status": "New Inquiry", "counselor": "EMP005", "gpa": "2.8", "ielts": "Pending", "notes": "Checking eligibility", "lastEducationDate": "2020-01-01", "budget": "20000", "priority": "Low", "email": "kasun@yahoo.com", avatar: "https://picsum.photos/seed/STU1004/200" },
  { "id": "STU1005", "name": "Dinuki Wickrama", "country": "Australia", "branch": "Kandy", "status": "Offer Received", "counselor": "EMP005", "gpa": "3.48", "ielts": "6.5", "notes": "Waiting for financials", "lastEducationDate": "2026-02-01", "budget": "40000", "priority": "High", "documents": [
    { id: "2", name: "OfferLetter_Deakin.pdf", type: "OfferLetter", status: "Verified", uploadedAt: "2026-02-20", tier: "University", phase: 3, url: "#" }
  ], avatar: "https://picsum.photos/seed/STU1005/200" },
  { "id": "STU1006", "name": "Rahul Verma", "country": "UK", "branch": "Jaffna", "status": "Visa Pilot", "counselor": "EMP002", "gpa": "3.5", "ielts": "6.5", "notes": "Flight booked", "lastEducationDate": "2022-08-01", "budget": "28000", "priority": "Medium", "visa": { "CAS": "Completed", "TB Test": "Completed", "Visa": "Completed" }, avatar: "https://picsum.photos/seed/STU1006/200" },
  { "id": "STU1007", "name": "Sanjaya Ekanayake", "country": "UK", "branch": "Colombo HQ", "status": "Uni Application", "counselor": "EMP002", "gpa": "3.2", "ielts": "6.0", "notes": "Urgent CAS", "lastEducationDate": "2022-01-01", "budget": "22000", "priority": "High", avatar: "https://picsum.photos/seed/STU1007/200" },
  { "id": "STU1008", "name": "Pooja Rani", "country": "Canada", "branch": "Jaffna", "status": "Counseling", "counselor": "EMP003", "gpa": "3.9", "ielts": "7.5", "notes": "Refused previously", "lastEducationDate": "2026-01-01", "budget": "32000", "priority": "High", avatar: "https://picsum.photos/seed/STU1008/200" },
  { "id": "STU1009", "name": "Ahmed Fazil", "country": "New Zealand", "branch": "Galle", "status": "New Inquiry", "counselor": "EMP007", "gpa": "3.0", "ielts": "Pending", "notes": "Looking for IT Masters", "lastEducationDate": "2019-01-01", "budget": "18000", "priority": "Low", avatar: "https://picsum.photos/seed/STU1009/200" },
  { "id": "STU1010", "name": "Shenali Dias", "country": "Australia", "branch": "Colombo HQ", "status": "Documentation", "counselor": "EMP005", "gpa": "3.6", "ielts": "7.0", "notes": "SOP needs revision", "lastEducationDate": "2026-02-01", "budget": "45000", "priority": "Medium", "documents": [
    { id: "3", name: "SOP_Draft1.pdf", type: "SOP", status: "Rejected", rejectionReason: "Needs more detail on future goals.", uploadedAt: "2026-02-22", tier: "Country", phase: 2, url: "#" }
  ], avatar: "https://picsum.photos/seed/STU1010/200" },
  { "id": "STU1011", "name": "Mark S.", "country": "UK", "branch": "Kandy", "status": "Uni Application", "counselor": "EMP008", "gpa": "2.9", "ielts": "6.0", "notes": "Deposit due", "lastEducationDate": "2022-06-01", "budget": "25000", "priority": "Medium", avatar: "https://picsum.photos/seed/STU1011/200" },
  { "id": "STU1012", "name": "Sarah L.", "country": "Canada", "branch": "Colombo HQ", "status": "Visa Pilot", "counselor": "EMP011", "gpa": "4.0", "ielts": "8.0", "notes": "Top tier student", "lastEducationDate": "2026-02-01", "budget": "50000", "priority": "High", avatar: "https://picsum.photos/seed/STU1012/200" },
  { "id": "STU1013", "name": "Davina G.", "country": "USA", "branch": "Colombo HQ", "status": "Counseling", "counselor": "EMP002", "gpa": "3.3", "ielts": "7.0", "notes": "Interested in MBA", "lastEducationDate": "2021-05-01", "budget": "60000", "priority": "Medium", avatar: "https://picsum.photos/seed/STU1013/200" },
  { "id": "STU1014", "name": "Heshani T.", "country": "Australia", "branch": "Galle", "status": "Visa Pilot", "counselor": "EMP005", "gpa": "3.7", "ielts": "7.0", "notes": "Commission Claimable", "lastEducationDate": "2026-01-01", "budget": "42000", "priority": "Low", avatar: "https://picsum.photos/seed/STU1014/200" },
  { "id": "STU1015", "name": "Nuwan P.", "country": "UK", "branch": "Jaffna", "status": "New Inquiry", "counselor": "EMP002", "gpa": "2.5", "ielts": "5.5", "notes": "Eligibility doubtful", "lastEducationDate": "2020-01-01", "budget": "15000", "priority": "Low", avatar: "https://picsum.photos/seed/STU1015/200" },
  { "id": "STU1016", "name": "Yara V.", "country": "Canada", "branch": "Kandy", "status": "Offer Received", "counselor": "EMP003", "gpa": "3.8", "ielts": "7.5", "notes": "LOA Received", "lastEducationDate": "2026-01-01", "budget": "30000", "priority": "High", avatar: "https://picsum.photos/seed/STU1016/200" },
  { "id": "STU1017", "name": "Krishan M.", "country": "New Zealand", "branch": "Galle", "status": "Counseling", "counselor": "EMP007", "gpa": "3.1", "ielts": "6.0", "notes": "Spouse visa inquiry", "lastEducationDate": "2018-01-01", "budget": "28000", "priority": "Medium", avatar: "https://picsum.photos/seed/STU1017/200" },
  { "id": "STU1018", "name": "Jude F.", "country": "Australia", "branch": "Colombo HQ", "status": "Documentation", "counselor": "EMP005", "gpa": "3.4", "ielts": "6.5", "notes": "GTE Form pending", "lastEducationDate": "2022-01-01", "budget": "35000", "priority": "Medium", avatar: "https://picsum.photos/seed/STU1018/200" },
  { "id": "STU1019", "name": "Raneesha K.", "country": "UK", "branch": "Colombo HQ", "status": "Visa Pilot", "counselor": "EMP008", "gpa": "3.5", "ielts": "6.5", "notes": "Priority service", "lastEducationDate": "2026-01-01", "budget": "30000", "priority": "High", "visa": { "CAS": "Completed", "TB Test": "In Progress", "Visa": "Pending" }, avatar: "https://picsum.photos/seed/STU1019/200" },
  { "id": "STU1020", "name": "Banuka H.", "country": "Canada", "branch": "Kandy", "status": "Counseling", "counselor": "EMP011", "gpa": "3.2", "ielts": "Pending", "notes": "Waiting for A/L", "lastEducationDate": "2026-01-01", "budget": "25000", "priority": "Low", avatar: "https://picsum.photos/seed/STU1020/200" },
  { "id": "STU1021", "name": "Lashan R.", "country": "USA", "branch": "Jaffna", "status": "Documentation", "counselor": "EMP002", "gpa": "3.6", "ielts": "7.0", "notes": "I-20 requested", "lastEducationDate": "2026-01-01", "budget": "55000", "priority": "High", avatar: "https://picsum.photos/seed/STU1021/200" },
  { "id": "STU1022", "name": "Mariam S.", "country": "Australia", "branch": "Colombo HQ", "status": "New Inquiry", "counselor": "EMP005", "gpa": "3.9", "ielts": "8.0", "notes": "Medical student", "lastEducationDate": "2026-01-01", "budget": "80000", "priority": "High", avatar: "https://picsum.photos/seed/STU1022/200" },
  { "id": "STU1023", "name": "Tehan W.", "country": "New Zealand", "branch": "Colombo HQ", "status": "Counseling", "counselor": "EMP007", "gpa": "2.8", "ielts": "5.5", "notes": "Bonafide issue", "lastEducationDate": "2022-01-01", "budget": "20000", "priority": "Low", avatar: "https://picsum.photos/seed/STU1023/200" },
  { "id": "STU1024", "name": "Oshada P.", "country": "UK", "branch": "Galle", "status": "Visa Pilot", "counselor": "EMP008", "gpa": "3.3", "ielts": "6.5", "notes": "Travel next month", "lastEducationDate": "2026-01-01", "budget": "25000", "priority": "Medium", avatar: "https://picsum.photos/seed/STU1024/200" },
  { "id": "STU1025", "name": "Zainab A.", "country": "Canada", "branch": "Jaffna", "status": "New Inquiry", "counselor": "EMP003", "gpa": "3.5", "ielts": "7.0", "notes": "Gap of 3 years", "lastEducationDate": "2020-01-01", "budget": "30000", "priority": "Medium", avatar: "https://picsum.photos/seed/STU1025/200" }
];
const TASKS = [
  { "id": "T001", "task": "Verify Passport Expiry", "assigned_to": ["EMP010"], "student_id": "STU1002", "priority": "High", "status": "Pending", "dueDate": "2026-02-25", tier: "Global", phase: 1, isBlocking: true, documentType: "Passport" },
  { "id": "T002", "task": "Call for IELTS Result", "assigned_to": ["EMP005"], "student_id": "STU1004", "priority": "Medium", "status": "Overdue", "dueDate": "2026-02-20", tier: "Global", phase: 1, isBlocking: false },
  { "id": "T003", "task": "Generate Commission Invoice", "assigned_to": ["EMP006"], "student_id": "STU1006", "priority": "High", "status": "Pending", "dueDate": "2026-02-26", tier: "University", phase: 3, isBlocking: false },
  { "id": "T004", "task": "Review SOP Draft", "assigned_to": ["EMP003", "EMP010"], "student_id": "STU1010", "priority": "High", "status": "In Progress", "dueDate": "2026-02-24", tier: "Country", phase: 2, isBlocking: true, documentType: "SOP" },
  { "id": "T005", "task": "Schedule Mock Interview", "assigned_to": ["EMP008"], "student_id": "STU1019", "priority": "Medium", "status": "Completed", "dueDate": "2026-02-22", tier: "University", phase: 3, isBlocking: false },
  // New Mock Tasks for Counselors
  { "id": "T006", "task": "Follow up on Offer Letter", "assigned_to": ["EMP002"], "student_id": "STU1001", "priority": "High", "status": "Pending", "dueDate": "2026-02-27", tier: "University", phase: 3, isBlocking: true },
  { "id": "T007", "task": "Check Financial Documents", "assigned_to": ["EMP002"], "student_id": "STU1007", "priority": "High", "status": "In Progress", "dueDate": "2026-02-28", tier: "Country", phase: 2, isBlocking: true },
  { "id": "T008", "task": "Visa Application Review", "assigned_to": ["EMP003"], "student_id": "STU1003", "priority": "High", "status": "Pending", "dueDate": "2026-02-28", tier: "Country", phase: 2, isBlocking: true },
  { "id": "T009", "task": "Initial Counseling Session", "assigned_to": ["EMP002"], "student_id": "STU1015", "priority": "Medium", "status": "Pending", "dueDate": "2026-02-28", tier: "Global", phase: 1, isBlocking: false },
  { "id": "T010", "task": "Collect Missing Transcripts", "assigned_to": ["EMP003"], "student_id": "STU1008", "priority": "Medium", "status": "Overdue", "dueDate": "2026-02-25", tier: "Global", phase: 1, isBlocking: true }
];
const UNIVERSITY_RULES = [
  { name: "Monash University", country: "Australia", minGPA: 3, minIELTS: 6.5, ranking: 42, requiredDocs: ["Reference Letter"] },
  { name: "Seneca College", country: "Canada", minGPA: 2.5, minIELTS: 6, ranking: 1500, requiredDocs: [] },
  { name: "University of Greenwich", country: "UK", minGPA: 2.5, minIELTS: 6, ranking: 800, requiredDocs: ["Reference Letter"] },
  { name: "University of Auckland", country: "New Zealand", minGPA: 3.2, minIELTS: 6.5, ranking: 85, requiredDocs: ["SOP", "Reference Letter"] },
  { name: "Humber College", country: "Canada", minGPA: 2.8, minIELTS: 6.5, ranking: 1600, requiredDocs: [] },
  { name: "Deakin University", country: "Australia", minGPA: 2.7, minIELTS: 6, ranking: 266, requiredDocs: ["SOP"] }
];
const UNIVERSITY_PROGRAMS = [
  { id: "UP001", university: "University of Greenwich", programName: "MSc Data Science", country: "UK", tuition: 18200, currency: "GBP", duration: "1 Year", intake: "Sept / Jan", minGPA: 2.5, minIELTS: 6, ranking: 800, tags: ["London Campus", "Placement Year"], logoColor: "bg-blue-900" },
  { id: "UP002", university: "Teesside University", programName: "MSc Data Science", country: "UK", tuition: 16500, currency: "GBP", duration: "1 Year", intake: "Sept / Jan", minGPA: 2.2, minIELTS: 6, ranking: 1e3, tags: ["Affordable", "Regional"], logoColor: "bg-rose-700" },
  { id: "UP003", university: "University of West London", programName: "MSc Data Science", country: "UK", tuition: 17800, currency: "GBP", duration: "1 Year", intake: "Sept / Feb", minGPA: 2.5, minIELTS: 6, ranking: 600, tags: ["Modern Facilities"], logoColor: "bg-gray-800" },
  { id: "UP004", university: "University of Manchester", programName: "MSc Data Science", country: "UK", tuition: 32e3, currency: "GBP", duration: "1 Year", intake: "Sept", minGPA: 3.5, minIELTS: 7, ranking: 50, tags: ["Russell Group", "Top Tier"], logoColor: "bg-purple-900" },
  { id: "UP005", university: "Monash University", programName: "Master of Data Science", country: "Australia", tuition: 48e3, currency: "AUD", duration: "2 Years", intake: "Feb / July", minGPA: 3, minIELTS: 6.5, ranking: 42, tags: ["Go8", "Post-Study Work"], logoColor: "bg-slate-900" },
  { id: "UP006", university: "Seneca College", programName: "Business Analytics", country: "Canada", tuition: 19e3, currency: "CAD", duration: "1 Year", intake: "Sept / Jan / May", minGPA: 2.5, minIELTS: 6.5, ranking: 1500, tags: ["PGWP Eligible", "Co-op"], logoColor: "bg-red-600" },
  { id: "UP007", university: "Humber College", programName: "Global Business Management", country: "Canada", tuition: 18500, currency: "CAD", duration: "2 Years", intake: "Sept / Jan", minGPA: 2.8, minIELTS: 6.5, ranking: 1600, tags: ["PGWP Eligible"], logoColor: "bg-blue-600" },
  { id: "UP008", university: "Arizona State University", programName: "MS Computer Science", country: "USA", tuition: 28e3, currency: "USD", duration: "2 Years", intake: "Aug / Jan", minGPA: 3.2, minIELTS: 6.5, ranking: 150, tags: ["STEM Designated", "Scholarships"], logoColor: "bg-amber-700" }
];
const INITIAL_ACTIVITIES = [
  { id: "1", user: "System", role: "Admin", action: "System Backup", target: "Daily Backup", timestamp: "10 mins ago", type: "system" },
  { id: "2", user: "Sarah Jenkins", role: "Counselor", action: "Approved", target: "Offer Letter - Aruni P.", timestamp: "2 hours ago", type: "approval" },
  { id: "3", user: "Malinga Fernando", role: "Student", action: "Uploaded", target: "Passport_Front.pdf", timestamp: "3 hours ago", type: "upload" }
];
const MOCK_MESSAGES = [
  { id: "m1", senderId: "EMP002", receiverId: "STU1001", content: "Hi Aruni, have you uploaded the financial documents yet?", timestamp: "2026-02-24T09:00:00", read: true, platform: "portal" },
  { id: "m2", senderId: "STU1001", receiverId: "EMP002", content: "Hi Sarah, yes I just uploaded the bank statements.", timestamp: "2026-02-24T09:05:00", read: true, platform: "whatsapp" },
  { id: "m3", senderId: "EMP002", receiverId: "STU1001", content: "Great! I will review them by this afternoon.", timestamp: "2026-02-24T09:06:00", read: true, platform: "portal" },
  { id: "m4", senderId: "STU1001", receiverId: "EMP002", content: "Also, do I need to notarize the affidavit?", timestamp: "2026-02-24T10:15:00", read: false, platform: "whatsapp" },
  { id: "m5", senderId: "EMP003", receiverId: "STU1002", content: "Malinga, your SOP needs a bit more work on the 'Why Canada' section.", timestamp: "2026-02-23T14:00:00", read: true, platform: "portal" },
  { id: "m6", senderId: "STU1002", receiverId: "EMP003", content: "Noted Mike. I will update and send it back tonight.", timestamp: "2026-02-23T14:10:00", read: true, platform: "whatsapp" }
];
const INVOICES = [
  { id: "INV-2026-001", studentId: "STU1001", amount: 25e3, currency: "LKR", description: "Registration Fee", issueDate: "2026-02-01", dueDate: "2026-02-15", status: "Paid", generatedReceiptUrl: "#" },
  { id: "INV-2026-002", studentId: "STU1001", amount: 15e4, currency: "LKR", description: "Visa Pilot Fee (Installment 1)", issueDate: "2026-02-20", dueDate: "2026-02-27", status: "Pending" },
  { id: "INV-2026-003", studentId: "STU1002", amount: 500, currency: "CAD", description: "University Application Fee (Seneca)", issueDate: "2026-02-05", dueDate: "2026-02-08", status: "Paid", generatedReceiptUrl: "#" },
  { id: "INV-2026-004", studentId: "STU1003", amount: 45e3, currency: "LKR", description: "Courier & Translation Charges", issueDate: "2026-02-25", dueDate: "2026-02-28", status: "Pending" }
];
const APPOINTMENTS = [
  { id: "APT001", counselorId: "EMP002", studentId: "STU1001", title: "Initial Consultation", date: "2026-02-28", time: "10:00", duration: 45, type: "Counseling", status: "Scheduled" },
  { id: "APT002", counselorId: "EMP002", studentId: "STU1007", title: "Visa Document Check", date: "2026-02-24", time: "14:00", duration: 30, type: "Visa Check", status: "Scheduled" },
  // Past date for "Review" testing
  { id: "APT003", counselorId: "EMP003", studentId: "STU1002", title: "Mock Interview", date: "2026-02-28", time: "11:00", duration: 60, type: "Mock Interview", status: "Scheduled" },
  // New Mock Appointments for Manager View
  { id: "APT004", counselorId: "EMP002", studentId: "STU1013", title: "MBA Strategy Session", date: "2026-02-28", time: "09:30", duration: 60, type: "Counseling", status: "Scheduled" },
  { id: "APT005", counselorId: "EMP003", studentId: "STU1016", title: "Pre-Departure Briefing", date: "2026-02-28", time: "14:00", duration: 45, type: "Counseling", status: "Scheduled" },
  { id: "APT006", counselorId: "EMP005", studentId: "STU1022", title: "Medical Student Inquiry", date: "2026-02-28", time: "10:00", duration: 30, type: "Counseling", status: "Scheduled" },
  { id: "APT007", counselorId: "EMP004", studentId: "STU1001", title: "Team Performance Review", date: "2026-02-28", time: "16:00", duration: 60, type: "Counseling", status: "Scheduled" }
  // Manager's own appointment
];
const COUNTRY_CHECKLISTS = {
  "Australia": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "High-resolution color scan (All pages)." },
        { docType: "National ID", description: "Front/Back + Certified Translation." },
        { docType: "Birth Certificate", description: "Original + Certified Translation." },
        { docType: "Academic", description: "A/L & O/L authenticated by MFA (e-DAS)." },
        { docType: "English", description: "IELTS/PTE Academic Result." },
        { docType: "Professional CV", description: "Chronological with no gaps." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Direct or Authorized Agent portal." },
        { docType: "Backlog Summary", description: "(Mandatory for PG/Master's)." },
        { docType: "References", description: "Two Academic Reference Letters." },
        { docType: "Draft GS", description: 'Preliminary "Genuine Student" statement.' }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer Letter Acceptance", description: "Offer Letter Acceptance." },
        { docType: "CoE", description: "Confirmation of Enrolment issued." },
        { docType: "Financials", description: "AUD 29,710 + Tuition (3-month history/Loan)." },
        { docType: "OSHC", description: "Health cover for full visa duration." },
        { docType: "HAP ID", description: "Medical examination generated." },
        { docType: "Final GS", description: "Finalized 2026 Genuine Student prompts." }
      ]
    }
  ],
  "Canada": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages (Travel History focused)." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "A/L & O/L Transcripts." },
        { docType: "English", description: "IELTS (6.0 min band) or PTE." },
        { docType: "WES Evaluation", description: "(If required for specific Master's)." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Predicted Grade Form", description: "(If currently in school)." },
        { docType: "References", description: "Employment/Academic letters." },
        { docType: "Portal Submission", description: "OUAC or Direct DLI Portal." },
        { docType: "Draft SOP", description: "Focus on program choice logic." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "LOA", description: "Letter of Acceptance from DLI." },
        { docType: "PAL", description: "Provincial Attestation Letter facilitated by Uni." },
        { docType: "GIC Receipt", description: "Proof of CAD 20,635 deposit." },
        { docType: "Tuition Receipt", description: "First-year fee payment." },
        { docType: "Final SOP", description: 'Focus on "Temporary Resident Intent."' }
      ]
    }
  ],
  "UK": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "Bio-data + all stamped pages." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "O/L & A/L Final Certificates." },
        { docType: "English", description: "SELT (IELTS for UKVI)." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "UCAS/Direct Portal Submission." },
        { docType: "Personal Statement", description: "(2026 Undergraduate 3-question format)." },
        { docType: "References", description: "1 for UG / 2 for PG." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "CAS", description: "Confirmation of Acceptance for Studies Reference." },
        { docType: "Financials", description: "\xA313,761 (London) / \xA310,539 (Outside) held for 28 days." },
        { docType: "IHS Payment", description: "Immigration Health Surcharge reference." },
        { docType: "TB Test", description: "Certificate from approved clinic." },
        { docType: "ATAS Certificate", description: "(If required for specific Science/Tech subjects)." }
      ]
    }
  ],
  "New Zealand": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages + 2-3 Photos." },
        { docType: "National ID & Birth Certificate", description: "National ID & Translated Birth Certificate." },
        { docType: "Academic", description: "A/L (3 'C' passes min) & O/L." },
        { docType: "English", description: "IELTS/PTE Official Result." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Portal Submission." },
        { docType: "References", description: "Academic/Employment." },
        { docType: "Work Experience Evidence", description: "(For PG pathways)." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer of Place", description: "From NZQA-approved provider." },
        { docType: "Tuition Receipt", description: "Payment for first year." },
        { docType: "Financials", description: "NZD 20,000 + 6-month source history." },
        { docType: "X-Ray Certificate", description: "(For stays > 6 months)." },
        { docType: "Final SOP", description: '"Genuine Intending Student" focus.' }
      ]
    }
  ],
  "Japan": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "All pages + Family Registry." },
        { docType: "Birth Certificate", description: "Original + Notarized Translation." },
        { docType: "Academic", description: "O/L & A/L Original + Translation." },
        { docType: "Language", description: "150-hour Japanese study cert or JLPT N5." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "University-specific Portal Submission (T-ADS/PEAK/G30)." },
        { docType: "Research Plan", description: "(Postgraduate only)." },
        { docType: "English", description: "TOEFL iBT preferred/accepted." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "COE", description: "Certificate of Eligibility issued." },
        { docType: "Financial Sponsor Docs", description: "3yr Tax Returns + Income Cert + Employment Letter." },
        { docType: "Final SOP", description: "Study logic in English/Japanese." }
      ]
    }
  ],
  "Singapore": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "Bio-data + all pages." },
        { docType: "Birth Certificate", description: "Notarized English translation." },
        { docType: "Academic", description: "O/L & A/L Certificates + Transcripts." },
        { docType: "English", description: "IELTS/TOEFL." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "SAT/ACT Scores", description: "(For NUS/NTU/SMU)." },
        { docType: "CCA/Leadership List", description: "Co-curricular records." },
        { docType: "MTL Exemption Request", description: "Mother Tongue Exemption Request." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "IPA", description: "In-Principle Approval via SOLAR system." },
        { docType: "SOLAR eForm 16", description: "Printed/Signed." },
        { docType: "Tuition Grant Decision", description: "MOE Bond commitment." },
        { docType: "Medical Report", description: "HIV/TB screening results." }
      ]
    }
  ],
  "Default": [
    {
      stage: "Documentation",
      items: [
        { docType: "Passport", description: "High-resolution color scan of bio-data page." },
        { docType: "National ID", description: "Front and back." },
        { docType: "Academic", description: "O/L and A/L Certificates." },
        { docType: "English", description: "IELTS/PTE Result." }
      ]
    },
    {
      stage: "Uni Application",
      items: [
        { docType: "Portal Submission", description: "Portal Submission." },
        { docType: "SOP", description: "Statement of Purpose." }
      ]
    },
    {
      stage: "Offer Received",
      items: [
        { docType: "Offer Letter", description: "Offer Letter Acceptance." },
        { docType: "Financials", description: "Bank Balance Certificate." }
      ]
    }
  ]
};
export {
  APPOINTMENTS,
  COUNTRY_CHECKLISTS,
  EMPLOYEES,
  INITIAL_ACTIVITIES,
  INVOICES,
  MOCK_MESSAGES,
  STUDENTS,
  TASKS,
  UNIVERSITY_PROGRAMS,
  UNIVERSITY_RULES
};
