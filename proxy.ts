import{NextResponse,type NextRequest}from"next/server";

const ACCESS_COOKIE="kp-access-token",REFRESH_COOKIE="kp-refresh-token";

function expiresSoon(token:string){try{const part=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"),payload=JSON.parse(atob(part));return typeof payload.exp!=="number"||payload.exp<=Math.floor(Date.now()/1000)+30}catch{return true}}

export async function proxy(request:NextRequest){
 let access=request.cookies.get(ACCESS_COOKIE)?.value,refresh=request.cookies.get(REFRESH_COOKIE)?.value,newRefresh:string|undefined,expiresIn=3600;
 if((!access||expiresSoon(access))&&refresh){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(url&&key)try{const authResponse=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refresh}),cache:"no-store"});if(authResponse.ok){const session=await authResponse.json();access=session.access_token;newRefresh=session.refresh_token;expiresIn=session.expires_in??3600}else{access=undefined;refresh=undefined}}catch{}
 }

 const requestHeaders=new Headers(request.headers);
 if(access){const cookieMap=new Map((request.headers.get("cookie")??"").split(";").map(value=>value.trim()).filter(Boolean).map(value=>{const index=value.indexOf("=");return[index<0?value:value.slice(0,index),index<0?"":value.slice(index+1)]}));cookieMap.set(ACCESS_COOKIE,access);if(newRefresh)cookieMap.set(REFRESH_COOKIE,newRefresh);requestHeaders.set("cookie",[...cookieMap].map(([name,value])=>`${name}=${value}`).join("; "))}

 const response=NextResponse.next({request:{headers:requestHeaders}}),cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax"as const,path:"/"};
 if(access&&expiresSoon(request.cookies.get(ACCESS_COOKIE)?.value??"")){response.cookies.set(ACCESS_COOKIE,access,{...cookieOptions,maxAge:expiresIn});if(newRefresh)response.cookies.set(REFRESH_COOKIE,newRefresh,{...cookieOptions,maxAge:60*60*24*30})}
 if(!access&&request.cookies.has(ACCESS_COOKIE)){response.cookies.delete(ACCESS_COOKIE);response.cookies.delete(REFRESH_COOKIE)}
 response.headers.set("X-Content-Type-Options","nosniff");response.headers.set("X-Frame-Options","DENY");response.headers.set("Referrer-Policy","strict-origin-when-cross-origin");response.headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");response.headers.set("Cross-Origin-Opener-Policy","same-origin");if(request.nextUrl.pathname.startsWith("/api/"))response.headers.set("X-Robots-Tag","noindex");return response;
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
