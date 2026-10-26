import http from 'k6/http';
import { sleep } from 'k6';
import { authParams, BASE_URL } from './helpers.js';

export const options = {
  scenarios: {
    abusive: {
      executor: 'constant-vus',
      exec: 'spam',
      vus: 10,
      duration: '3m',
    },
  },
};

export function spam() {
  const params = authParams();
  for (let i = 0; i < 20; i++) {
    http.get(`${BASE_URL}/task`, params);
  }
  sleep(0.5);
}
