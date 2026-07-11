export function text(value) {
  return {
    nodeType: 3,
    nodeValue: String(value),
    textContent: String(value),
  };
}

export function element(tagName, attributes = {}, children = []) {
  const node = {
    nodeType: 1,
    tagName: String(tagName).toUpperCase(),
    childNodes: children,
    children: children.filter((child) => child.nodeType === 1),
    getAttribute(name) {
      return Object.hasOwn(attributes, name) ? String(attributes[name]) : null;
    },
    hasAttribute(name) {
      return Object.hasOwn(attributes, name);
    },
    matches(selector) {
      if (selector === "input[type=checkbox]") {
        return this.tagName === "INPUT" && this.getAttribute("type") === "checkbox";
      }
      return false;
    },
    querySelector(selector) {
      return find(this, (candidate) => candidate.matches?.(selector)) ?? null;
    },
  };
  Object.defineProperty(node, "textContent", {
    get() {
      return children.map((child) => child.textContent ?? "").join("");
    },
  });
  return node;
}

function find(node, predicate) {
  for (const child of node.childNodes ?? []) {
    if (predicate(child)) return child;
    const nested = find(child, predicate);
    if (nested) return nested;
  }
  return null;
}
