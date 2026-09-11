import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "../db";
import type { NextAuthConfig } from "next-auth";
import { User } from "next-auth";
import Resend from "next-auth/providers/resend";
import GitHub from "next-auth/providers/github";

declare module "next-auth" {
  interface Session extends User {
    user: {
      id: string;
    } & Session;
  }
}

export const config = {
  adapter: DrizzleAdapter(db),
  session: {
    strategy: "jwt",
  },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: "info@router.so",
      // sendVerificationRequest, -> TODO: send custom email
    }),
    GitHub, // optional GitHub provider
  ],
  callbacks: {
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    authorized: async ({ auth, request }) => {
      const hostname = request.nextUrl.hostname;
      const pathname = request.nextUrl.pathname;
      const isPublicFormSurface =
        hostname === "forms.router.so" ||
        pathname.startsWith("/f/") ||
        pathname.startsWith("/embed/") ||
        pathname.startsWith("/api/public/") ||
        pathname.startsWith("/api/integrations/wordpress/");
      return isPublicFormSurface || !!auth;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/check-email",
  },
} satisfies NextAuthConfig;

export const { auth, handlers, signIn, signOut } = NextAuth(config);
