import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod'
import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

// ---- Helpers: extract JSON from mixed text / fences ----
function stripCodeFences(s: string) {
  return s
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}
function extractJsonSlice(s: string): string {
  // Try whole string first
  const whole = s.trim();
  if (whole.startsWith('{') && whole.lastIndexOf('}') > 0) return whole;

  // Remove typical markdown fences then retry
  const defenced = stripCodeFences(whole);
  if (defenced.startsWith('{') && defenced.lastIndexOf('}') > 0) return defenced;

  // As a fallback, take the first "{" and last "}" slice
  const first = defenced.indexOf('{');
  const last = defenced.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return defenced.slice(first, last + 1);
  }
  return defenced; // give back whatever we have; jsonrepair/parse will decide
}

const app = express();

// ---- CORS (안전하게 출처 제한) ----
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));

// ---- JSON Body 제한 (6MB = 5MB + 여유) ----
app.use(express.json({ limit: '6mb' }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** 요청 페이로드 스키마 */
const AnalyzePayload = z.object({
  files: z.array(z.object({
    name: z.string(),
    type: z.enum(['cs', 'sql', 'doc']),
    content: z.string()
  })),
  maxChars: z.number().default(200_000)
});

/** 응답(JSON) 스키마 */
const AnalysisResult = z.object({
  tables: z.array(z.object({
    name: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.string().optional(),
      pk: z.boolean().optional(),
      fk: z.object({ table: z.string(), column: z.string() }).optional(),
      nullable: z.boolean().optional()
    })).default([])
  })).default([]),
  erd_mermaid: z.string().default(''),
  crud_matrix: z.array(z.object({
    process: z.string(),
    table: z.string(),
    ops: z.array(z.enum(['C','R','U','D'])).default([])
  })).default([]),
  processes: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    children: z.array(z.string()).optional()
  })).default([]),
  doc_links: z.array(z.object({
    doc: z.string(),
    snippet: z.string(),
    related: z.string()
  })).default([])
});

function parseLLMJson(raw: string) {
  const candidate = extractJsonSlice(raw);
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      const repaired = jsonrepair(candidate);
      return JSON.parse(repaired);
    } catch {
      throw new Error('NON_JSON');
    }
  }
}

// ---- Normalizer: coerce common variations (e.g., ops as string) ----
function normalizeResultShape(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;

  // 1) tables: columns.constraints -> pk/fk/nullable
  if (Array.isArray(obj.tables)) {
    obj.tables = obj.tables.map((t: any) => {
      const name = t?.name ?? '';
      let columns = Array.isArray(t?.columns) ? t.columns : [];

      columns = columns.map((c: any) => {
        const out: any = {
          name: c?.name ?? '',
          type: c?.type,
          pk: c?.pk,
          fk: c?.fk,
          nullable: c?.nullable,
        };
        const cons: string[] = Array.isArray(c?.constraints) ? c.constraints : [];
        for (const token of cons) {
          const up = String(token).toUpperCase();
          if (up.includes('PRIMARY KEY')) out.pk = true;
          if (up.includes('NOT NULL')) out.nullable = false;
          // FOREIGN KEY REFERENCES Users(Id)
          const m = up.match(/FOREIGN KEY\\s+REFERENCES\\s+([A-Z0-9_]+)\\s*\\(\\s*([A-Z0-9_]+)\\s*\\)/);
          if (m) {
            out.fk = { table: c?.fk?.table ?? m[1], column: c?.fk?.column ?? m[2] };
          }
        }
        if (typeof out.nullable === 'undefined') out.nullable = true;
        return out;
      });

      return { name, columns };
    });
  }

  // 2) crud_matrix: object form -> array rows (process/table = key)
  if (obj.crud_matrix && !Array.isArray(obj.crud_matrix) && typeof obj.crud_matrix === 'object') {
    const rows: any[] = [];
    for (const [table, v] of Object.entries(obj.crud_matrix)) {
      const opsArr = Array.isArray((v as any)?.ops)
        ? (v as any).ops
        : typeof (v as any)?.ops === 'string'
          ? (v as any).ops.split('')
          : [];
      const ops = opsArr.filter((ch: any) => ['C','R','U','D'].includes(String(ch)));
      rows.push({ process: String(table), table: String(table), ops });
    }
    obj.crud_matrix = rows;
  }

  // 이미 배열이면 ops 정규화
  if (Array.isArray(obj.crud_matrix)) {
    obj.crud_matrix = obj.crud_matrix.map((r: any) => {
      const out = { process: r?.process ?? r?.table ?? '', table: r?.table ?? '', ops: r?.ops } as any;
      if (typeof out.ops === 'string') out.ops = out.ops.split('');
      if (!Array.isArray(out.ops)) out.ops = [];
      out.ops = out.ops.filter((ch: any) => ['C','R','U','D'].includes(String(ch)));
      return out;
    });
  }

  // 3) processes: strings -> objects
  if (Array.isArray(obj.processes)) {
    obj.processes = obj.processes.map((p: any) => typeof p === 'string' ? { name: p } : p);
  } else if (!obj.processes) {
    obj.processes = [];
  }

  // 4) doc_links: strings -> objects
  if (Array.isArray(obj.doc_links)) {
    obj.doc_links = obj.doc_links.map((d: any) => typeof d === 'string' ? { doc: d, snippet: '', related: '' } : d);
  } else if (!obj.doc_links) {
    obj.doc_links = [];
  }

  // 5) erd_mermaid 기본값
  if (typeof obj.erd_mermaid !== 'string') obj.erd_mermaid = '';

  return obj;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' });
});

/**
 * /analyze
 * 프런트에서 텍스트를 보내면 → 프롬프트 구성 → OpenAI JSON 응답
 * 5MB 총량 제한 + maxChars 트림 가드
 */
app.post('/analyze', async (req, res) => {
  try {
    const parsed = AnalyzePayload.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'BAD_REQUEST', detail: parsed.error.flatten() });
    }
    const { files, maxChars } = parsed.data;

    // ---- 5MB 제한(문자열 총 byte 계산) ----
    const totalBytes = Buffer.byteLength(files.map(f => f.content).join('\n'), 'utf8');
    if (totalBytes > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Total file size exceeds 5MB (prototype limit).' });
    }

    // ---- 길이 초과 대비 트림 ----
    const compact = (s: string) => s.length > maxChars ? (s.slice(0, maxChars) + '\n/* truncated */') : s;

    const codeText = compact(
      files.filter(f => f.type !== 'doc')
           .map(f => `// ${f.name}\n${f.content}`)
           .join('\n\n')
    );
    const docText = compact(
      files.filter(f => f.type === 'doc')
           .map(f => `# ${f.name}\n${f.content}`)
           .join('\n\n')
    );

    const system = `
You are an expert legacy C# & SQL analyst.
Return a SINGLE JSON with these keys exactly: { tables, erd_mermaid, crud_matrix, processes, doc_links }.
- erd_mermaid must be valid Mermaid ER diagram syntax: "erDiagram ...".
- crud_matrix.ops must be a subset of ["C","R","U","D"].
- Be concise but complete.
`.trim();

    const user = `
[CODE+SCHEMA START]
${codeText}
[CODE+SCHEMA END]

[DOCUMENTS START]
${docText}
[DOCUMENTS END]

Return only JSON. No markdown fences.
`.trim();

    // ---- OpenAI 호출 (JSON 강제) ----
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[analyze raw]', raw.slice(0, 1000));
    }
    let data: unknown;
    try {
      data = parseLLMJson(raw);
    } catch {
      return res.status(502).json({ error: 'BAD_UPSTREAM', message: 'LLM returned non-JSON (and jsonrepair failed).' });
    }
    const normalized = normalizeResultShape(data as any);
    const validated = AnalysisResult.safeParse(normalized);

    if (!validated.success) {
      return res.status(422).json({
        error: 'BAD_JSON',
        detail: validated.error.flatten(),
        hint: 'The AI output did not match the expected schema. Ensure response_format=json_object and prompt keys match.'
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[analyze] ok tables:', validated.data.tables?.length ?? 0,
        'crud:', validated.data.crud_matrix?.length ?? 0,
        'procs:', validated.data.processes?.length ?? 0);
    }

    res.json(validated.data);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL', message: e?.message ?? 'unknown' });
  }
});

// 맨 아래 listen 부분 교체
const port = Number(process.env.PORT || 8787);
const server = app.listen(port, () => {
  console.log(`✅ API listening on http://localhost:${port}`);
});

// ---- Graceful shutdown & safety ----
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  // 10초 내로 정상 종료 시도, 안되면 강제 종료
  const FORCE_TIMEOUT = setTimeout(() => {
    console.error('Force exiting after 10s.');
    process.exit(1);
  }, 10_000).unref();

  server.close(err => {
    clearTimeout(FORCE_TIMEOUT);
    if (err) {
      console.error('Error during server.close:', err);
      process.exit(1);
    }
    console.log('HTTP server closed. Bye 👋');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 에러 로깅 (개발 편의)
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});
