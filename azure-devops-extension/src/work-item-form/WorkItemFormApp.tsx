import type * as SDK from "azure-devops-extension-sdk";
import { useEffect, useState } from "react";
import type { IFormServiceSubset } from "../shared/api";
import { isConfigured } from "../shared/auth";
import { Dashboard } from "./components/Dashboard";
import { SetupScreen } from "./components/SetupScreen";

interface WorkItemFormAppProps {
  sdk: typeof SDK;
}

export function WorkItemFormApp({ sdk }: WorkItemFormAppProps) {
  const [configured, setConfigured] = useState(isConfigured());
  const [workItemId, setWorkItemId] = useState<number | null>(null);
  const [workItemTitle, setWorkItemTitle] = useState<string>("");
  const [devOpsProjectName, setDevOpsProjectName] = useState<string>("");
  const [devOpsBaseUrl, setDevOpsBaseUrl] = useState<string>("");
  const [formService, setFormService] = useState<IFormServiceSubset | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await sdk.ready();

        // Register the extension with the host so it knows we have successfully
        // loaded — clears the "taking longer than expected to load" warning.
        sdk.register(sdk.getContributionId(), () => ({
          onLoaded: async (_args: unknown) => {
            // Could re-read fields here if needed
          },
          onSaved: async (args: { id: number }) => {
            setWorkItemId(args.id);
          },
        }));

        const { WorkItemTrackingServiceIds } = await import(
          "azure-devops-extension-api/WorkItemTracking"
        );

        const svc = await sdk.getService<
          import("azure-devops-extension-api/WorkItemTracking").IWorkItemFormService
        >(WorkItemTrackingServiceIds.WorkItemFormService);

        const [id, titleRaw] = await Promise.all([
          svc.getId(),
          svc.getFieldValue("System.Title", { returnOriginalValue: false }),
        ]);

        setWorkItemId(id);
        setWorkItemTitle((titleRaw as string) ?? "");
        // Cast to our subset interface — avoids importing the full SDK type in the extension
        setFormService(svc as unknown as IFormServiceSubset);

        // ── Build DevOps context ───────────────────────────────────────
        // getHost() returns { name: orgName, ... }
        // getPageContext() returns { project: { name: "Hidrauvit", ... }, ... }
        const hostCtx = sdk.getHost();
        // pageContext is typed loosely in the SDK — use unknown cast
        const pageCtx = sdk.getPageContext() as
          | { project?: { name?: string } }
          | undefined;

        const orgName = hostCtx?.name ?? "";
        const projectName = pageCtx?.project?.name ?? "";

        setDevOpsProjectName(projectName);

        if (orgName && projectName) {
          setDevOpsBaseUrl(
            `https://dev.azure.com/${orgName}/${encodeURIComponent(projectName)}`,
          );
        } else if (orgName) {
          setDevOpsBaseUrl(`https://dev.azure.com/${orgName}`);
        }

        setSdkReady(true);
        sdk.resize();
      } catch (err) {
        console.error("[OptSolv Extension] SDK init error:", err);
        // Fallback — render the UI without DevOps context (e.g., local dev iframe)
        setSdkReady(true);
      }
    }

    void init();
  }, [sdk]);

  if (!sdkReady) {
    return <LoadingSpinner />;
  }

  if (!configured) {
    return <SetupScreen onConfigured={() => setConfigured(true)} />;
  }

  return (
    <Dashboard
      workItemId={workItemId}
      workItemTitle={workItemTitle}
      devOpsProjectName={devOpsProjectName}
      devOpsBaseUrl={devOpsBaseUrl}
      formService={formService}
      onLogout={() => setConfigured(false)}
    />
  );
}

function LoadingSpinner() {
  return (
    <div style={styles.center}>
      <div style={styles.spinner} />
    </div>
  );
}

const styles = {
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    minHeight: 120,
  } as React.CSSProperties,
  spinner: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "2px solid rgba(249,115,22,0.2)",
    borderTopColor: "var(--brand)",
    animation: "spin 0.8s linear infinite",
  } as React.CSSProperties,
};
