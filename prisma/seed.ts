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
          jobTitle: "Software Developer",
          isActive: true,
        },
        create: {
          userId: user.id,
          clientId: client.id,
          hourlyRate: 45,
          standardCapacity: 40,
          jobTitle: "Software Developer",
          startDate: new Date(),
          skillTags: ["TypeScript", "React"],
          isActive: true,
        },
      });
    }
  }

  const alex = await prisma.developer.findFirst({
    where: { user: { email: "developer@acme.example" } },
  });
  const jordan = await prisma.developer.findFirst({
    where: { user: { email: "dev2@acme.example" } },
  });

  if (alex) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 5);

    await prisma.timesheet.deleteMany({
      where: {
        developerId: {
          in: [alex.id, jordan?.id].filter(Boolean) as string[],
        },
      },
    });

    await prisma.timesheet.createMany({
      data: [
        {
          developerId: alex.id,
          projectId: project.id,
          workDate: yesterday,
          hours: 8,
          taskSummary: "Built timesheet CRUD and RBAC checks",
          isOvertime: false,
        },
        {
          developerId: alex.id,
          projectId: project.id,
          workDate: today,
          hours: 6,
          taskSummary: "Polished dense UI for governance portal",
          isOvertime: false,
        },
        ...(jordan
          ? [
              {
                developerId: jordan.id,
                projectId: project.id,
                workDate: today,
                hours: 7.5,
                taskSummary: "Reviewed scope swap validation rules",
                isOvertime: false,
              },
            ]
          : []),
      ],
    });

    await prisma.leaveRequest.deleteMany({
      where: { developerId: alex.id },
    });

    await prisma.leaveRequest.create({
      data: {
        developerId: alex.id,
        leaveType: "ANNUAL_LEAVE",
        status: "PENDING",
        startDate: nextWeek,
        endDate: nextWeek,
        totalDays: 1,
        reason: "Family event — requesting one day annual leave",
      },
    });

    const skillCatalog = [
      { name: "TypeScript", category: "Language" },
      { name: "React", category: "Frontend" },
      { name: "PostgreSQL", category: "Database" },
      { name: "System Design", category: "Architecture" },
    ];

    for (const s of skillCatalog) {
      const category = await prisma.skillCategory.upsert({
        where: { name: s.category },
        update: { isActive: true },
        create: { name: s.category, isActive: true },
      });

      await prisma.skill.upsert({
        where: {
          categoryId_name: { categoryId: category.id, name: s.name },
        },
        update: { isActive: true },
        create: {
          name: s.name,
          categoryId: category.id,
          isActive: true,
        },
      });
    }

    const language = await prisma.skillCategory.findUnique({
      where: { name: "Language" },
    });
    const frontend = await prisma.skillCategory.findUnique({
      where: { name: "Frontend" },
    });
    const ts =
      language &&
      (await prisma.skill.findUnique({
        where: {
          categoryId_name: { categoryId: language.id, name: "TypeScript" },
        },
      }));
    const react =
      frontend &&
      (await prisma.skill.findUnique({
        where: {
          categoryId_name: { categoryId: frontend.id, name: "React" },
        },
      }));

    if (ts) {
      await prisma.developerSkill.upsert({
        where: {
          developerId_skillId: { developerId: alex.id, skillId: ts.id },
        },
        update: { level: "ADVANCED", yearsExp: 4 },
        create: {
          developerId: alex.id,
          skillId: ts.id,
          level: "ADVANCED",
          yearsExp: 4,
        },
      });
    }
    if (react) {
      await prisma.developerSkill.upsert({
        where: {
          developerId_skillId: { developerId: alex.id, skillId: react.id },
        },
        update: { level: "INTERMEDIATE", yearsExp: 3 },
        create: {
          developerId: alex.id,
          skillId: react.id,
          level: "INTERMEDIATE",
          yearsExp: 3,
        },
      });
    }

    await prisma.training.deleteMany({ where: { developerId: alex.id } });
    await prisma.training.create({
      data: {
        developerId: alex.id,
        title: "Advanced TypeScript Patterns",
        provider: "Frontend Masters",
        status: "IN_PROGRESS",
        startDate: today,
        endDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
        hours: 12,
        skillFocus: "TypeScript",
        location: "Online · Zoom",
        notes: "Self-paced with weekly office hours",
      },
    });
    await prisma.training.create({
      data: {
        developerId: alex.id,
        title: "PostgreSQL Performance Tuning",
        provider: "Internal L&D",
        status: "PLANNED",
        startDate: nextWeek,
        endDate: nextWeek,
        hours: 4,
        skillFocus: "PostgreSQL",
        location: "Meeting Room B",
      },
    });

    await prisma.coaching.deleteMany({ where: { developerId: alex.id } });
    await prisma.coaching.create({
      data: {
        developerId: alex.id,
        coachName: "Vendor Lead",
        topic: "Delivery ownership & estimation",
        status: "SCHEDULED",
        sessionDate: nextWeek,
        durationMin: 45,
      },
    });

    await prisma.performanceAction.deleteMany({
      where: { developerId: alex.id },
    });
    await prisma.performanceAction.create({
      data: {
        developerId: alex.id,
        actionType: "REWARD",
        title: "Sprint MVP",
        reason: "Delivered governance portal MVP ahead of schedule",
        points: 10,
        actionDate: today,
      },
    });
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
