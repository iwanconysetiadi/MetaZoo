/**
 * Safe mathematical expression engine for the Custom Function Lab.
 *
 * No eval / new Function. A hand-written tokenizer + precedence-climbing parser
 * produces an AST, which is compiled once into a plain closure. A whitelist of
 * variables, constants and functions is enforced, with hard limits on length,
 * depth and node count to protect the app from pathological input.
 */

export type EvalFn = (x1: number, x2: number) => number;

export class ExpressionError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

export interface ParsedExpression {
  source: string;
  evaluate: EvalFn;
  formatted: string;
}

// ---------------------------------------------------------------- limits
const MAX_LENGTH = 512;
const MAX_DEPTH = 64;
const MAX_NODES = 2000;

type TokenType = 'num' | 'id' | 'op' | 'lparen' | 'rparen' | 'comma' | 'end';
interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const VARIABLES = new Set(['x1', 'x2', 'x', 'y']);

type FnImpl = (...args: number[]) => number;
const FUNCTIONS: Record<string, { arity: number | 'variadic'; impl: FnImpl }> = {
  sin: { arity: 1, impl: Math.sin },
  cos: { arity: 1, impl: Math.cos },
  tan: { arity: 1, impl: Math.tan },
  asin: { arity: 1, impl: Math.asin },
  acos: { arity: 1, impl: Math.acos },
  atan: { arity: 1, impl: Math.atan },
  exp: { arity: 1, impl: Math.exp },
  log: { arity: 1, impl: Math.log },
  ln: { arity: 1, impl: Math.log },
  sqrt: { arity: 1, impl: Math.sqrt },
  abs: { arity: 1, impl: Math.abs },
  sinh: { arity: 1, impl: Math.sinh },
  cosh: { arity: 1, impl: Math.cosh },
  tanh: { arity: 1, impl: Math.tanh },
  min: { arity: 'variadic', impl: (...a) => Math.min(...a) },
  max: { arity: 'variadic', impl: (...a) => Math.max(...a) },
};

// ---------------------------------------------------------------- tokenizer
function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    if (c >= '0' && c <= '9' || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i;
      let seenDot = false;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || (src[j] === '.' && !seenDot))) {
        if (src[j] === '.') seenDot = true;
        j++;
      }
      tokens.push({ type: 'num', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'id', value: src.slice(i, j).toLowerCase(), pos: i });
      i = j;
      continue;
    }

    if ('+-*/^'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos: i }); i++; continue;
    }
    if (c === '(') { tokens.push({ type: 'lparen', value: c, pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: c, pos: i }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: c, pos: i }); i++; continue; }

    throw new ExpressionError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ type: 'end', value: '', pos: src.length });
  return tokens;
}

// ---------------------------------------------------------------- AST
type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; which: 1 | 2 }
  | { kind: 'unary'; op: '+' | '-'; arg: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
const UNARY_PREC = 3;

function parse(tokens: Token[]): Node {
  let pos = 0;
  let nodeCount = 0;

  const peek = (): Token => tokens[pos];
  const next = (): Token => tokens[pos++];

  const bump = (): void => {
    nodeCount++;
    if (nodeCount > MAX_NODES) throw new ExpressionError('Expression is too complex', 0);
  };

  function parseExpr(minPrec: number, depth: number): Node {
    if (depth > MAX_DEPTH) throw new ExpressionError('Expression is nested too deeply', 0);
    let left = parseUnary(depth);

    for (;;) {
      const t = peek();
      if (t.type !== 'op') break;
      const prec = PRECEDENCE[t.value];
      if (prec == null || prec < minPrec) break;
      next();
      const rightAssoc = t.value === '^';
      const nextMin = rightAssoc ? prec : prec + 1;
      const right = parseExpr(nextMin, depth + 1);
      bump();
      left = { kind: 'binary', op: t.value as '+' | '-' | '*' | '/' | '^', left, right };
    }
    return left;
  }

  function parseUnary(depth: number): Node {
    const t = peek();
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      next();
      const arg = parseUnary(depth + 1);
      bump();
      return { kind: 'unary', op: t.value as '+' | '-', arg };
    }
    return parsePrimary(depth);
  }

  function parsePrimary(depth: number): Node {
    const t = peek();

    if (t.type === 'num') {
      next();
      bump();
      const v = parseFloat(t.value);
      if (!isFinite(v)) throw new ExpressionError('Invalid number', t.pos);
      return { kind: 'num', value: v };
    }

    if (t.type === 'lparen') {
      next();
      const inner = parseExpr(0, depth + 1);
      if (peek().type !== 'rparen') throw new ExpressionError('Expected ")"', peek().pos);
      next();
      return inner;
    }

    if (t.type === 'id') {
      next();
      const name = t.value;

      if (peek().type === 'lparen') {
        const fn = FUNCTIONS[name];
        if (!fn) throw new ExpressionError(`Unknown function "${name}"`, t.pos);
        next(); // (
        const args: Node[] = [];
        if (peek().type !== 'rparen') {
          args.push(parseExpr(0, depth + 1));
          while (peek().type === 'comma') {
            next();
            args.push(parseExpr(0, depth + 1));
          }
        }
        if (peek().type !== 'rparen') throw new ExpressionError('Expected ")"', peek().pos);
        next(); // )
        if (fn.arity !== 'variadic' && args.length !== fn.arity) {
          throw new ExpressionError(`"${name}" expects ${fn.arity} argument(s)`, t.pos);
        }
        if (args.length === 0) throw new ExpressionError(`"${name}" requires arguments`, t.pos);
        bump();
        return { kind: 'call', name, args };
      }

      if (name === 'x1' || name === 'x') { bump(); return { kind: 'var', which: 1 }; }
      if (name === 'x2' || name === 'y') { bump(); return { kind: 'var', which: 2 }; }
      if (name in CONSTANTS) { bump(); return { kind: 'num', value: CONSTANTS[name] }; }

      throw new ExpressionError(`Unknown symbol "${name}"`, t.pos);
    }

    if (t.type === 'end') throw new ExpressionError('Unexpected end of expression', t.pos);
    throw new ExpressionError(`Unexpected token "${t.value}"`, t.pos);
  }

  const ast = parseExpr(0, 0);
  if (peek().type !== 'end') {
    throw new ExpressionError(`Unexpected token "${peek().value}"`, peek().pos);
  }
  return ast;
}

// ---------------------------------------------------------------- compile
function compileNode(node: Node): EvalFn {
  switch (node.kind) {
    case 'num': {
      const v = node.value;
      return () => v;
    }
    case 'var': {
      const which = node.which;
      return which === 1 ? (x1: number) => x1 : (_x1: number, x2: number) => x2;
    }
    case 'unary': {
      const arg = compileNode(node.arg);
      return node.op === '-' ? (a, b) => -arg(a, b) : arg;
    }
    case 'binary': {
      const l = compileNode(node.left);
      const r = compileNode(node.right);
      switch (node.op) {
        case '+': return (a, b) => l(a, b) + r(a, b);
        case '-': return (a, b) => l(a, b) - r(a, b);
        case '*': return (a, b) => l(a, b) * r(a, b);
        case '/': return (a, b) => l(a, b) / r(a, b);
        case '^': return (a, b) => Math.pow(l(a, b), r(a, b));
      }
      break;
    }
    case 'call': {
      const impl = FUNCTIONS[node.name].impl;
      const args = node.args.map(compileNode);
      if (args.length === 1) {
        const a0 = args[0];
        return (x, y) => impl(a0(x, y));
      }
      return (x, y) => impl(...args.map(fn => fn(x, y)));
    }
  }
  return () => NaN;
}

// ---------------------------------------------------------------- format
const FN_DISPLAY: Record<string, string> = { log: 'ln', ln: 'ln' };

function formatNode(node: Node, parentPrec = 0): string {
  switch (node.kind) {
    case 'num': {
      if (node.value === Math.PI) return 'π';
      if (node.value === Math.E) return 'e';
      return String(node.value);
    }
    case 'var':
      return node.which === 1 ? 'x₁' : 'x₂';
    case 'unary':
      return `${node.op}${formatNode(node.arg, UNARY_PREC)}`;
    case 'binary': {
      const prec = PRECEDENCE[node.op];
      const l = formatNode(node.left, prec);
      const r = formatNode(node.right, node.op === '^' ? prec : prec + 1);
      const body = node.op === '^' ? `${l}^${r}` : `${l} ${node.op} ${r}`;
      return prec < parentPrec ? `(${body})` : body;
    }
    case 'call': {
      const name = FN_DISPLAY[node.name] ?? node.name;
      return `${name}(${node.args.map(a => formatNode(a)).join(', ')})`;
    }
  }
}

// ---------------------------------------------------------------- public API
export function parseExpression(source: string): ParsedExpression {
  const trimmed = source.trim();
  if (!trimmed) throw new ExpressionError('Expression is empty', 0);
  if (source.length > MAX_LENGTH) {
    throw new ExpressionError(`Expression exceeds ${MAX_LENGTH} characters`, MAX_LENGTH);
  }

  const tokens = tokenize(source);
  const ast = parse(tokens);
  const evaluate = compileNode(ast);
  const formatted = formatNode(ast);

  return { source, evaluate, formatted };
}

export const EXPRESSION_EXAMPLES: Array<{ name: string; expression: string }> = [
  { name: 'Convex Bowl', expression: 'x1^2 + x2^2' },
  { name: 'Anisotropic Bowl', expression: 'x1^2 + 10*x2^2' },
  { name: 'Coupled Waves', expression: 'x1^2 + x2^2 + 3*sin(x1*x2)' },
  { name: 'Asymmetric Oscillation', expression: '0.2*x1^2 + x2^2 + 2*sin(3*x1) + cos(2*x2)' },
  { name: 'Rastrigin (explicit)', expression: '20 + x1^2 + x2^2 - 10*cos(2*pi*x1) - 10*cos(2*pi*x2)' },
];
