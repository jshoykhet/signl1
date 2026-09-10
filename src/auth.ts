import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { admitGoogleUser, admitUser, getUserByEmail, isDevLoginEnabled } from "./lib/access";
import { DEV_PREVIEW_NAME, isDevPreviewEmail } from "./lib/dev-preview";
import { verifyGoogleIdToken } from "./lib/google-id-token";

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [
    Credentials({
      id: "google",
      name: "Google",
      credentials: {
        idToken: { label: "ID token", type: "text" },
      },
      authorize: async (credentials) => {
        const idToken = typeof credentials?.idToken === "string" ? credentials.idToken : "";
        const claims = await verifyGoogleIdToken(idToken);
        if (!claims) return null;
        const user = admitGoogleUser({
          email: claims.email,
          name: claims.name,
          image: claims.picture,
        });
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ];

  if (isDevLoginEnabled()) {
    providers.push(
      Credentials({
        id: "dev",
        name: "Email",
        credentials: {
          email: { label: "Email", type: "email" },
        },
        authorize: async (credentials) => {
          const email = typeof credentials?.email === "string" ? credentials.email : "";
          const user = admitUser({
            email,
            name: isDevPreviewEmail(email) ? DEV_PREVIEW_NAME : (email.split("@")[0] ?? email),
            image: isDevPreviewEmail(email) ? null : undefined,
          });
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        },
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: buildProviders(),
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.email) return false;
      return admitUser({ email: user.email, name: user.name, image: user.image }) !== null;
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email) as string | undefined;
      if (!email) return token;
      const row = getUserByEmail(email);
      if (!row || row.disabled) {
        token.userId = undefined;
        token.role = undefined;
        token.email = undefined;
        token.name = undefined;
        token.picture = undefined;
        token.sub = undefined;
        return token;
      }
      token.userId = row.id;
      token.sub = row.id;
      token.role = row.role;
      token.email = row.email;
      token.name = row.name ?? token.name;
      token.picture = row.image ?? token.picture;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? "");
        session.user.role = token.role === "admin" ? "admin" : "operator";
        session.user.email = typeof token.email === "string" ? token.email : session.user.email;
        session.user.name = typeof token.name === "string" ? token.name : session.user.name;
        session.user.image = typeof token.picture === "string" ? token.picture : session.user.image;
      }
      return session;
    },
  },
});
