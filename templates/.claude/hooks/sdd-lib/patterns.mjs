// Managed by reins. Shared by the Claude Code hooks, the git hooks and `reins audit-secrets`.
// Project-specific additions go into .sdd/harness.json -> guard.extraSecretPaths (globs).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Files whose basename marks them as secret-bearing. Templates like .env.example stay readable.
const SECRET_BASENAME = [
  /^\.env$/i,
  /^\.env\.(?!(example|sample|template|dist|defaults|schema)(\.|$))[\w.-]+$/i,
  /^\.envrc$/i,
  /^\.netrc$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.pgpass$/i,
  /^credentials(\.json)?$/i,
  /^secrets?\.(json|ya?ml|toml|env)$/i,
  /^service[-_]?account.*\.json$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|asc|gpg)$/i,
  // Database dumps and raw data exports.
  /\.(dump|sql\.gz|sql\.bz2|bak|sqlite3?|db)$/i,
  /^dump.*\.sql$/i,
];

// Directories that hold secrets or real (non-synthetic) data.
const SECRET_DIR = /(^|\/)(\.ssh|\.aws|\.gnupg|\.docker|\.kube|secrets?|dumps?|backups?|data\/(real|prod|production|raw|pii|phi))(\/|$)/i;

const ALLOWED = [/\.example$/i, /\.sample$/i, /\.template$/i, /(^|\/)test\/fixtures\/certs\//i];

let extraGlobs = null;
function loadExtra(cwd) {
  if (extraGlobs) return extraGlobs;
  extraGlobs = [];
  const cfg = path.join(cwd, '.sdd', 'harness.json');
  if (existsSync(cfg)) {
    try {
      const json = JSON.parse(readFileSync(cfg, 'utf8'));
      extraGlobs = (json.guard?.extraSecretPaths ?? []).map(globToRegExp);
    } catch {
      /* malformed config: fall back to built-ins */
    }
  }
  return extraGlobs;
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`(^|/)${re}$`, 'i');
}

/** Returns a reason string if `p` points at a protected file, else null. */
export function protectedPath(p, cwd = process.cwd()) {
  if (!p || typeof p !== 'string') return null;
  const norm = p.replace(/\\/g, '/').replace(/^["']|["']$/g, '');
  const rel = path.isAbsolute(norm) ? path.relative(cwd, norm).replace(/\\/g, '/') : norm.replace(/^\.\//, '');
  if (ALLOWED.some((r) => r.test(rel))) return null;
  const base = rel.split('/').pop();
  if (SECRET_BASENAME.some((r) => r.test(base))) return `"${base}" is a secret-bearing or raw-data file`;
  if (SECRET_DIR.test(rel)) return `"${rel}" is inside a directory reserved for secrets or real data`;
  if (loadExtra(cwd).some((r) => r.test(rel))) return `"${rel}" matches guard.extraSecretPaths in .sdd/harness.json`;
  return null;
}

// Shell commands that dump the process environment (where CI and dev shells keep tokens).
const ENV_DUMP = [
  /(^|[;&|(]\s*)(printenv|env)\s*($|[;&|)>])/,
  /(^|[;&|(]\s*)export\s+-p\b/,
  /(^|[;&|(]\s*)(declare|typeset)\s+-x?p\b/,
  /\/proc\/[^\s/]+\/environ/,
  /\bdocker\s+(inspect|exec\b.*\benv\b)/,
  /\bgh\s+auth\s+token\b/,
  /\bgit\s+config\b.*\bcredential/,
  /\bsecurity\s+find-(generic|internet)-password\b/,
];

/** Returns a reason string if a shell command would read a protected file or dump secrets. */
export function protectedCommand(cmd, cwd = process.cwd()) {
  if (!cmd || typeof cmd !== 'string') return null;
  for (const r of ENV_DUMP) if (r.test(cmd)) return 'the command would print environment variables or stored credentials';
  // Split on shell syntax and check every word that looks like a path (also `rev:path` and `<file`).
  const words = cmd.split(/[\s;&|()<>`'"=]+/).flatMap((w) => [w, ...(w.includes(':') ? [w.split(':').pop()] : [])]);
  for (const w of words) {
    if (!w || w.startsWith('-')) continue;
    const reason = protectedPath(w, cwd);
    if (reason) return reason;
  }
  // Globs that would expand to env files, e.g. `cat .env*` or `cat .e?v`.
  if (/(^|[\s/])\.e[\w?*[\]]*[*?[]/.test(cmd) || /(^|[\s/])\.env\*/.test(cmd)) {
    return 'the command uses a glob that can expand to .env files';
  }
  return null;
}

// High-signal secret formats. Used for prompts, transcripts and logs (not for file paths).
export const SECRET_PATTERNS = [
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe live key', /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Atlassian API token', /\bATATT3[A-Za-z0-9_=-]{20,}/],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Connection string with password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s]+/i],
];

/** Returns [{name, match}] for every secret-like string in `text`. */
export function findSecrets(text) {
  const hits = [];
  if (!text) return hits;
  for (const [name, re] of SECRET_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) hits.push({ name, match: m[0], index: m.index });
  }
  return hits;
}

export const mask = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`);
