export function GET(request: Request) {
  return Response.redirect(new URL("/fantasy/prices/download", request.url), 307);
}
