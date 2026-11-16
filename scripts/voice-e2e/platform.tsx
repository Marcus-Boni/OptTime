import type { AnchorHTMLAttributes } from "react";
import { useSyncExternalStore } from "react";

const session = {
  user: {
    id: "voice-test-user",
    name: "Pessoa de Teste",
    email: "voice@example.invalid",
  },
};

export const authClient = {
  async getSession(): Promise<{ data: typeof session }> {
    return { data: session };
  },
};

export const signIn = {
  async social(): Promise<{ error: null }> {
    return { error: null };
  },
};

export function useSession() {
  const ready = useSyncExternalStore(
    (notify) => {
      window.addEventListener("test:auth", notify);
      return () => window.removeEventListener("test:auth", notify);
    },
    () => window.voiceAuthReady,
    () => false,
  );
  return { data: ready ? session : null, isPending: !ready };
}

export function usePathname(): string {
  return "/dashboard";
}
export function useRouter() {
  return {
    push: (): void => {},
    replace: (): void => {},
    refresh: (): void => {},
  };
}
export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
