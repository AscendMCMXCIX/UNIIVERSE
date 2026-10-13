/** Which build is answering: lets an operator confirm a deploy went live from a job or health response. */
export function deploymentInfo(): { commit: string | null; region: string | null } {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? process.env.SOURCE_COMMIT ?? "";
  return { commit: sha ? sha.slice(0, 7) : null, region: process.env.VERCEL_REGION ?? null };
}
