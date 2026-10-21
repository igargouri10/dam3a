import{NextResponse}from"next/server";import{runMatchSync}from"@/lib/football/jobs";
export const maxDuration=300;
export async function GET(request:Request){const expected=process.env.CRON_SECRET;if(!expected||request.headers.get("authorization")!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await runMatchSync())}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Scheduled sync failed"},{status:500})}}
