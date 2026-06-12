import { config } from "./config";
import { hashPassword } from "./auth";
import { prisma } from "./prisma";

/** 初始化内置管理员与种子业务数据（幂等）。 */
async function seed() {
  const adminExists = await prisma.user.findUnique({
    where: { username: config.defaultAdmin.username },
  });
  if (!adminExists) {
    await prisma.user.create({
      data: {
        username: config.defaultAdmin.username,
        passwordHash: hashPassword(config.defaultAdmin.password),
        displayName: "平台管理员",
      },
    });
  }

  const museumCount = await prisma.museum.count();
  if (museumCount === 0) {
    const museums = await prisma.$transaction([
      prisma.museum.create({
        data: {
          name: "金陵历史博物馆",
          address: "中山东路 321 号",
          dailyCapacity: 800,
          status: "open",
        },
      }),
      prisma.museum.create({
        data: {
          name: "德基艺术博物馆",
          address: "中山路 18 号",
          dailyCapacity: 500,
          status: "open",
        },
      }),
      prisma.museum.create({
        data: {
          name: "黄河文化主题馆",
          address: "滨河大道 9 号",
          dailyCapacity: 600,
          status: "maintenance",
        },
      }),
      prisma.museum.create({
        data: {
          name: "近代工业遗产馆",
          address: "工农路 77 号",
          dailyCapacity: 300,
          status: "open",
        },
      }),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    await prisma.reservation.createMany({
      data: [
        {
          museumId: museums[0].id,
          visitorName: "张敏",
          phone: "13800001111",
          visitDate: today,
          timeSlot: "am",
          passType: "annual",
          status: "booked",
        },
        {
          museumId: museums[0].id,
          visitorName: "李伟",
          phone: "13800002222",
          visitDate: today,
          timeSlot: "pm",
          passType: "single",
          status: "visited",
        },
        {
          museumId: museums[1].id,
          visitorName: "王芳",
          phone: "13800003333",
          visitDate: today,
          timeSlot: "am",
          passType: "annual",
          status: "booked",
        },
        {
          museumId: museums[3].id,
          visitorName: "赵强",
          phone: "13800004444",
          visitDate: today,
          timeSlot: "pm",
          passType: "single",
          status: "cancelled",
        },
      ],
    });
  }

  console.log("seed done");
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
