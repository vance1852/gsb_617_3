import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.APP_PORT || "7651", 10),
  jwtSecret: process.env.JWT_SECRET || "museum-pass-admin-dev-secret-change-me",
  jwtExpiresIn: "12h",
  defaultAdmin: {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
  },
};
