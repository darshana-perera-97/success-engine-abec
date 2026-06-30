import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
const MultiSelect = ({ options, value, onChange, placeholder = "Select...", label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const toggleOption = (optionValue) => {
    const newValue = value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue];
    onChange(newValue);
  };
  const removeOption = (e, optionValue) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };
  const filteredOptions = options.filter(
    (opt) => opt.label.toLowerCase().includes(searchTerm.toLowerCase()) || opt.subLabel?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", ref: containerRef, children: [
    label ? /* @__PURE__ */ jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wide", children: label }) : null,
    /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => setIsOpen(!isOpen),
          className: "w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-gray-200 rounded-md focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all cursor-text flex flex-wrap gap-1.5 items-center",
          children: [
            value.length === 0 && !isOpen && /* @__PURE__ */ jsx("span", { className: "text-slate-400 text-sm", children: placeholder }),
            value.map((val) => {
              const opt = options.find((o) => o.value === val);
              return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs border border-indigo-100", children: [
                opt?.label,
                /* @__PURE__ */ jsx("button", { onClick: (e) => removeOption(e, val), className: "ml-1 hover:text-indigo-900", children: /* @__PURE__ */ jsx(X, { size: 12 }) })
              ] }, val);
            }),
            /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-[60px]", children: /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "w-full bg-transparent border-none p-0 text-sm focus:ring-0 text-slate-700 placeholder:text-slate-400",
                placeholder: value.length === 0 ? "" : "",
                value: searchTerm,
                onChange: (e) => {
                  setSearchTerm(e.target.value);
                  setIsOpen(true);
                },
                onFocus: () => setIsOpen(true)
              }
            ) }),
            /* @__PURE__ */ jsx("div", { className: "absolute right-2 top-2.5 text-slate-400 pointer-events-none", children: /* @__PURE__ */ jsx(ChevronsUpDown, { size: 14 }) })
          ]
        }
      ),
      isOpen && /* @__PURE__ */ jsx("div", { className: "absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-md shadow-lg max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100", children: filteredOptions.length === 0 ? /* @__PURE__ */ jsx("div", { className: "p-3 text-sm text-slate-400 text-center", children: "No results found." }) : /* @__PURE__ */ jsx("div", { className: "py-1", children: filteredOptions.map((opt) => /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => toggleOption(opt.value),
          className: `px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex items-center justify-between ${value.includes(opt.value) ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`,
          children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: "font-medium", children: opt.label }),
              opt.subLabel && /* @__PURE__ */ jsx("div", { className: "text-xs opacity-70", children: opt.subLabel })
            ] }),
            value.includes(opt.value) && /* @__PURE__ */ jsx(Check, { size: 14, className: "text-indigo-600" })
          ]
        },
        opt.value
      )) }) })
    ] })
  ] });
};
export {
  MultiSelect
};
