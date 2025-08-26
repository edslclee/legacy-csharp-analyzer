// apps/api/test/routes.test.ts
import request from 'supertest';
import { app } from '../src/index';

describe('routes', () => {
  it('GET /health → 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  it('POST /analyze → 400 when bad payload', async () => {
    const res = await request(app)
      .post('/analyze')
      .send({}); // files 없음
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BAD_REQUEST');
  });

  it('POST /analyze → 413 when >5MB', async () => {
    const big = 'a'.repeat(5 * 1024 * 1024 + 1);
    const res = await request(app)
      .post('/analyze')
      .send({
        files: [{ name: 'big.cs', type: 'cs', content: big }]
      });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });
});