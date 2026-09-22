import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const raffleSettings = sqliteTable("raffle_settings", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  school: text("school").notNull().default("6.º grado"),
  priceCents: integer("price_cents").notNull().default(300000),
  promoPairPriceCents: integer("promo_pair_price_cents"),
  maxReservedPerSeller: integer("max_reserved_per_seller"),
  startNumber: integer("start_number").notNull().default(0),
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

  // --- Official lottery draw resolution ---
  drawResolutionMethod: text("draw_resolution_method", { enum: ["direct", "official_lottery_mapping"] }).notNull().default("direct"),
  officialLotteryName: text("official_lottery_name"),
  officialDrawName: text("official_draw_name"),
  officialDrawDate: text("official_draw_date"),
  officialDrawUrl: text("official_draw_url"),
  officialResultCount: integer("official_result_count").default(20),
  officialResultDigits: integer("official_result_digits").default(4),
  mappingNumberCount: integer("mapping_number_count"),
  mappingStartNumber: integer("mapping_start_number"),
  mappingResultSpace: integer("mapping_result_space").default(10000),
  mappingValidResultLimit: integer("mapping_valid_result_limit"),
  drawResolutionNote: text("draw_resolution_note").notNull().default("Se toma la primera posición válida del extracto oficial."),
  unclaimedWinnerPolicy: text("unclaimed_winner_policy", { enum: ["no_winner", "next_valid_official_position"] }).notNull().default("no_winner"),
  showWinnerBuyerName: integer("show_winner_buyer_name", { mode: "boolean" }).notNull().default(false),

  rosterClosedAt: text("roster_closed_at"),
  rosterHash: text("roster_hash"),
  rosterSoldCount: integer("roster_sold_count"),

  activeDrawResolutionId: integer("active_draw_resolution_id"),

  updatedAt: text("updated_at").notNull(),
});

export const drawResolutions = sqliteTable("draw_resolutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  officialResultsJson: text("official_results_json").notNull(),
  discardedJson: text("discarded_json").notNull(),
  positionUsed: integer("position_used"),
  officialResultUsed: integer("official_result_used"),
  winnerNumber: integer("winner_number"),
  winnerWasSold: integer("winner_was_sold", { mode: "boolean" }),
  status: text("status", { enum: ["resolved", "exhausted"] }).notNull(),
  unclaimedPolicy: text("unclaimed_policy").notNull(),
  formula: text("formula"),
  correctionOf: integer("correction_of"),
  correctionReason: text("correction_reason"),
  resolvedBy: text("resolved_by").notNull(),
  createdAt: text("created_at").notNull(),
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
  deletedAt: text("deleted_at"),
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
  buyerLastName: text("buyer_last_name"),
  buyerPhone: text("buyer_phone"),
  buyerEmail: text("buyer_email"),
  notes: text("notes"),
  priceCents: integer("price_cents"),
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
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  subjectType: text("subject_type", { enum: ["admin", "seller"] }).notNull(),
  subjectId: integer("subject_id"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  revokedAt: text("revoked_at"),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (table) => [
  index("idx_sessions_subject").on(table.subjectType, table.subjectId),
  index("idx_sessions_expires").on(table.expiresAt),
]);

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  identity: text("identity").notNull(),
  ip: text("ip").notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_login_attempts_identity").on(table.identity, table.createdAt),
  index("idx_login_attempts_ip").on(table.ip, table.createdAt),
]);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  idKey: text("id_key").primaryKey(),
  scope: text("scope").notNull(),
  statusCode: integer("status_code").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});
