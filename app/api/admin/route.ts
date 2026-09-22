import { apiError, ensureSeed, generateRecoveryCode, getD1, isAdmin, redactAuditPayload, sha256 } from "@/lib/raffle-db";

const COLOR = /^#[0-9a-fA-F]{6}$/;
const FONTS = new Set(["Trebuchet MS", "Arial", "Georgia", "Verdana", "Comic Sans MS"]);
function safeColor(value: unknown, fallback: string) { const color = String(value ?? ""); return COLOR.test(color) ? color : fallback; }
function safeImageUrl(value: unknown) { const url = String(value ?? "").trim(); return !url || url.startsWith("https://") ? url : ""; }

async function requireAdmin(request: Request) {
  const admin = await isAdmin(request);
  if (!admin.ok) throw new Error("ADMIN_REQUIRED");
  return admin;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = getD1();
    const settings = await ensureSeed();
    const [prizes, sellers, numbers, audit] = await Promise.all([
      db.prepare("SELECT * FROM prizes ORDER BY position,id").all(),
      db.prepare("SELECT id,child_name,display_name,active,limit_mode,limit_from,limit_to,limit_count,created_at FROM sellers ORDER BY active DESC,child_name").all(),
      db.prepare("SELECT n.*,s.child_name AS seller_name FROM raffle_numbers n LEFT JOIN sellers s ON s.id=n.seller_id WHERE n.active=1 ORDER BY n.number").all(),
      db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 60").all(),
    ]);
    const { admin_pin_hash: _pin, admin_recovery_code_hash: recoveryHash, ...safeSettings } = settings;
    return Response.json({ settings: { ...safeSettings, admin_recovery_code_set: Boolean(recoveryHash) }, prizes: prizes.results, sellers: sellers.results, numbers: numbers.results, audit: audit.results });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_REQUIRED") return apiError(new Error("Necesitás ingresar como administrador."), 403);
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const db = getD1();
    const now = new Date().toISOString();

    if (action === "settings") {
      const data = body.data as Record<string, unknown>;
      const count = Math.max(10, Math.min(10000, Number(data.number_count) || 100));
      await db.prepare("UPDATE raffle_settings SET title=?,school=?,price_cents=?,number_count=?,draw_date=?,draw_name=?,official_url=?,result_number=?,whatsapp_text=?,admin_emails=?,updated_at=? WHERE id=1")
        .bind(String(data.title ?? "Rifa"), String(data.school ?? ""), Math.max(0, Number(data.price_cents) || 0), count, data.draw_date ? String(data.draw_date) : null, String(data.draw_name ?? ""), String(data.official_url ?? ""), data.result_number ? String(data.result_number) : null, String(data.whatsapp_text ?? ""), String(data.admin_emails ?? ""), now).run();
      const promoRaw = Number(data.promo_pair_price_cents);
      const maxReservedRaw = Number(data.max_reserved_per_seller);
      await db.prepare("UPDATE raffle_settings SET promo_pair_price_cents=?,max_reserved_per_seller=? WHERE id=1")
        .bind(promoRaw > 0 ? promoRaw : null, maxReservedRaw > 0 ? maxReservedRaw : null).run();
      const existing = await db.prepare("SELECT number FROM raffle_numbers ORDER BY number").all<{ number: number }>();
      const known = new Set(existing.results.map((row) => row.number));
      const changes = [];
      for (let number = 0; number < count; number++) {
        changes.push(known.has(number)
          ? db.prepare("UPDATE raffle_numbers SET active=1 WHERE number=?").bind(number)
          : db.prepare("INSERT INTO raffle_numbers (number,status,active,updated_at) VALUES (?,'available',1,?)").bind(number, now));
      }
      changes.push(db.prepare("UPDATE raffle_numbers SET active=0 WHERE number>=?").bind(count));
      for (let i = 0; i < changes.length; i += 50) await db.batch(changes.slice(i, i + 50));
    } else if (action === "design") {
      const data = body.data as Record<string, unknown>;
      const font = FONTS.has(String(data.font_family)) ? String(data.font_family) : "Trebuchet MS";
      await db.prepare("UPDATE raffle_settings SET hero_title=?,hero_intro=?,logo_image_url=?,hero_image_url=?,font_family=?,primary_color=?,secondary_color=?,accent_color=?,background_color=?,text_color=?,updated_at=? WHERE id=1")
        .bind(String(data.hero_title ?? "").slice(0, 120), String(data.hero_intro ?? "").slice(0, 500), safeImageUrl(data.logo_image_url), safeImageUrl(data.hero_image_url), font, safeColor(data.primary_color, "#6d28d9"), safeColor(data.secondary_color, "#ec4899"), safeColor(data.accent_color, "#fbbf24"), safeColor(data.background_color, "#fff8ed"), safeColor(data.text_color, "#2e1557"), now).run();
    } else if (action === "prizes") {
      const prizes = Array.isArray(body.data) ? body.data as Array<Record<string, unknown>> : [];
      await db.prepare("DELETE FROM prizes").run();
      if (prizes.length) await db.batch(prizes.map((p, index) =>
        db.prepare("INSERT INTO prizes (position,title,description,image_url) VALUES (?,?,?,?)")
          .bind(Number(p.position) || index + 1, String(p.title ?? "Premio"), String(p.description ?? ""), String(p.image_url ?? "")),
      ));
    } else if (action === "seller") {
      const data = body.data as Record<string, unknown>;
      const id = Number(data.id) || 0;
      const mode = data.limit_mode === "range" ? "range" : "count";
      const limitFrom = Math.max(0, Number(data.limit_from) || 0);
      const limitTo = Math.max(limitFrom, Number(data.limit_to) || limitFrom);
      const limitCount = Math.max(1, Number(data.limit_count) || 15);
      if (!String(data.child_name ?? "").trim()) return apiError(new Error("Indicá el nombre del alumno."), 400);
      if (id) {
        await db.prepare("UPDATE sellers SET child_name=?,display_name=?,active=?,limit_mode=?,limit_from=?,limit_to=?,limit_count=? WHERE id=?")
          .bind(String(data.child_name ?? "").trim(), String(data.display_name ?? "").trim(), data.active === false ? 0 : 1, mode, mode === "range" ? limitFrom : null, mode === "range" ? limitTo : null, limitCount, id).run();
        if (String(data.pin ?? "").trim()) {
          if (String(data.pin).trim().length < 4) return apiError(new Error("El PIN debe tener al menos 4 caracteres."), 400);
          await db.prepare("UPDATE sellers SET pin_hash=?,must_change_pin=1 WHERE id=?").bind(await sha256(String(data.pin).trim()), id).run();
        }
      } else {
        const pin = String(data.pin ?? "").trim();
        if (pin.length < 4) return apiError(new Error("El PIN debe tener al menos 4 caracteres."), 400);
        await db.prepare("INSERT INTO sellers (child_name,display_name,pin_hash,active,limit_mode,limit_from,limit_to,limit_count,must_change_pin,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)")
          .bind(String(data.child_name ?? "").trim(), String(data.display_name ?? "").trim(), await sha256(pin), 1, mode, mode === "range" ? limitFrom : null, mode === "range" ? limitTo : null, limitCount, now).run();
      }
    } else if (action === "delete_seller") {
      const id = Number((body.data as Record<string, unknown>)?.id);
      if (!id) return apiError(new Error("Vendedor inválido."), 400);
      await db.batch([
        db.prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_last_name=NULL,buyer_phone=NULL,buyer_email=NULL,notes=NULL,price_cents=NULL,updated_at=? WHERE seller_id=?").bind(now, id),
        db.prepare("DELETE FROM sellers WHERE id=?").bind(id),
      ]);
    } else if (action === "number") {
      const data = body.data as Record<string, unknown>;
      const number = Number(data.number);
      const status = ["available", "reserved", "sold"].includes(String(data.status)) ? String(data.status) : "available";
      if (status === "available") {
        await db.prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_last_name=NULL,buyer_phone=NULL,buyer_email=NULL,notes=NULL,price_cents=NULL,updated_at=? WHERE number=?").bind(now, number).run();
      } else {
        await db.prepare("UPDATE raffle_numbers SET status=?,buyer_name=?,buyer_last_name=?,buyer_phone=?,buyer_email=?,updated_at=? WHERE number=?")
          .bind(status, String(data.buyer_name ?? ""), String(data.buyer_last_name ?? ""), String(data.buyer_phone ?? ""), String(data.buyer_email ?? ""), now, number).run();
      }
    } else if (action === "restore") {
      const data = body.data as { settings?: Record<string, unknown>; prizes?: Array<Record<string, unknown>> };
      if (!data?.settings || !Array.isArray(data.prizes)) return apiError(new Error("El archivo de respaldo no tiene el formato esperado."), 400);
      const s = data.settings;
      await db.prepare("UPDATE raffle_settings SET title=?,school=?,price_cents=?,promo_pair_price_cents=?,max_reserved_per_seller=?,number_count=?,draw_date=?,draw_name=?,official_url=?,result_number=?,whatsapp_text=?,admin_emails=?,updated_at=? WHERE id=1")
        .bind(String(s.title), String(s.school), Number(s.price_cents), Number(s.promo_pair_price_cents) > 0 ? Number(s.promo_pair_price_cents) : null, Number(s.max_reserved_per_seller) > 0 ? Number(s.max_reserved_per_seller) : null, Number(s.number_count), s.draw_date ? String(s.draw_date) : null, String(s.draw_name), String(s.official_url), s.result_number ? String(s.result_number) : null, String(s.whatsapp_text), String(s.admin_emails), now).run();
      await db.prepare("DELETE FROM prizes").run();
      if (data.prizes.length) await db.batch(data.prizes.map((p, index) => db.prepare("INSERT INTO prizes (position,title,description,image_url) VALUES (?,?,?,?)").bind(Number(p.position) || index + 1, String(p.title), String(p.description ?? ""), String(p.image_url ?? ""))));
    } else if (action === "admin_pin") {
      const data = body.data as Record<string, unknown>;
      const newPin = String(data.new_admin_pin ?? "").trim();
      if (newPin.length < 8) return apiError(new Error("La clave administradora debe tener al menos 8 caracteres."), 400);
      await db.prepare("UPDATE raffle_settings SET admin_pin_hash=? WHERE id=1").bind(await sha256(newPin)).run();
    } else if (action === "generate_recovery_code") {
      const code = generateRecoveryCode();
      await db.prepare("UPDATE raffle_settings SET admin_recovery_code_hash=? WHERE id=1").bind(await sha256(code)).run();
      await db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
        .bind("admin_generate_recovery_code", admin.email, JSON.stringify({}), now).run();
      return Response.json({ ok: true, code });
    } else if (action === "reset") {
      const mode = String((body.data as Record<string, unknown>)?.mode ?? "sales");
      await db.prepare("UPDATE raffle_numbers SET status='available',seller_id=NULL,buyer_name=NULL,buyer_last_name=NULL,buyer_phone=NULL,buyer_email=NULL,notes=NULL,price_cents=NULL,updated_at=?").bind(now).run();
      if (mode === "factory") {
        await db.batch([
          db.prepare("DELETE FROM sellers"),
          db.prepare("DELETE FROM prizes"),
          db.prepare("UPDATE raffle_settings SET title='La gran rifa de 6.º',school='6.º grado',price_cents=300000,promo_pair_price_cents=NULL,max_reserved_per_seller=NULL,number_count=100,draw_date=NULL,draw_name='Lotería de la Ciudad — Quiniela',official_url='https://www.loteriadelaciudad.gob.ar/',result_number=NULL,whatsapp_text='¡Gracias por colaborar con nuestra rifa!',admin_emails='',hero_title='Ayudanos a hacer algo enorme.',hero_intro='Cada número suma. Elegí el tuyo con una familia vendedora y guardá el comprobante para el sorteo.',logo_image_url='',hero_image_url='',font_family='Trebuchet MS',primary_color='#6d28d9',secondary_color='#ec4899',accent_color='#fbbf24',background_color='#fff8ed',text_color='#2e1557',updated_at=? WHERE id=1").bind(now),
          db.prepare("UPDATE raffle_numbers SET active=CASE WHEN number<100 THEN 1 ELSE 0 END"),
        ]);
      }
    } else {
      return apiError(new Error("Acción no reconocida."), 400);
    }

    await db.prepare("INSERT INTO audit_log (action,actor,payload,created_at) VALUES (?,?,?,?)")
      .bind(`admin_${action}`, admin.email, JSON.stringify(redactAuditPayload(body.data ?? {})), now).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_REQUIRED") return apiError(new Error("Necesitás ingresar como administrador."), 403);
    return apiError(error);
  }
}
