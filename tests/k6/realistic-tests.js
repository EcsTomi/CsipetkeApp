import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, BASE_URL } from './helpers.js';

const VOTE_ID = Number(__ENV.VOTE_ID || 1);
const OPTION_COUNT = 4;
const OPTION_OFFSET = Number(__ENV.OPTION_OFFSET || 1);
const TOTAL_USERS = 450;
const EARLY_WAVE_RATIO = 0.4;
const CHANGER_RATIO = 0.08;
const FLIPFLOP_RATIO = 0.05;
const EARLY_WINDOW = '60s';
const LATE_WINDOW = '120s';

function castVote(vuIndex) {
  const optionId = Math.floor(Math.random() * OPTION_COUNT) + OPTION_OFFSET;
  const response = http.put(
    `${BASE_URL}/vote/${VOTE_ID}/vote/${optionId}`,
    null,
    authParams(vuIndex),
  );
  check(response, {
    'vote 2xx, 409, 429 or 503': (res) =>
      res.status < 300 || res.status === 409 || res.status === 429 || res.status === 503,
  });
}

export const options = {
  scenarios: {
    early_wave: {
      executor: 'per-vu-iterations',
      exec: 'earlyVoter',
      vus: Math.round(TOTAL_USERS * EARLY_WAVE_RATIO),
      iterations: 1,
      maxDuration: EARLY_WINDOW,
      startTime: '0s',
    },
    late_trickle: {
      executor: 'per-vu-iterations',
      exec: 'lateVoter',
      vus: Math.round(TOTAL_USERS * (1 - EARLY_WAVE_RATIO)),
      iterations: 1,
      maxDuration: LATE_WINDOW,
      startTime: EARLY_WINDOW,
    },
    changers: {
      executor: 'per-vu-iterations',
      exec: 'changer',
      vus: Math.round(TOTAL_USERS * CHANGER_RATIO),
      iterations: 1,
      maxDuration: '150s',
      startTime: '30s',
    },
    flipfloppers: {
      executor: 'constant-vus',
      exec: 'flipFlopper',
      vus: Math.round(TOTAL_USERS * FLIPFLOP_RATIO),
      duration: '180s',
      startTime: '0s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.02'],
  },
};

export function earlyVoter() {
  sleep(Math.pow(Math.random(), 2) * 60);
  castVote(__VU);
}

export function lateVoter() {
  sleep(Math.random() * 120);
  castVote(__VU + 100000);
}

export function changer() {
  sleep(20 + Math.random() * 100);
  castVote(__VU + 200000);
}

export function flipFlopper() {
  castVote(__VU + 300000);
  sleep(5 + Math.random() * 15);
}
