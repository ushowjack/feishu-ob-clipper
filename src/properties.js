import { escapeYamlString } from "./path-utils.js";

export const PROPERTY_TYPES = ["text", "list", "date", "boolean", "number"];
export const PROPERTY_SOURCES = ["none", "title", "url", "createdDate"];

const DEFAULT_TEMPLATE = [
  ["title", "text", "title", ""],
  ["source", "text", "url", ""],
  ["author", "list", "none", []],
  ["published", "date", "none", ""],
  ["created", "date", "createdDate", ""],
  ["description", "text", "none", ""],
  ["tags", "list", "none", ["clippings"]],
];

export function createDefaultTemplate() {
  return DEFAULT_TEMPLATE.map(([key, type, source, defaultValue], index) => ({
    id: `default-${index + 1}`,
    key,
    label: key,
    type,
    source,
    defaultValue: cloneValue(defaultValue),
    enabled: true,
  }));
}

export function instantiateProperties(template, context = {}) {
  return cloneProperties(template)
    .filter((field) => field.enabled !== false)
    .map((field) => ({
      id: field.id,
      key: String(field.key ?? ""),
      label: String(field.label || field.key || ""),
      type: normalizeType(field.type),
      value: cloneValue(sourceValue(field, context)),
    }));
}

export function cloneProperties(properties) {
  return (properties ?? []).map((field) => ({
    ...field,
    defaultValue: cloneValue(field.defaultValue),
    value: cloneValue(field.value),
  }));
}

export function coercePropertyValue(type, value) {
  if (!PROPERTY_TYPES.includes(type)) throw new Error(`不支持的属性类型：${type}`);
  if (type === "text") return String(value ?? "");
  if (type === "list") {
    const values = Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/);
    return values.map((item) => String(item).trim()).filter(Boolean);
  }
  if (type === "date") {
    const date = String(value ?? "").trim();
    if (!date) return "";
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parsed = match ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error("日期必须是有效的 YYYY-MM-DD");
    }
    return date;
  }
  if (type === "boolean") {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error("布尔值只能是 true 或 false");
  }
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("请输入有效数字");
  return number;
}

export function validateProperties(properties) {
  const normalizedKeys = (properties ?? []).map((field) => String(field.key ?? "").trim());
  const counts = new Map();
  for (const key of normalizedKeys) {
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (properties ?? []).map((field, index) => {
    const key = normalizedKeys[index];
    if (!key) return propertyError(field, key, "empty-key", "属性名不能为空");
    if (/\p{Cc}/u.test(key)) return propertyError(field, key, "control-character", "属性名不能包含控制字符");
    if ((counts.get(key) ?? 0) > 1) return propertyError(field, key, "duplicate-key", "属性名不能重复");
    if (!PROPERTY_TYPES.includes(field.type)) return propertyError(field, key, "invalid-type", "属性类型无效");
    try {
      coercePropertyValue(field.type, field.value);
    } catch (error) {
      return propertyError(field, key, "invalid-value", error.message);
    }
    return null;
  }).filter(Boolean);
}

export function serializeFrontmatter(properties) {
  const errors = validateProperties(properties);
  if (errors.length) throw new Error(errors[0].message);

  const lines = ["---"];
  for (const field of properties) {
    const key = serializeYamlKey(String(field.key).trim());
    const value = coercePropertyValue(field.type, field.value);
    if (field.type === "list") {
      lines.push(value.length ? `${key}:` : `${key}: []`);
      value.forEach((item) => lines.push(`  - ${escapeYamlString(item)}`));
    } else if (field.type === "boolean" || (field.type === "number" && value !== "")) {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${escapeYamlString(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export function emptyValueForType(type) {
  if (type === "list") return [];
  if (type === "boolean") return false;
  return "";
}

function sourceValue(field, context) {
  const automatic = {
    title: context.title,
    url: context.url,
    createdDate: context.createdDate,
  }[field.source];
  const value = automatic === undefined || automatic === "" ? field.defaultValue : automatic;
  return coercePropertyValue(normalizeType(field.type), value ?? emptyValueForType(normalizeType(field.type)));
}

function normalizeType(type) {
  return PROPERTY_TYPES.includes(type) ? type : "text";
}

function serializeYamlKey(key) {
  return /^[\p{L}\p{N}_-]+$/u.test(key) ? key : escapeYamlString(key);
}

function propertyError(field, key, code, message) {
  return { id: field.id, key, code, message };
}

function cloneValue(value) {
  return Array.isArray(value) ? [...value] : value;
}
