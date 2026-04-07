import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
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

  const payload = JSON.stringify({
    project_id: "your-test-project-id",
    branch: "main",
    cpu: 256,
    memory_mb: 512,
  });

  const deployReq = http.post(`${BASE_URL}/deployments`, payload, params);

  check(deployReq, {
    deployment_queued: (r) => r.status === 201 || r.status === 200,
    has_job_id: (r) => JSON.parse(r.body).id !== undefined,
  });

  sleep(1);
}
