import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
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
    "/tickets/:path*",
    "/reports/:path*",
    "/access/:path*",
    "/integrations/:path*",
  ],
};
