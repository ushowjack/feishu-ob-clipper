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
    setAttribute(name, value) {
      attributes[name] = String(value);
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
    querySelectorAll(selector) {
      const accepted = selector.split(",").map((part) => part.trim());
      return findAll(this, (candidate) => accepted.some((part) => {
        if (part === "a[href]") return candidate.tagName === "A" && candidate.hasAttribute("href");
        if (part === "img") return candidate.tagName === "IMG";
        return false;
      }));
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

function findAll(node, predicate, matches = []) {
  for (const child of node.childNodes ?? []) {
    if (predicate(child)) matches.push(child);
    findAll(child, predicate, matches);
  }
  return matches;
}
