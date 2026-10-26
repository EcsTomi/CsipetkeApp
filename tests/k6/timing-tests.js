import http from 'k6/http';
import { BASE_URL } from './helpers.js';

export const options = {
  vus: 250,
  duration: '2m',
};

export default function () {
  http.get(`${BASE_URL}/timing`);
}
