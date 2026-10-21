import "server-only";
import { cookies } from "next/headers";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

type AuthUser = { id: string; email?: string; user_metadata?: { username?: string } };
type AuthSession = { access_token: string; refresh_token: string; expires_in: number; user: AuthUser };
const ACCESS_COOKIE = "kp-access-token", REFRESH_COOKIE = "kp-refresh-token";

async function authFetch(path: string, init?: RequestInit) {
  const { url, anonKey } = getSupabaseConfig();
  return fetch(`${url}/auth/v1/${path}`, { ...init, headers: { apikey: anonKey, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
}

export async function persistSession(session: AuthSession) {
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(ACCESS_COOKIE, session.access_token, { ...options, maxAge: session.expires_in });
  jar.set(REFRESH_COOKIE, session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() { const jar = await cookies(); jar.delete(ACCESS_COOKIE); jar.delete(REFRESH_COOKIE); }

export async function signInWithPassword(email: string, password: string) {
  const response = await authFetch("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.msg ?? data.error_description ?? "Unable to sign in");
  await persistSession(data as AuthSession); return data as AuthSession;
}

export async function signUp(email: string, password: string, username: string) {
  const response = await authFetch("signup", { method: "POST", body: JSON.stringify({ email, password, data: { username } }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.msg ?? data.error_description ?? "Unable to create account");
  if (data.access_token) await persistSession(data as AuthSession); return data as AuthSession;
}

export async function getAccessToken() {
  if (!isSupabaseConfigured()) return null;
  const jar = await cookies(); const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) { const response = await authFetch("user", { headers: { Authorization: `Bearer ${access}` } }); if (response.ok) return access; }
  return null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken(); if (!token) return null;
  const response = await authFetch("user", { headers: { Authorization: `Bearer ${token}` } }); return response.ok ? response.json() : null;
}

export async function callRpc<T>(name: string, body: unknown): Promise<T> {
  const token = await getAccessToken(); if (!token) throw new Error("Authentication required");
  const { url, anonKey } = getSupabaseConfig(); const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw new Error(data.message ?? "Database request failed"); return data as T;
}

export async function callPublicRpc<T>(name:string,body:unknown):Promise<T>{
  const{url,anonKey}=getSupabaseConfig();const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:anonKey,Authorization:`Bearer ${anonKey}`,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message??"Database request failed");return data as T;
}

export async function callOptionalAuthRpc<T>(name:string,body:unknown):Promise<T>{
  const{url,anonKey}=getSupabaseConfig();const token=await getAccessToken();const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:anonKey,Authorization:`Bearer ${token??anonKey}`,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message??"Database request failed");return data as T;
}
