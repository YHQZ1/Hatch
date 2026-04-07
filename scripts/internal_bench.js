import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 50 },
    { duration: "30s", target: 100 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<50"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const BASE_URL = __ENV.HATCH_BASE_URL;

  const authToken = __ENV.HATCH_TOKEN;

  const params = {
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  };

  const responses = http.batch([
    ["GET", `${BASE_URL}/projects`, null, params],
    ["GET", `${BASE_URL}/activity`, null, params],
  ]);

  check(responses[0], { projects_status_200: (r) => r.status === 200 });
  check(responses[1], { activity_status_200: (r) => r.status === 200 });

  sleep(0.1);
}
