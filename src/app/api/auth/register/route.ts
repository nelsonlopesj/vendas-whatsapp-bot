import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, businessName, whatsappNumber } =
      await req.json();

    // Validate
    if (!name || !email || !password || !businessName || !whatsappNumber) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 8 caracteres." },
        { status: 400 }
      );
    }

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Este email já está em uso." },
        { status: 400 }
      );
    }

    // Generate slug from business name
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);

    // Check if slug is taken
    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    const finalSlug = existingTenant
      ? `${slug}-${Math.random().toString(36).substring(2, 6)}`
      : slug;

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create tenant + user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: businessName,
          slug: finalSlug,
          whatsappNumber,
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name,
          password: hashedPassword,
          // "admin" (não owner): owner é reservado ao master da plataforma —
          // clientes nascem com trial/cobrança ativos e SEM acesso ao admin
          role: "admin",
        },
      });

      return { tenant, user };
    });

    return NextResponse.json(
      {
        message: "Conta criada com sucesso!",
        tenantSlug: result.tenant.slug,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Erro interno ao criar conta." },
      { status: 500 }
    );
  }
}
