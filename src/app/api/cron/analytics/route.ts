import{NextResponse}from"next/server";import{runAnalyticsBackfill}from"@/lib/football/jobs";

export const maxDuration=300;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;if(!expected||request.headers.get("authorization")!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const requested=Number(new URL(request.url).searchParams.get("limit")??30),limit=Number.isFinite(requested)?requested:30;
 try{return NextResponse.json(await runAnalyticsBackfill(limit))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Analytics backfill failed"},{status:500})}
}
