import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash("password123", 10);

  const client = await prisma.client.upsert({
    where: { code: "ACME" },
    update: {},
    create: {
      name: "Acme Corp",
      code: "ACME",
    },
  });

  const project = await prisma.project.upsert({
    where: { clientId_code: { clientId: client.id, code: "PORTAL" } },
    update: {},
    create: {
      clientId: client.id,
      name: "Governance Portal",
      code: "PORTAL",
      isActive: true,
    },
  });

  const users: {
    email: string;
    name: string;
    role: Role;
  }[] = [
    { email: "admin@acme.example", name: "System Admin", role: "SYS_ADMIN" },
    { email: "pm@acme.example", name: "Client PM", role: "CLIENT_PM" },
    { email: "lead@acme.example", name: "Vendor Lead", role: "VENDOR_LEAD" },
    { email: "developer@acme.example", name: "Alex Developer", role: "DEVELOPER" },
    { email: "dev2@acme.example", name: "Jordan Developer", role: "DEVELOPER" },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        passwordHash,
        clientId: u.role === "SYS_ADMIN" ? null : client.id,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        clientId: u.role === "SYS_ADMIN" ? null : client.id,
      },
    });

    if (u.role === "DEVELOPER") {
      await prisma.developer.upsert({
        where: { userId: user.id },
        update: {
          clientId: client.id,
          hourlyRate: 45,
          standardCapacity: 40,
          isActive: true,
        },
        create: {
          userId: user.id,
          clientId: client.id,
          hourlyRate: 45,
          standardCapacity: 40,
          skillTags: ["TypeScript", "React"],
          isActive: true,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("Project:", project.code);
  console.log("Login examples:");
  console.log("  pm@acme.example / password123");
  console.log("  developer@acme.example / password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
