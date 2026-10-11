// k6 run -e BASE=http://localhost:8080 loadtest/submit.js
import http from 'k6/http';
import { check } from 'k6';
const BASE = __ENV.BASE || 'http://localhost:8080';
export const options = {
  scenarios: { ramp: { executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 400,
    stages: [{ target: 50, duration: '1m' }, { target: 100, duration: '2m' }, { target: 200, duration: '2m' }] } },
};
export function setup() {
  const email = `load-${Date.now()}@test.io`, password = 'LoadTest123!';
  http.post(`${BASE}/api/auth/register`, JSON.stringify({ email, password }), { headers: { 'Content-Type': 'application/json' } });
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password }), { headers: { 'Content-Type': 'application/json' } });
  // Raise this user's rate_limit_per_min / max_queued first (admin PATCH /api/admin/users/{id}), else you will measure 429s.
  return { token: r.json('accessToken') };
}
export default function (d) {
  const res = http.post(`${BASE}/api/jobs`, JSON.stringify({ type: 'DEMO_FLAKY', payload: { durationSec: 0.2, failRate: 0 } }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}` } });
  check(res, { 'accepted': (r) => r.status === 201 });
}
