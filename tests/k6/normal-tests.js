import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, BASE_URL } from './helpers.js';

const VOTE_ID = Number(__ENV.VOTE_ID || 5);
const OPTION_OFFSET = Number(__ENV.OPTION_OFFSET || 15);

export const options = {
  scenarios: {
    baseline_browsing: {
      executor: 'constant-arrival-rate',
      rate: 33,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 250,
      exec: 'browse',
    },
    voting_spike: {
      executor: 'ramping-vus',
      startTime: '1m',
      exec: 'vote',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 300 },
        { duration: '20s', target: 300 },
        { duration: '1m', target: 50 },
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
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.02'],
  },
};

export function browse() {
  const response = http.get(`${BASE_URL}/vote`, authParams());
  check(response, { 'vote list 200': (res) => res.status === 200 });
  sleep(Math.random() * 20 + 1);
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
  for (let i = 0; i < 20; i++) {
    http.get(`${BASE_URL}/task`, params);
  }
  sleep(0.5);
}
