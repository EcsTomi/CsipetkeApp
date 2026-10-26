import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, BASE_URL } from './helpers.js';

const VOTE_ID = Number(__ENV.VOTE_ID || 1);
const OPTION_COUNT = 4;
const OPTION_OFFSET = Number(__ENV.OPTION_OFFSET || 1);

function castVote() {
  const optionId = Math.floor(Math.random() * OPTION_COUNT) + OPTION_OFFSET;
  const response = http.put(
    `${BASE_URL}/vote/${VOTE_ID}/vote/${optionId}`,
    null,
    authParams(),
  );
  check(response, {
    'vote 2xx, 409, 429 or 503': (res) =>
      res.status < 300 || res.status === 409 || res.status === 429 || res.status === 503,
  });
}

export const options = {
  scenarios: {
    clicking: {
      executor: 'constant-vus',
      exec: 'clicker',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.02'],
  },
};

export function clicker() {
  sleep(0.1);
  for (let i = 0; i < 30; i++) {
    castVote();
  }
  sleep(0.1);
  castVote();
}
