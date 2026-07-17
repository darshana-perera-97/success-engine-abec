import { Fragment, createElement } from "react";

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/gi;
const TRAILING_PUNCT_REGEX = /[.,!?;:)\]}>]+$/;

function splitUrlAndTrailingPunctuation(rawUrl) {
  const value = String(rawUrl || "");
  const trailingMatch = value.match(TRAILING_PUNCT_REGEX);
  const trailing = trailingMatch ? trailingMatch[0] : "";
  const url = trailing ? value.slice(0, -trailing.length) : value;
  const href = /^www\./i.test(url) ? `https://${url}` : url;
  return { href, url, trailing };
}

function wrapNodes(nodes) {
  if (nodes.length === 0) return null;
  if (nodes.length === 1 && typeof nodes[0] === "string") return nodes[0];
  return createElement(Fragment, null, ...nodes);
}

export function normalizeChatMessageText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n");
}

export function splitChatMessageLines(text) {
  return normalizeChatMessageText(text).split("\n");
}

export function linkifyText(text, linkClassName = "text-indigo-600 underline hover:text-indigo-800 break-all") {
  const value = String(text ?? "");
  if (!value) return null;

  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  const matches = [...value.matchAll(regex)];
  if (matches.length === 0) return value;

  const nodes = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(value.slice(lastIndex, start));
    }

    const { href, url, trailing } = splitUrlAndTrailingPunctuation(match[0]);
    nodes.push(
      createElement(
        "a",
        {
          key: `link-${index}-${start}`,
          href,
          target: "_blank",
          rel: "noreferrer noopener",
          className: linkClassName,
          onClick: (event) => event.stopPropagation()
        },
        url
      )
    );
    if (trailing) nodes.push(trailing);
    lastIndex = start + match[0].length;
  });

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return wrapNodes(nodes);
}

export function renderChatMessageText(text, linkClassName = "text-indigo-600 underline hover:text-indigo-800 break-all") {
  const lines = splitChatMessageLines(text);
  if (lines.length === 0) return null;
  if (lines.length === 1) return linkifyText(lines[0], linkClassName);

  const nodes = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push(createElement("br", { key: `chat-br-${index}` }));
    }
    const linked = linkifyText(line, linkClassName);
    if (linked == null || linked === "") return;
    if (typeof linked === "string") {
      nodes.push(linked);
      return;
    }
    nodes.push(createElement(Fragment, { key: `chat-line-${index}` }, linked));
  });

  return wrapNodes(nodes);
}
