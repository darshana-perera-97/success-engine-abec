import { jsx, jsxs } from "react/jsx-runtime";
import { cn } from "../utils";
const Button = ({
  children,
  variant = "primary",
  size = "md",
  isLoading,
  className = "",
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center font-semibold tracking-tight transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed rounded-md";
  const variants = {
    primary: "bg-nexgenai-navy text-white hover:bg-slate-800 focus-visible:ring-slate-900 shadow-sm",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border border-gray-200 shadow-sm focus-visible:ring-slate-300",
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
    outline: "bg-transparent text-slate-700 hover:bg-slate-100 border border-slate-300 focus-visible:ring-slate-400"
  };
  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-6 py-3"
  };
  return /* @__PURE__ */ jsxs(
    "button",
    {
      className: cn(baseStyles, variants[variant], sizes[size], className),
      disabled: isLoading || props.disabled,
      ...props,
      children: [
        isLoading ? /* @__PURE__ */ jsxs("svg", { className: "animate-spin -ml-1 mr-3 h-4 w-4 text-current", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [
          /* @__PURE__ */ jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
          /* @__PURE__ */ jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
        ] }) : null,
        children
      ]
    }
  );
};
export {
  Button
};
