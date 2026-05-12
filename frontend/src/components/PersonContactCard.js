import { jsx, jsxs } from "react/jsx-runtime";
import { Mail, Phone } from "lucide-react";
import { DEFAULT_USER_AVATAR } from "../apiConfig";
export function PersonContactCard({
  name,
  role,
  badges = [],
  email,
  phone,
  avatar,
  avatarClassName = "h-14 w-14",
  emailSlot = null,
  phoneSlot = null
}) {
  const badgeLine = Array.isArray(badges) ? badges.filter(Boolean) : [];
  return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 mb-3", children: [
      /* @__PURE__ */ jsx("div", { className: `${avatarClassName} rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg border-2 border-white shadow-md overflow-hidden shrink-0`, children: avatar ? /* @__PURE__ */ jsx("img", { src: avatar, alt: name, className: "w-full h-full object-cover", referrerPolicy: "no-referrer", onError: (event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = DEFAULT_USER_AVATAR;
      } }) : name.charAt(0) }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        badgeLine.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1 mb-1", children: badgeLine.map((b) => /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800", children: b }, b)) }),
        /* @__PURE__ */ jsx("p", { className: "font-bold text-slate-900 truncate", children: name }),
        role && /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500 truncate", children: role })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-sm text-slate-600", children: [
      emailSlot || /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsx(Mail, { size: 14, className: "text-slate-400 shrink-0" }),
        /* @__PURE__ */ jsx("span", { className: "truncate", children: email })
      ] }),
      phoneSlot || /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsx(Phone, { size: 14, className: "text-slate-400 shrink-0" }),
        /* @__PURE__ */ jsx("span", { className: "truncate", children: phone })
      ] })
    ] })
  ] });
}
