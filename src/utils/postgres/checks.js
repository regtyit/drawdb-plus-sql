/**
 * CHECK constraints in drawDB are stored as bare expressions on fields, e.g.
 * `price >= 0`. Users sometimes paste the complete clause (`CHECK (price >= 0)`),
 * so the wrapper is stripped before any SQL is generated.
 */
export function stripCheckWrapper(value) {
  let expression = String(value ?? "").trim();
  const match = /^CHECK\s*\(([\s\S]*)\)$/i.exec(expression);
  if (match) expression = match[1].trim();
  return expression;
}

function wrapsWholeExpression(value) {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) {
        if (value[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0 && index !== value.length - 1) return false;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

const SIMPLE_IDENTIFIER = /^[a-z_][a-z0-9_$]*$/;

/**
 * `"price"` and `price` name the same column in PostgreSQL, so quoted simple
 * identifiers are unquoted for comparison. String literals are left alone.
 */
function unquoteSimpleIdentifiers(value) {
  let result = "";
  let index = 0;
  let inString = false;
  while (index < value.length) {
    const char = value[index];
    if (inString) {
      result += char;
      if (char === "'") {
        if (value[index + 1] === "'") {
          result += value[index + 1];
          index += 2;
          continue;
        }
        inString = false;
      }
      index += 1;
      continue;
    }
    if (char === "'") {
      inString = true;
      result += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      let end = index + 1;
      let name = "";
      while (end < value.length) {
        if (value[end] === '"') {
          if (value[end + 1] === '"') {
            name += '"';
            end += 2;
            continue;
          }
          break;
        }
        name += value[end];
        end += 1;
      }
      if (end < value.length && SIMPLE_IDENTIFIER.test(name)) {
        result += name;
        index = end + 1;
        continue;
      }
      result += value.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

/**
 * Canonical form used to compare a diagram check with the one PostgreSQL
 * reports (`pg_get_expr` wraps expressions in extra parentheses).
 */
export function normalizeCheckExpression(value) {
  let expression = stripCheckWrapper(value).replace(/\s+/g, " ").trim();
  expression = unquoteSimpleIdentifiers(expression);
  while (wrapsWholeExpression(expression)) {
    expression = expression.slice(1, -1).trim();
  }
  return expression;
}
