import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/capacity/:path*",
    "/clients/:path*",
    "/projects/:path*",
    "/personnel/:path*",
    "/coverage/:path*",
    "/development/:path*",
    "/timesheets/:path*",
    "/overtime/:path*",
    "/evaluations/:path*",
    "/leaderboard/:path*",
    "/scope-swaps/:path*",
    "/reports/:path*",
    "/access/:path*",
    "/integrations/:path*",
  ],
};
