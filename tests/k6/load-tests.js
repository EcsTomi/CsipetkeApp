import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, BASE_URL } from './helpers.js';

const VOTE_ID = Number(__ENV.VOTE_ID || 4);
const OPTION_OFFSET = Number(__ENV.OPTION_OFFSET || 12);

export const options = {
  scenarios: {
    browsing: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '3m', target: 250 },
        { duration: '2m', target: 230 },
        { duration: '1m', target: 0 },
      ],
    },
    voting_burst: {
      executor: 'ramping-vus',
      exec: 'vote',
      startVUs: 0,
      startTime: '2m',
      stages: [
        { duration: '10s', target: 400 },
        { duration: '30s', target: 400 },
        { duration: '10s', target: 0 },
      ],
    },
    abusive: {
      executor: 'constant-vus',
      exec: 'spam',
      vus: 10,
      duration: '3m',
      startTime: '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.02'],
  },
};

export function browse() {
  const response = http.get(`${BASE_URL}/task`, authParams());
  check(response, { 'task list 200': (res) => res.status === 200 });
  sleep(Math.random() * 3 + 1);
}

export function vote() {
  const optionId = Math.floor(Math.random() * 4) + OPTION_OFFSET;
  const response = http.put(
    `${BASE_URL}/vote/${VOTE_ID}/vote/${optionId}`,
    null,
    authParams(),
  );
  check(response, {
    'vote 2xx or 429': (res) => res.status < 300 || res.status === 429,
  });
  sleep(Math.random() * 1.5);
}

export function spam() {
  const params = authParams();
  for (let i = 0; i < 30; i++) {
    http.get(`${BASE_URL}/task`, params);
  }
  sleep(0.5);
}
