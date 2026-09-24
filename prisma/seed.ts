import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash("password123", 10);

  const client = await prisma.client.upsert({
    where: { code: "ACME" },
    update: {
      isActive: true,
      name: "Acme Corp",
      engagementMode: "BODY_SHOPPING",
    },
    create: {
      name: "Acme Corp",
      code: "ACME",
      isActive: true,
      engagementMode: "BODY_SHOPPING",
      notes: "Primary demo client · body shopping (PM dual-hat)",
    },
  });

  const nova = await prisma.client.upsert({
    where: { code: "NOVA" },
    update: {
      isActive: true,
      name: "Nova Labs",
      engagementMode: "MANAGED",
    },
    create: {
      name: "Nova Labs",
      code: "NOVA",
      isActive: true,
      engagementMode: "MANAGED",
      notes: "Secondary client · managed service (SoD)",
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

  await prisma.project.upsert({
    where: { clientId_code: { clientId: nova.id, code: "CORE" } },
    update: {},
    create: {
      clientId: nova.id,
      name: "Nova Core Platform",
      code: "CORE",
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
    { email: "am@acme.example", name: "Vendor AM", role: "VENDOR_AM" },
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
        isActive: true,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        clientId: u.role === "SYS_ADMIN" ? null : client.id,
        isActive: true,
      },
    });

    if (u.role === "SYS_ADMIN") {
      await prisma.clientMembership.deleteMany({ where: { userId: user.id } });
    } else if (u.role === "CLIENT_PM") {
      // Demo: one PM handles ACME + NOVA (multi-company).
      await prisma.clientMembership.deleteMany({
        where: {
          userId: user.id,
          clientId: { notIn: [client.id, nova.id] },
        },
      });
      await prisma.clientMembership.upsert({
        where: {
          userId_clientId: { userId: user.id, clientId: client.id },
        },
        create: {
          userId: user.id,
          clientId: client.id,
          isPrimary: true,
        },
        update: { isPrimary: true },
      });
      await prisma.clientMembership.upsert({
        where: {
          userId_clientId: { userId: user.id, clientId: nova.id },
        },
        create: {
          userId: user.id,
          clientId: nova.id,
          isPrimary: false,
        },
        update: { isPrimary: false },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { clientId: client.id },
      });
    } else {
      await prisma.clientMembership.deleteMany({
        where: {
          userId: user.id,
          clientId: { not: client.id },
        },
      });
      await prisma.clientMembership.upsert({
        where: {
          userId_clientId: { userId: user.id, clientId: client.id },
        },
        create: {
          userId: user.id,
          clientId: client.id,
          isPrimary: true,
        },
        update: { isPrimary: true },
      });
    }

    if (u.role === "DEVELOPER") {
      await prisma.developer.upsert({
        where: { userId: user.id },
        update: {
          clientId: client.id,
          hourlyRate: 45,
          standardCapacity: 40,
          jobTitle: "Software Developer",
          isActive: true,
          jiraAccountEmail: u.email,
          jiraLinkedAt: new Date(),
          overtimeEligible: u.email === "dev2@acme.example" ? false : true,
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
          jiraAccountEmail: u.email,
          jiraLinkedAt: new Date(),
          overtimeEligible: u.email === "dev2@acme.example" ? false : true,
          notes:
            u.email === "dev2@acme.example"
              ? "Demo lump-sum · OT included in salary (overtimeEligible=false)"
              : undefined,
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

    const leave = await prisma.leaveRequest.create({
      data: {
        developerId: alex.id,
        leaveType: "SICK",
        status: "APPROVED",
        startDate: nextWeek,
        endDate: nextWeek,
        totalDays: 1,
        reason: "Medical appointment — approved sick leave",
      },
    });

    if (jordan) {
      await prisma.coverageAssignment.deleteMany({
        where: { absentDeveloperId: alex.id },
      });
      await prisma.coverageAssignment.create({
        data: {
          clientId: client.id,
          projectId: project.id,
          leaveRequestId: leave.id,
          absentDeveloperId: alex.id,
          coverDeveloperId: jordan.id,
          status: "PLANNED",
          startDate: nextWeek,
          endDate: nextWeek,
          reason: "Jordan covers Alex during approved sick leave",
          notes: "Handover standup tickets in progress",
        },
      });
    }

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

    const pm = await prisma.user.findUnique({
      where: { email: "pm@acme.example" },
    });
    if (pm) {
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      await prisma.monthlyEvaluation.deleteMany({
        where: {
          developerId: { in: [alex.id, ...(jordan ? [jordan.id] : [])] },
          year,
          month,
        },
      });
      await prisma.monthlyEvaluation.create({
        data: {
          developerId: alex.id,
          clientId: client.id,
          evaluatedById: pm.id,
          year,
          month,
          codeQuality: 4.2,
          delivery: 4.0,
          technical: 4.1,
          communication: 3.8,
          professionalism: 4.0,
          totalScore: 4.06,
          comments: "Strong delivery on governance portal",
        },
      });
      if (jordan) {
        await prisma.monthlyEvaluation.create({
          data: {
            developerId: jordan.id,
            clientId: client.id,
            evaluatedById: pm.id,
            year,
            month,
            codeQuality: 3.6,
            delivery: 3.8,
            technical: 3.5,
            communication: 3.7,
            professionalism: 3.9,
            totalScore: 3.66,
            comments: "Solid contributor, keep growing ownership",
          },
        });
        await prisma.performanceAction.deleteMany({
          where: { developerId: jordan.id },
        });
        await prisma.performanceAction.create({
          data: {
            developerId: jordan.id,
            actionType: "REWARD",
            title: "Helpful peer review",
            reason: "Thorough review of scope-swap rules",
            points: 5,
            actionDate: today,
          },
        });
      }
    }
  }

  console.log("Seed complete.");
  console.log("Project:", project.code);
  console.log("Login examples:");
  console.log("  pm@acme.example / password123");
  console.log("  developer@acme.example / password123");

  const seededUsers = await prisma.user.findMany({
    where: {
      email: {
        in: [
          "admin@acme.example",
          "lead@acme.example",
          "developer@acme.example",
          "pm@acme.example",
        ],
      },
    },
  });

  for (const u of seededUsers) {
    await prisma.notification.deleteMany({ where: { userId: u.id } });
  }

  const admin = seededUsers.find((u) => u.email === "admin@acme.example");
  const lead = seededUsers.find((u) => u.email === "lead@acme.example");
  const developer = seededUsers.find(
    (u) => u.email === "developer@acme.example"
  );
  const pm = seededUsers.find((u) => u.email === "pm@acme.example");

  if (admin) {
    await prisma.notification.createMany({
      data: [
        {
          userId: admin.id,
          title: "User access ready",
          body: "Manage roles and activate/deactivate accounts from User access.",
          href: "/access",
          type: "INFO",
        },
        {
          userId: admin.id,
          title: "Coverage sample created",
          body: "Jordan is planned to cover Alex during sick leave.",
          href: "/coverage",
          type: "SUCCESS",
        },
      ],
    });
  }
  if (lead) {
    await prisma.notification.create({
      data: {
        userId: lead.id,
        title: "Pending team actions",
        body: "Review leave coverage and timesheet imports for this week.",
        href: "/timesheets",
        type: "WARNING",
      },
    });
  }
  if (developer) {
    await prisma.notification.create({
      data: {
        userId: developer.id,
        title: "Jira account linked",
        body: "Your Jira email is linked on Personnel. Keep it unique.",
        href: "/personnel",
        type: "SUCCESS",
      },
    });
  }
  if (pm) {
    await prisma.notification.create({
      data: {
        userId: pm.id,
        title: "Leaderboard updated",
        body: "Monthly evaluation scores are available on the leaderboard.",
        href: "/leaderboard",
        type: "INFO",
      },
    });
  }

  // Sample operational tickets (dev + non-dev categories)
  if (pm && alex) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.operationalTicket.deleteMany({
      where: { clientId: client.id, title: { startsWith: "[Seed]" } },
    });
    await prisma.operationalTicket.createMany({
      data: [
        {
          clientId: client.id,
          projectId: project.id,
          workDate: today,
          category: "MANAGE_APPS",
          title: "[Seed] Rotate SSO app secrets",
          description: "Monthly rotation for corporate SSO apps",
          status: "DONE",
          assigneeId: null,
          reporterName: "App Ops Staff",
          reporterEmail: "ops@acme.example",
          createdById: pm.id,
          syncToJira: false,
          syncStatus: "SKIPPED",
        },
        {
          clientId: client.id,
          projectId: project.id,
          workDate: today,
          category: "MANAGE_DEVICE",
          title: "[Seed] MDM enroll laptop",
          description: "New hire device enrollment",
          status: "IN_PROGRESS",
          assigneeId: null,
          reporterName: "Device Admin",
          reporterEmail: "devices@acme.example",
          createdById: pm.id,
          syncToJira: false,
          syncStatus: "SKIPPED",
        },
        {
          clientId: client.id,
          projectId: project.id,
          workDate: today,
          category: "DEVELOPMENT",
          title: "[Seed] Fix login redirect",
          description: "Reproduce and patch redirect loop",
          status: "OPEN",
          assigneeId: alex.id,
          reporterName: null,
          reporterEmail: null,
          createdById: pm.id,
          syncToJira: false,
          syncStatus: "SKIPPED",
        },
      ],
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
