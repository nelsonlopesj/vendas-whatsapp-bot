import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma";

// Adapter com createUser customizado: no PRIMEIRO login OAuth (Google), o
// adapter cria o usuário ANTES do callback signIn — e o model User exige
// tenantId. Aqui criamos tenant + usuário (role admin + trial 7 dias)
// atomicamente para o fluxo funcionar de ponta a ponta.
const prismaAdapter = PrismaAdapter(prisma) as any;
if (prismaAdapter?.createUser) {
  prismaAdapter.createUser = async (data: any) => {
    const email = (data?.email || "").toLowerCase();
    const slugBase =
      email.split("@")[0].replace(/[^a-z0-9]/g, "-").substring(0, 50) || "user";
    const tenant = await prisma.tenant.create({
      data: {
        name: data?.name || email,
        slug: `${slugBase}-${Math.random().toString(36).substring(2, 6)}`,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: data?.name || email.split("@")[0],
        image: data?.image,
        role: "admin",
      },
    });
  };
}

export const authOptions: NextAuthOptions = {
  adapter: prismaAdapter,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tenant: true },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        if (!user.tenant.isActive) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (user.email && account) {
        // O adapter já criou tenant+user para OAuth novo — aqui apenas
        // vincula a conta Google ao usuário existente quando necessário
        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (
          existing &&
          !(await prisma.account.findFirst({
            where: { provider: account.provider, providerAccountId: account.providerAccountId },
          }))
        ) {
          await prisma.account.create({
            data: {
              userId: existing.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email! }, include: { tenant: true } });
        if (dbUser) {
          token.tenantId = dbUser.tenantId;
          token.tenantSlug = dbUser.tenant.slug;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantSlug = token.tenantSlug;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};
