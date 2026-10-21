import{NextResponse}from"next/server";import{runCatalogSync}from"@/lib/football/jobs";
export const maxDuration=300;
export async function GET(request:Request){const expected=process.env.CRON_SECRET;if(!expected||request.headers.get("authorization")!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await runCatalogSync())}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Catalog sync failed"},{status:500})}}
