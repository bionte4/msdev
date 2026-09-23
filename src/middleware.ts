import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/capacity/:path*",
    "/projects/:path*",
    "/personnel/:path*",
    "/development/:path*",
    "/timesheets/:path*",
    "/overtime/:path*",
    "/evaluations/:path*",
    "/scope-swaps/:path*",
    "/integrations/:path*",
  ],
};
