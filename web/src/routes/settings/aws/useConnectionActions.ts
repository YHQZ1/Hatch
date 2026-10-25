import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { NoticePayload } from "@/components/NoticeToast";
import { apiFetch, readApiError, redirectIfUnauthorized } from "@/lib/api";
import { connectionsQuery } from "@/lib/queries";
import type { ConnectForm } from "./awsConnection";

export const CREATING = "creating";

/**
 * What the AWS section does with a connection. Each action tells the user how it
 * went when it did not work (in the server's own words), refreshes the list when
 * it did, and says which one is under way so its buttons can wait. Only one runs
 * at a time.
 */
export function useConnectionActions(notify: (notice: NoticePayload) => void) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  async function send(
    key: string,
    path: string,
    method: string,
    body: unknown,
    failure: string,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    try {
      const res = await apiFetch(path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (redirectIfUnauthorized(res, navigate)) return false;
      if (!res.ok) {
        notify({ type: "error", title: failure, message: await readApiError(res, "The server refused the request.") });
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: connectionsQuery().queryKey });
      return true;
    } catch {
      notify({ type: "error", title: failure, message: "We couldn't reach the API." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    create: (form: ConnectForm) =>
      send(
        CREATING,
        "/api/connections",
        "POST",
        {
          region: form.region,
          monthly_budget_usd: Number(form.budget.trim()),
          budget_email: form.email.trim(),
          certificate_arn: form.certificate.trim(),
        },
        "Couldn't start the connection",
      ),
    giveRole: (id: string, roleArn: string) =>
      send(id, `/api/connections/${id}/role`, "PUT", { role_arn: roleArn.trim() }, "Couldn't save the role"),
    checkAgain: (id: string) =>
      send(id, `/api/connections/${id}/verify`, "POST", undefined, "Couldn't start the check"),
    remove: async (id: string) => {
      const ok = await send(id, `/api/connections/${id}`, "DELETE", undefined, "Couldn't remove the connection");
      if (ok) {
        notify({
          type: "success",
          title: "Connection removed",
          message: "Hatch has forgotten it. Nothing in your AWS account was changed.",
        });
      }
      return ok;
    },
  };
}

export type ConnectionActions = ReturnType<typeof useConnectionActions>;
