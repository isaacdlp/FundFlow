import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";

interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  roles: { id: number; name: string; description: string }[];
  impersonatedBy?: { id: number; firstName: string; lastName: string };
  [key: string]: unknown;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  isImpersonating: boolean;
  realAdmin: { id: number; firstName: string; lastName: string } | null;
  loginMutation: ReturnType<typeof useLoginMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
  showAsMutation: ReturnType<typeof useShowAsMutation>;
  returnToSelfMutation: ReturnType<typeof useReturnToSelfMutation>;
}

function useLoginMutation() {
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      return res.json();
    },
    onSuccess: (data: AuthUser) => {
      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });
}

function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });
}

function useShowAsMutation() {
  return useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("POST", `/api/auth/impersonate/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

function useReturnToSelfMutation() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/impersonate/stop");
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useLoginMutation();
  const logoutMutation = useLogoutMutation();
  const showAsMutation = useShowAsMutation();
  const returnToSelfMutation = useReturnToSelfMutation();

  const isImpersonating = !!user?.impersonatedBy;
  const realAdmin = user?.impersonatedBy ?? null;
  // When impersonating, the session user is not admin; use realAdmin presence to determine admin status
  const isAdmin = isImpersonating ? false : !!user?.roles?.some(r => r.name === "admin");

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, isAdmin, isImpersonating, realAdmin, loginMutation, logoutMutation, showAsMutation, returnToSelfMutation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
