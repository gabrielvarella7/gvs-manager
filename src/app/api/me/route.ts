import { json, requireViewer } from "@/lib/auth";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  return json({
    name: viewer.name,
    email: viewer.email,
    simulated: viewer.simulated,
    stage: viewer.stage,
  });
}
