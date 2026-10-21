"use server";
import { redirect } from "next/navigation"; import { clearSession, signInWithPassword, signUp } from "@/lib/supabase/server";
const value=(form:FormData,key:string)=>String(form.get(key)??"").trim();
export async function signInAction(_:unknown,form:FormData){try{await signInWithPassword(value(form,"email"),value(form,"password"));}catch(e){return {error:e instanceof Error?e.message:"Sign in failed"};}redirect("/");}
export async function signUpAction(_:unknown,form:FormData){const username=value(form,"username"),password=value(form,"password");if(username.length<3)return{error:"Username must be at least 3 characters"};if(password.length<8)return{error:"Password must be at least 8 characters"};try{await signUp(value(form,"email"),password,username);}catch(e){return {error:e instanceof Error?e.message:"Sign up failed"};}redirect("/");}
export async function signOutAction(){await clearSession();redirect("/auth/sign-in");}
