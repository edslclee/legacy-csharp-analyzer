import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import OpenAI from 'openai';

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
    }))
  })),
  erd_mermaid: z.string(),
  crud_matrix: z.array(z.object({
    process: z.string(),
    table: z.string(),
    ops: z.array(z.enum(['C','R','U','D']))
  })),
  processes: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    children: z.array(z.string()).optional()
  })),
  doc_links: z.array(z.object({
    doc: z.string(),
    snippet: z.string(),
    related: z.string()
  }))
});

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
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'BAD_UPSTREAM', message: 'LLM returned non-JSON.' });
    }

    const validated = AnalysisResult.safeParse(data);
    if (!validated.success) {
      return res.status(422).json({ error: 'BAD_JSON', detail: validated.error.flatten() });
    }

    res.json(validated.data);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL', message: e?.message ?? 'unknown' });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`✅ API listening on http://localhost:${port}`);
});
