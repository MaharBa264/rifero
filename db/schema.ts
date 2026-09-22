import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const raffleSettings = sqliteTable("raffle_settings", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  school: text("school").notNull().default("6.º grado"),
  priceCents: integer("price_cents").notNull().default(300000),
  numberCount: integer("number_count").notNull().default(100),
  drawDate: text("draw_date"),
  drawName: text("draw_name").notNull().default("Lotería de la Ciudad — Quiniela"),
  officialUrl: text("official_url").notNull().default("https://www.loteriadelaciudad.gob.ar/"),
  resultNumber: text("result_number"),
  whatsappText: text("whatsapp_text").notNull().default("¡Gracias por colaborar con nuestra rifa!"),
  adminEmails: text("admin_emails").notNull().default("maharba264@gmail.com"),
  adminPinHash: text("admin_pin_hash").notNull().default(""),
  adminRecoveryCodeHash: text("admin_recovery_code_hash"),
  heroTitle: text("hero_title").notNull().default("Ayudanos a hacer algo enorme."),
  heroIntro: text("hero_intro").notNull().default("Cada número suma. Elegí el tuyo con una familia vendedora y guardá el comprobante para el sorteo."),
  logoImageUrl: text("logo_image_url").notNull().default(""),
  heroImageUrl: text("hero_image_url").notNull().default(""),
  fontFamily: text("font_family").notNull().default("Trebuchet MS"),
  primaryColor: text("primary_color").notNull().default("#6d28d9"),
  secondaryColor: text("secondary_color").notNull().default("#ec4899"),
  accentColor: text("accent_color").notNull().default("#fbbf24"),
  backgroundColor: text("background_color").notNull().default("#fff8ed"),
  textColor: text("text_color").notNull().default("#2e1557"),
  updatedAt: text("updated_at").notNull(),
});

export const sellers = sqliteTable("sellers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childName: text("child_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  pinHash: text("pin_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  limitMode: text("limit_mode", { enum: ["range", "count"] }).notNull().default("count"),
  limitFrom: integer("limit_from"),
  limitTo: integer("limit_to"),
  limitCount: integer("limit_count").notNull().default(15),
  mustChangePin: integer("must_change_pin", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const prizes = sqliteTable("prizes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
});

export const raffleNumbers = sqliteTable("raffle_numbers", {
  number: integer("number").primaryKey(),
  status: text("status", { enum: ["available", "reserved", "sold"] }).notNull().default("available"),
  sellerId: integer("seller_id").references(() => sellers.id),
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_raffle_numbers_active_status").on(table.active, table.status),
  index("idx_raffle_numbers_seller_id").on(table.sellerId),
]);

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});
