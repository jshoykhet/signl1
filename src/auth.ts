import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import { admitUser, getUserByEmail, isDevLoginEnabled, isGoogleAuthConfigured } from "./lib/access";

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];

  if (isGoogleAuthConfigured()) {
    providers.push(
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  if (isDevLoginEnabled()) {
    providers.push(
      Credentials({
        id: "dev",
        name: "Desk email",
        credentials: {
          email: { label: "Email", type: "email" },
        },
        authorize: async (credentials) => {
          const email = typeof credentials?.email === "string" ? credentials.email : "";
          const user = admitUser({ email, name: email.split("@")[0] ?? email });
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
      if (!row) return token;
      token.userId = row.id;
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
