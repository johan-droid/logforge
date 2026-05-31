import { API_BASE } from "@/lib/config";

export type SessionUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
};

export async function fetchSessionUser(): Promise<SessionUser | null> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { user?: SessionUser };
    return payload.user || null;
  } catch {
    return null;
  }
}

export async function logoutSession(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    return response.ok;
  } catch {
    return false;
  }
}
