// apps/api/src/index.ts
// ESM + TypeScript (tsx 실행 기준)
// ----- Imports -----
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
// Logging / Metrics
import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import promClient from 'prom-client';
// Retry util
import { withRetry } from './lib/retry';
// ----- App & Basic Middleware -----
const app = express();
// CORS: whitelist from env (comma-separated), default localhost:5173
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || corsOrigins.includes(origin))
            return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    }
}));
// JSON body limit (6MB = 5MB + headroom)
app.use(express.json({ limit: '6mb' }));
// pino logger (request-id, levels)
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
app.use(pinoHttp({
    //logger,
    genReqId: () => uuidv4(),
    customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500)
            return 'error';
        if (res.statusCode >= 400)
            return 'warn';
        return 'info';
    },
}));
// Prometheus metrics
promClient.collectDefaultMetrics();
app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
});
// OpenAI client
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// ----- Zod Schemas -----
const AnalyzePayload = z.object({
    files: z.array(z.object({
        name: z.string(),
        type: z.enum(['cs', 'sql', 'doc']),
        content: z.string()
    })).default([]),
    maxChars: z.number().default(200_000)
});
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
        ops: z.array(z.enum(['C', 'R', 'U', 'D'])).default([])
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
// ----- Helpers: JSON extraction/repair/normalization -----
function stripCodeFences(s) {
    return s
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
}
function extractJsonSlice(s) {
    const whole = s.trim();
    if (whole.startsWith('{') && whole.lastIndexOf('}') > 0)
        return whole;
    const defenced = stripCodeFences(whole);
    if (defenced.startsWith('{') && defenced.lastIndexOf('}') > 0)
        return defenced;
    const first = defenced.indexOf('{');
    const last = defenced.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        return defenced.slice(first, last + 1);
    }
    return defenced;
}
function parseLLMJson(raw) {
    const candidate = extractJsonSlice(raw);
    try {
        return JSON.parse(candidate);
    }
    catch {
        try {
            const repaired = jsonrepair(candidate);
            return JSON.parse(repaired);
        }
        catch {
            throw new Error('NON_JSON');
        }
    }
}
/**
 * Normalize various model output shapes to our strict schema:
 * - tables[].columns[].constraints[] -> pk/fk/nullable
 * - crud_matrix object form { Table: { ops: [...] } } -> array rows
 * - processes/doc_links string arrays -> object arrays
 */
function normalizeResultShape(obj) {
    if (!obj || typeof obj !== 'object')
        return obj;
    // 1) tables: columns.constraints -> pk/fk/nullable
    if (Array.isArray(obj.tables)) {
        obj.tables = obj.tables.map((t) => {
            const name = t?.name ?? '';
            let columns = Array.isArray(t?.columns) ? t.columns : [];
            columns = columns.map((c) => {
                const out = {
                    name: c?.name ?? '',
                    type: c?.type,
                    pk: c?.pk,
                    fk: c?.fk,
                    nullable: c?.nullable,
                };
                const cons = Array.isArray(c?.constraints) ? c.constraints : [];
                for (const token of cons) {
                    const up = String(token).toUpperCase();
                    if (up.includes('PRIMARY KEY'))
                        out.pk = true;
                    if (up.includes('NOT NULL'))
                        out.nullable = false;
                    // FOREIGN KEY REFERENCES Users(Id)
                    const m = up.match(/FOREIGN KEY\s+REFERENCES\s+([A-Z0-9_]+)\s*$begin:math:text$\\s*([A-Z0-9_]+)\\s*$end:math:text$/);
                    if (m) {
                        out.fk = { table: c?.fk?.table ?? m[1], column: c?.fk?.column ?? m[2] };
                    }
                }
                if (typeof out.nullable === 'undefined')
                    out.nullable = true;
                return out;
            });
            return { name, columns };
        });
    }
    // 2) crud_matrix: object form -> array rows (process/table = key)
    if (obj.crud_matrix && !Array.isArray(obj.crud_matrix) && typeof obj.crud_matrix === 'object') {
        const rows = [];
        for (const [table, v] of Object.entries(obj.crud_matrix)) {
            const opsArr = Array.isArray(v?.ops)
                ? v.ops
                : typeof v?.ops === 'string'
                    ? v.ops.split('')
                    : [];
            const ops = opsArr.filter((ch) => ['C', 'R', 'U', 'D'].includes(String(ch)));
            rows.push({ process: String(table), table: String(table), ops });
        }
        obj.crud_matrix = rows;
    }
    // If already array, ensure ops are valid arrays
    if (Array.isArray(obj.crud_matrix)) {
        obj.crud_matrix = obj.crud_matrix.map((r) => {
            const out = { process: r?.process ?? r?.table ?? '', table: r?.table ?? '', ops: r?.ops };
            if (typeof out.ops === 'string')
                out.ops = out.ops.split('');
            if (!Array.isArray(out.ops))
                out.ops = [];
            out.ops = out.ops.filter((ch) => ['C', 'R', 'U', 'D'].includes(String(ch)));
            return out;
        });
    }
    // 3) processes: strings -> objects
    if (Array.isArray(obj.processes)) {
        obj.processes = obj.processes.map((p) => typeof p === 'string' ? { name: p } : p);
    }
    else if (!obj.processes) {
        obj.processes = [];
    }
    // 4) doc_links: strings -> objects
    if (Array.isArray(obj.doc_links)) {
        obj.doc_links = obj.doc_links.map((d) => typeof d === 'string' ? { doc: d, snippet: '', related: '' } : d);
    }
    else if (!obj.doc_links) {
        obj.doc_links = [];
    }
    // 5) erd_mermaid default
    if (typeof obj.erd_mermaid !== 'string')
        obj.erd_mermaid = '';
    return obj;
}
// ----- Routes -----
app.get('/health', (_req, res) => {
    res.json({ ok: true, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' });
});
app.post('/analyze', async (req, res) => {
    try {
        const parsed = AnalyzePayload.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'BAD_REQUEST', detail: parsed.error.flatten() });
        }
        const { files, maxChars } = parsed.data;
        // 5MB total content guard
        const totalBytes = Buffer.byteLength(files.map(f => f.content).join('\n'), 'utf8');
        if (totalBytes > 5 * 1024 * 1024) {
            return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Total file size exceeds 5MB (prototype limit).' });
        }
        const compact = (s) => s.length > maxChars ? (s.slice(0, maxChars) + '\n/* truncated */') : s;
        const codeText = compact(files.filter(f => f.type !== 'doc')
            .map(f => `// ${f.name}\n${f.content}`)
            .join('\n\n'));
        const docText = compact(files.filter(f => f.type === 'doc')
            .map(f => `# ${f.name}\n${f.content}`)
            .join('\n\n'));
        const system = `
You are an expert legacy C# & SQL analyst.
Return a SINGLE JSON with these keys exactly: { tables, erd_mermaid, crud_matrix, processes, doc_links }.
- erd_mermaid must be valid Mermaid ER diagram syntax: "erDiagram ...".
- crud_matrix.ops must be a subset of ["C","R","U","D"].
- Return ONLY JSON. No explanations, no markdown, no fences.
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
        // OpenAI call with retry & JSON format
        const response = await withRetry(() => client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            temperature: 0.1,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ]
        }));
        const raw = response.choices[0]?.message?.content ?? '{}';
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.log('[analyze raw]', raw.slice(0, 1000));
            }
            catch {
                console.log('[analyze raw]', '(unprintable content)');
            }
        }
        let data;
        try {
            data = parseLLMJson(raw);
        }
        catch {
            return res.status(502).json({ error: 'BAD_UPSTREAM', message: 'LLM returned non-JSON (and jsonrepair failed).' });
        }
        const normalized = normalizeResultShape(data);
        const validated = AnalysisResult.safeParse(normalized);
        if (!validated.success) {
            return res.status(422).json({
                error: 'BAD_JSON',
                detail: validated.error.flatten(),
                hint: 'The AI output did not match the expected schema. Ensure response_format=json_object and prompt keys match.'
            });
        }
        if (process.env.NODE_ENV !== 'production') {
            const v = validated.data;
            console.log('[analyze] ok tables:', v.tables?.length ?? 0, 'crud:', v.crud_matrix?.length ?? 0, 'procs:', v.processes?.length ?? 0);
        }
        res.json(validated.data);
    }
    catch (e) {
        console.error('[analyze] failed:', e?.message || e);
        res.status(500).json({ error: 'INTERNAL', message: e?.message ?? 'unknown' });
    }
});
// ----- Server start & graceful shutdown -----
const port = Number(process.env.PORT || 8787);
const server = app.listen(port, () => {
    console.log(`✅ API listening on http://localhost:${port}`);
});
// Graceful shutdown to avoid lingering port usage
function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
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
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
    console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('UncaughtException:', err);
});
// Export for tests (supertest)
export { app };
