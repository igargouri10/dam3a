import"server-only";import{callRpc,getCurrentUser}from"@/lib/supabase/server";
export type ProfileSettings={username:string;fullName:string|null;age:number|null;preferredTeam:string|null;language:"en"|"fr";theme:"light"|"dark"};
export async function getProfileSettings():Promise<ProfileSettings|null>{const user=await getCurrentUser();if(!user)return null;try{return await callRpc<ProfileSettings>("get_my_profile",{})}catch{return{username:user.user_metadata?.username??user.email?.split("@")[0]??"Player",fullName:null,age:null,preferredTeam:null,language:"en",theme:"light"}}}
