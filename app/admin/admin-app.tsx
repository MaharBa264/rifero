"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, DatabaseBackup, Download, Eye, EyeOff, Gift, KeyRound, Lock, LogOut, Palette, Plus, RotateCcw, Save, Settings, ShieldCheck, Ticket, Trash2, Trophy, Users } from "lucide-react";
import { computeMappingParams, getOfficialEquivalentNumbers, validateFairness } from "@/lib/lottery-draw";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = Record<string, unknown>;
type AdminData = { settings: Row; prizes: Row[]; sellers: Row[]; numbers: Row[]; audit: Row[] };

export function AdminApp() {
  const [data, setData] = useState<AdminData | null>(null); const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [keyInput, setKeyInput] = useState(""); const [loginError, setLoginError] = useState(""); const [loggingIn, setLoggingIn] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const load = async (deleted = includeDeleted) => { const r = await fetch(`/api/admin?include_deleted=${deleted ? "1" : "0"}`, { cache: "no-store" }); const b = await r.json(); if (r.ok) { setData(b); setError(""); } else setData(null); return r.ok; };
  useEffect(() => { queueMicrotask(async () => { await load(); setChecking(false); }); }, []);
  function toggleDeleted(next: boolean) { setIncludeDeleted(next); void load(next); }

  async function login(event: React.FormEvent) {
    event.preventDefault(); setLoginError(""); setLoggingIn(true);
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: keyInput }) });
    const b = await r.json(); setLoggingIn(false);
    if (!r.ok) return setLoginError(b.error ?? "Clave incorrecta.");
    setKeyInput(""); await load();
  }
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); setData(null); }

  async function save(action: string, payload: unknown) {
    setMessage(""); setError("");
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, data: payload }) });
    const b = await r.json();
    if (!r.ok) return setError(b.error ?? "No se pudo guardar.");
    setMessage(action === "delete_seller" ? "Vendedor desactivado y sus números liberados (las ventas confirmadas quedan intactas)" : action === "restore_seller" ? "Vendedor restaurado" : action === "reset" ? "Reinicio completado" : action === "admin_pin" ? "Clave actualizada" : action === "draw_config" ? "Método de sorteo guardado" : "Cambios guardados");
    await load();
  }
  async function closeRoster(): Promise<{ hash: string; soldCount: number } | null> {
    setMessage(""); setError("");
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close_roster" }) });
    const b = await r.json();
    if (!r.ok) { setError(b.error ?? "No se pudo cerrar el padrón."); return null; }
    setMessage("Padrón cerrado");
    await load();
    return { hash: b.hash, soldCount: b.soldCount };
  }
  async function resolveDraw(payload: Row): Promise<Row | null> {
    setMessage(""); setError("");
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resolve_draw", data: payload }) });
    const b = await r.json();
    if (!r.ok) { setError(b.error ?? "No se pudo resolver el sorteo."); return null; }
    setMessage("Sorteo resuelto");
    await load();
    return b.resolution as Row;
  }
  async function generateRecoveryCode(): Promise<string | null> {
    setMessage(""); setError("");
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate_recovery_code" }) });
    const b = await r.json();
    if (!r.ok) { setError(b.error ?? "No se pudo generar el código."); return null; }
    await load();
    return String(b.code);
  }
  async function download(format: "json" | "csv") { const r = await fetch(`/api/admin/backup?format=${format}`); if (!r.ok) return setError("No se pudo generar el respaldo."); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `rifa-${new Date().toISOString().slice(0,10)}.${format}`; a.click(); URL.revokeObjectURL(url); }

  if (checking) return <main className="min-h-screen grid place-items-center bg-[#fff8ed]"/>;
  if (!data) return <main className="min-h-screen grid place-items-center bg-[#fff8ed] p-6"><form onSubmit={login} className="w-full max-w-md rounded-[2rem] border-2 border-violet-200 bg-white p-8 text-center shadow-[8px_8px_0_#ddd6fe]"><div className="text-5xl">🔐</div><h1 className="mt-4 text-3xl font-black text-violet-950">Administración</h1><p className="mt-3 text-violet-600">Ingresá la clave propia de esta rifa. No necesitás una cuenta de ChatGPT.</p><Label htmlFor="admin-key" className="mt-6 block text-left">Clave administradora</Label><Input id="admin-key" type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} className="mt-2" autoComplete="current-password"/>{loginError && <p className="mt-3 text-sm font-bold text-pink-600">{loginError}</p>}<Button type="submit" disabled={loggingIn} className="mt-5 w-full bg-violet-600">Ingresar</Button><RecoverAccess onRecovered={() => void load()}/><Link href="/" className="mt-4 block text-sm font-bold text-violet-600">Volver a la rifa</Link></form></main>;
  const soldNumbers = data.numbers.filter((n) => n.status === "sold"); const sold = soldNumbers.length; const reserved = data.numbers.filter((n) => n.status === "reserved").length;
  const revenueCents = soldNumbers.reduce((sum, n) => sum + (Number(n.price_cents) || Number(data.settings.price_cents)), 0);
  return <main className="min-h-screen bg-[#f6f2ff] text-violet-950"><header className="border-b border-violet-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><Link href="/" aria-label="Volver"><Button variant="outline" size="icon"><ArrowLeft/></Button></Link><div><h1 className="text-xl font-black">Panel de la rifa</h1><p className="text-sm text-violet-500">Sesión de administrador activa</p></div></div><div className="flex gap-2"><div className="hidden gap-2 sm:flex"><Button variant="outline" onClick={() => void download("json")}><DatabaseBackup/> JSON</Button><Button variant="outline" onClick={() => void download("csv")}><Download/> CSV</Button></div><Button variant="ghost" size="icon" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut/></Button></div></div></header>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="mb-7 grid gap-3 sm:grid-cols-3"><Stat label="Vendidos" value={sold} color="bg-pink-500"/><Stat label="Reservados" value={reserved} color="bg-amber-400"/><Stat label="Recaudación confirmada" value={new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(revenueCents / 100)} color="bg-violet-600"/></div>{message && <p className="mb-5 rounded-xl bg-emerald-100 p-3 font-bold text-emerald-800">✓ {message}</p>}{error && <p className="mb-5 rounded-xl bg-pink-100 p-3 font-bold text-pink-800">{error}</p>}
      <Tabs defaultValue="settings"><TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl bg-white p-2"><TabsTrigger value="settings"><Settings/> General</TabsTrigger><TabsTrigger value="design"><Palette/> Diseño</TabsTrigger><TabsTrigger value="prizes"><Gift/> Premios</TabsTrigger><TabsTrigger value="sellers"><Users/> Vendedores</TabsTrigger><TabsTrigger value="numbers"><Ticket/> Números</TabsTrigger><TabsTrigger value="draw"><Trophy/> Sorteo</TabsTrigger><TabsTrigger value="security"><ShieldCheck/> Seguridad</TabsTrigger><TabsTrigger value="backup"><DatabaseBackup/> Respaldos y reinicio</TabsTrigger></TabsList>
        <TabsContent value="settings"><SettingsForm initial={data.settings} onSave={(v) => save("settings", v)}/></TabsContent>
        <TabsContent value="design"><DesignForm initial={data.settings} onSave={(v) => save("design", v)}/></TabsContent>
        <TabsContent value="prizes"><PrizesForm initial={data.prizes} onSave={(v) => save("prizes", v)}/></TabsContent>
        <TabsContent value="sellers"><SellersForm sellers={data.sellers} includeDeleted={includeDeleted} onToggleDeleted={toggleDeleted} onSave={(v) => save("seller", v)} onDelete={(id) => save("delete_seller", { id })} onRestore={(id) => save("restore_seller", { id })}/></TabsContent>
        <TabsContent value="numbers"><NumbersPanel numbers={data.numbers} onRelease={(n) => save("number", { number: n, status: "available" })}/></TabsContent>
        <TabsContent value="draw"><DrawForm settings={data.settings} onSaveConfig={(v) => save("draw_config", v)} onCloseRoster={closeRoster} onResolve={resolveDraw}/></TabsContent>
        <TabsContent value="security"><SecurityForm recoveryCodeSet={Boolean(data.settings.admin_recovery_code_set)} onChangePin={(v) => save("admin_pin", v)} onGenerateRecoveryCode={generateRecoveryCode}/></TabsContent>
        <TabsContent value="backup"><BackupPanel onRestore={(v) => save("restore", v)} onDownload={download} onReset={(mode) => save("reset", { mode })}/></TabsContent>
      </Tabs></div></main>;
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) { return <div className="rounded-2xl bg-white p-5 shadow-sm"><span className={`mb-3 block h-2 w-12 rounded-full ${color}`}/><strong className="block text-3xl font-black">{value}</strong><span className="text-sm font-bold text-violet-500">{label}</span></div>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: unknown; onChange: (v: string) => void; type?: string }) { return <div><Label>{label}</Label><Input type={type} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="mt-2 bg-white"/></div>; }

function SettingsForm({ initial, onSave }: { initial: Row; onSave: (v: Row) => void }) {
  const [v, setV] = useState(initial); const set = (key: string, value: unknown) => setV((old) => ({ ...old, [key]: value }));
  return <section className="admin-card"><h2 className="admin-title">Datos generales</h2><div className="grid gap-4 md:grid-cols-2"><Field label="Nombre de la rifa" value={v.title} onChange={(x) => set("title", x)}/><Field label="Curso / institución" value={v.school} onChange={(x) => set("school", x)}/><Field label="Precio en centavos (300000 = $3.000)" value={v.price_cents} onChange={(x) => set("price_cents", Number(x))} type="number"/><Field label="Promo x2 números, precio total en centavos (vacío = sin promo)" value={v.promo_pair_price_cents} onChange={(x) => set("promo_pair_price_cents", x ? Number(x) : null)} type="number"/><Field label="Tope de números reservados sin vender, por vendedor (vacío = sin tope)" value={v.max_reserved_per_seller} onChange={(x) => set("max_reserved_per_seller", x ? Number(x) : null)} type="number"/><Field label="Número inicial (ej.: 0 o 1)" value={v.start_number} onChange={(x) => set("start_number", Number(x))} type="number"/><Field label="Cantidad de números" value={v.number_count} onChange={(x) => set("number_count", Number(x))} type="number"/><Field label="Fecha del sorteo" value={v.draw_date} onChange={(x) => set("draw_date", x)} type="date"/><Field label="Sorteo oficial" value={v.draw_name} onChange={(x) => set("draw_name", x)}/><Field label="URL de resultados oficiales" value={v.official_url} onChange={(x) => set("official_url", x)}/><Field label="Número ganador (cuando se conozca)" value={v.result_number} onChange={(x) => set("result_number", x)}/><div><Label>Mensaje del comprobante</Label><Textarea value={String(v.whatsapp_text ?? "")} onChange={(e) => set("whatsapp_text", e.target.value)} className="mt-2 bg-white"/></div></div><Button onClick={() => onSave(v)} className="mt-6 bg-violet-600"><Save/> Guardar configuración</Button></section>;
}

function DesignForm({ initial, onSave }: { initial: Row; onSave: (v: Row) => void }) {
  const [v, setV] = useState(initial); const set = (key: string, value: unknown) => setV((old) => ({ ...old, [key]: value }));
  const colors = [["primary_color","Color principal"],["secondary_color","Color secundario"],["accent_color","Color de acento"],["background_color","Fondo"],["text_color","Texto"]];
  return <section className="admin-card"><h2 className="admin-title">Diseño de la página</h2><p className="mt-2 text-violet-600">Personalizá textos, imágenes, tipografía y colores. Las imágenes deben estar publicadas en una dirección HTTPS.</p><div className="mt-5 grid gap-6 lg:grid-cols-2"><div className="grid gap-4"><Field label="Título principal" value={v.hero_title} onChange={(x) => set("hero_title", x)}/><div><Label>Texto de presentación</Label><Textarea value={String(v.hero_intro ?? "")} onChange={(e) => set("hero_intro", e.target.value)} className="mt-2 bg-white"/></div><Field label="URL del logo" value={v.logo_image_url} onChange={(x) => set("logo_image_url", x)}/><Field label="URL de la imagen principal" value={v.hero_image_url} onChange={(x) => set("hero_image_url", x)}/><div><Label>Tipografía</Label><Select value={String(v.font_family ?? "Trebuchet MS")} onValueChange={(x) => set("font_family", x)}><SelectTrigger className="mt-2 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent>{["Trebuchet MS","Arial","Georgia","Verdana","Comic Sans MS"].map((font) => <SelectItem key={font} value={font}>{font}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3">{colors.map(([key,label]) => <div key={key}><Label>{label}</Label><div className="mt-2 flex gap-2"><Input type="color" value={String(v[key] ?? "#000000")} onChange={(e) => set(key,e.target.value)} className="h-10 w-14 p-1"/><Input value={String(v[key] ?? "")} onChange={(e) => set(key,e.target.value)}/></div></div>)}</div></div><div className="rounded-[2rem] p-7 shadow-xl" style={{ background: String(v.background_color), color: String(v.text_color), fontFamily: String(v.font_family) }}><div className="flex items-center gap-3">{v.logo_image_url ? <img src={String(v.logo_image_url)} alt="Vista previa del logo" className="h-14 w-14 rounded-2xl object-cover"/> : <Ticket className="h-12 w-12" style={{ color: String(v.primary_color) }}/>}<strong>{String(initial.title)}</strong></div>{v.hero_image_url && <img src={String(v.hero_image_url)} alt="Vista previa" className="mt-6 aspect-video w-full rounded-2xl object-cover"/>}<h3 className="mt-6 text-4xl font-black" style={{ color: String(v.primary_color) }}>{String(v.hero_title)}</h3><p className="mt-3 text-lg">{String(v.hero_intro)}</p><span className="mt-5 inline-block rounded-full px-4 py-2 font-black" style={{ background: String(v.accent_color), color: String(v.text_color) }}>Vista previa</span></div></div><Button onClick={() => onSave(v)} className="mt-6 bg-violet-600"><Save/> Guardar diseño</Button></section>;
}

function PrizesForm({ initial, onSave }: { initial: Row[]; onSave: (v: Row[]) => void }) {
  const [items, setItems] = useState(initial); const patch = (i: number, key: string, value: unknown) => setItems((old) => old.map((p, x) => x === i ? { ...p, [key]: value } : p));
  return <section className="admin-card"><div className="flex items-center justify-between"><h2 className="admin-title">Premios y orden</h2><Button variant="outline" onClick={() => setItems((old) => [...old, { position: old.length + 1, title: "Nuevo premio", description: "", image_url: "" }])}><Plus/> Agregar</Button></div><div className="mt-5 grid gap-4">{items.map((p, i) => <div key={i} className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 md:grid-cols-[100px_1fr_1fr]"><Field label="Orden" value={p.position} onChange={(x) => patch(i, "position", Number(x))} type="number"/><Field label="Premio" value={p.title} onChange={(x) => patch(i, "title", x)}/><Field label="URL de imagen" value={p.image_url} onChange={(x) => patch(i, "image_url", x)}/><div className="md:col-span-3"><Label>Descripción</Label><Textarea value={String(p.description ?? "")} onChange={(e) => patch(i, "description", e.target.value)} className="mt-2 bg-white"/></div><Button variant="ghost" className="text-pink-600" onClick={() => setItems((old) => old.filter((_, x) => x !== i))}>Quitar premio</Button></div>)}</div><Button onClick={() => onSave(items)} className="mt-6 bg-violet-600"><Save/> Guardar premios</Button></section>;
}

function SellerEditor({ seller, onSave, onDelete, onRestore }: { seller: Row; onSave: (v: Row) => void; onDelete?: (id: number) => void; onRestore?: (id: number) => void }) {
  const [v, setV] = useState(seller); const set = (key: string, value: unknown) => setV((old) => ({ ...old, [key]: value })); const isNew = !v.id; const mode = String(v.limit_mode ?? "count");
  const deleted = Boolean(v.deleted_at);
  return <div className={`rounded-2xl border p-4 ${deleted ? "border-pink-200 bg-pink-50/50 opacity-75" : "border-violet-200 bg-white"}`}><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><Field label="Nombre del alumno" value={v.child_name} onChange={(x) => set("child_name",x)}/><Field label="Nombre visible" value={v.display_name} onChange={(x) => set("display_name",x)}/><Field label={isNew ? "PIN inicial" : "Nuevo PIN (opcional)"} value={v.pin} onChange={(x) => set("pin",x)} type="password"/><div><Label>Tipo de límite</Label><Select value={mode} onValueChange={(x) => set("limit_mode",x)}><SelectTrigger className="mt-2 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="count">Cantidad máxima</SelectItem><SelectItem value="range">Rango de números</SelectItem></SelectContent></Select></div>{mode === "range" ? <><Field label="Desde" value={v.limit_from} onChange={(x) => set("limit_from",Number(x))} type="number"/><Field label="Hasta" value={v.limit_to} onChange={(x) => set("limit_to",Number(x))} type="number"/></> : <Field label="Máximo de números" value={v.limit_count ?? 15} onChange={(x) => set("limit_count",Number(x))} type="number"/>}</div>{deleted && <p className="mt-3 text-sm font-bold text-pink-700">Eliminado el {String(v.deleted_at).slice(0,10)} — sus ventas confirmadas se conservan en el historial.</p>}<div className="mt-4 flex flex-wrap gap-2">{!deleted && <Button className="bg-violet-600" onClick={() => onSave(v)}><Save/> {isNew ? "Crear vendedor" : "Guardar vendedor"}</Button>}{!isNew && !deleted && <Button variant="outline" onClick={() => { const next = { ...v, active: !v.active }; setV(next); onSave(next); }}>{v.active ? "Desactivar" : "Activar"}</Button>}{!isNew && !deleted && onDelete && <ConfirmButton title={`¿Eliminar a ${String(v.child_name)}?`} description="Se conserva en el historial junto con sus ventas confirmadas; solo se liberan sus reservas pendientes y deja de poder ingresar." action="Eliminar vendedor" onConfirm={() => onDelete(Number(v.id))}><Trash2/> Eliminar</ConfirmButton>}{deleted && onRestore && <Button variant="outline" onClick={() => onRestore(Number(v.id))}>Restaurar</Button>}</div></div>;
}
function SellersForm({ sellers, includeDeleted, onToggleDeleted, onSave, onDelete, onRestore }: { sellers: Row[]; includeDeleted: boolean; onToggleDeleted: (v: boolean) => void; onSave: (v: Row) => void; onDelete: (id: number) => void; onRestore: (id: number) => void }) {
  return <section className="admin-card"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="admin-title">Usuarios vendedores</h2><Button variant="outline" size="sm" onClick={() => onToggleDeleted(!includeDeleted)}>{includeDeleted ? <EyeOff/> : <Eye/>} {includeDeleted ? "Ocultar eliminados" : "Ver eliminados"}</Button></div><p className="mt-2 text-violet-600">Cada usuario puede tener un máximo total o un rango exclusivo. El límite se controla al guardar cada venta.</p><div className="mt-5 rounded-2xl bg-violet-50 p-4"><h3 className="mb-3 font-black">Nuevo vendedor</h3><SellerEditor seller={{ child_name: "", display_name: "", pin: "", active: true, limit_mode: "count", limit_count: 15 }} onSave={onSave}/></div><div className="mt-5 grid gap-4">{sellers.map((seller) => <SellerEditor key={String(seller.id)} seller={seller} onSave={onSave} onDelete={onDelete} onRestore={onRestore}/>)}</div></section>;
}
function ConfirmButton({ title, description, action, onConfirm, children, destructive = true }: { title: string; description: string; action: string; onConfirm: () => void; children: React.ReactNode; destructive?: boolean }) { return <AlertDialog><AlertDialogTrigger asChild><Button variant={destructive ? "destructive" : "outline"}>{children}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }
function NumbersPanel({ numbers, onRelease }: { numbers: Row[]; onRelease: (n: number) => void }) { return <section className="admin-card"><h2 className="admin-title">Reservas y ventas</h2><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Número</th><th className="p-3">Estado</th><th className="p-3">Comprador</th><th className="p-3">Contacto</th><th className="p-3">Vendedor</th><th className="p-3"></th></tr></thead><tbody>{numbers.filter((n) => n.status !== "available").map((n) => <tr key={String(n.number)} className="border-b border-violet-100"><td className="p-3 text-lg font-black">{String(n.number).padStart(2,"0")}</td><td className="p-3">{String(n.status)}</td><td className="p-3">{[n.buyer_name, n.buyer_last_name].filter(Boolean).join(" ")}</td><td className="p-3 text-xs">{[n.buyer_phone, n.buyer_email].filter(Boolean).join(" · ")}</td><td className="p-3">{String(n.seller_name ?? "")}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => onRelease(Number(n.number))}><RotateCcw/> Liberar</Button></td></tr>)}</tbody></table></div></section>; }
function SecurityForm({ recoveryCodeSet, onChangePin, onGenerateRecoveryCode }: { recoveryCodeSet: boolean; onChangePin: (v: Row) => void; onGenerateRecoveryCode: () => Promise<string | null> }) {
  const [pin, setPin] = useState(""); const [confirm, setConfirm] = useState(""); const [pinError, setPinError] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null); const [generating, setGenerating] = useState(false);
  function submitPin(event: React.FormEvent) {
    event.preventDefault(); setPinError("");
    if (pin.trim().length < 8) return setPinError("La clave debe tener al menos 8 caracteres.");
    if (pin !== confirm) return setPinError("Las claves no coinciden.");
    onChangePin({ new_admin_pin: pin.trim() }); setPin(""); setConfirm("");
  }
  async function generate() { setGenerating(true); const code = await onGenerateRecoveryCode(); setGenerating(false); if (code) setNewCode(code); }
  return <div className="grid gap-6">
    <section className="admin-card">
      <h2 className="admin-title">Cambiar mi clave</h2>
      <p className="mt-2 text-violet-600">Es la clave que usás para entrar a este panel. Al cambiarla se cierran las demás sesiones abiertas.</p>
      <form onSubmit={submitPin} className="mt-4 grid gap-4 md:grid-cols-2"><div><Label>Nueva clave</Label><Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-2 bg-white" autoComplete="new-password"/></div><div><Label>Repetir clave</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 bg-white" autoComplete="new-password"/></div>{pinError && <p className="rounded-xl bg-pink-100 p-3 text-sm font-bold text-pink-800 md:col-span-2">{pinError}</p>}<Button type="submit" className="bg-violet-600 md:col-span-2"><Save/> Guardar clave</Button></form>
    </section>
    <section className="admin-card">
      <h2 className="admin-title">Código de recuperación</h2>
      <p className="mt-2 max-w-2xl text-violet-600">Si perdés la clave, este código permite elegir una nueva desde la pantalla de ingreso, sin necesitar la anterior. Generar uno nuevo invalida el que tenías.</p>
      <p className="mt-3 text-sm font-bold text-violet-800">{recoveryCodeSet ? "✓ Hay un código activo." : "Todavía no generaste ninguno."}</p>
      {newCode ? <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"><p className="text-sm font-bold text-amber-900">Guardalo ahora en un lugar seguro: no se va a volver a mostrar.</p><p className="mt-3 select-all rounded-xl bg-white p-4 text-center text-2xl font-black tracking-widest text-violet-950">{newCode}</p></div>
        : <ConfirmButton title={recoveryCodeSet ? "¿Generar un nuevo código?" : "¿Generar código de recuperación?"} description="El código anterior, si existía, dejará de funcionar." action="Generar" destructive={false} onConfirm={() => void generate()}><KeyRound/> {generating ? "Generando…" : recoveryCodeSet ? "Generar nuevo código" : "Generar código"}</ConfirmButton>}
    </section>
  </div>;
}

function RecoverAccess({ onRecovered }: { onRecovered: () => void }) {
  const [open, setOpen] = useState(false); const [code, setCode] = useState(""); const [pin, setPin] = useState(""); const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (pin.trim().length < 8) return setError("La clave debe tener al menos 8 caracteres.");
    if (pin !== confirm) return setError("Las claves no coinciden.");
    setSaving(true);
    const r = await fetch("/api/admin/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, newPin: pin.trim() }) });
    const b = await r.json(); setSaving(false);
    if (!r.ok) return setError(b.error ?? "No se pudo restablecer la clave.");
    setOpen(false); setCode(""); setPin(""); setConfirm(""); onRecovered();
  }
  return <>
    <button type="button" className="mt-3 block w-full text-center text-sm font-bold text-violet-600 underline underline-offset-4" onClick={() => setOpen(true)}>¿Olvidaste tu clave?</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-[1.75rem] border-2 border-violet-200 sm:max-w-md"><DialogHeader><DialogTitle className="text-2xl font-black text-violet-950">Restablecer clave</DialogTitle><DialogDescription>Usá el código de recuperación que generaste en la pestaña Seguridad del panel.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><div><Label htmlFor="recovery-code">Código de recuperación</Label><Input id="recovery-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off"/></div><div><Label htmlFor="recovery-pin">Nueva clave</Label><Input id="recovery-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password"/></div><div><Label htmlFor="recovery-pin-confirm">Repetir clave</Label><Input id="recovery-pin-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"/></div>{error && <p className="rounded-xl bg-pink-100 p-3 text-sm font-bold text-pink-800">{error}</p>}<Button type="submit" disabled={saving} className="bg-violet-600"><KeyRound/> Restablecer</Button></form></DialogContent></Dialog>
  </>;
}

function DrawForm({ settings, onSaveConfig, onCloseRoster, onResolve }: { settings: Row; onSaveConfig: (v: Row) => void; onCloseRoster: () => Promise<{ hash: string; soldCount: number } | null>; onResolve: (v: Row) => Promise<Row | null> }) {
  const [v, setV] = useState(settings); const set = (key: string, value: unknown) => setV((old) => ({ ...old, [key]: value }));
  const [previewNumber, setPreviewNumber] = useState(Number(settings.start_number ?? 0));
  const locked = Boolean(settings.active_draw_resolution_id);
  const numberCount = Number(settings.number_count) || 0;
  const startNumber = Number(settings.start_number) || 0;
  const digits = Math.max(1, Math.min(10, Number(v.official_result_digits) || 4));
  const resultSpace = 10 ** digits;
  const params = numberCount > 0 ? computeMappingParams(numberCount, resultSpace) : null;
  const fairness = numberCount > 0 ? validateFairness(numberCount, resultSpace) : null;
  const method = String(v.draw_resolution_method ?? "direct");
  let equivalents: string[] | null = null;
  try { if (method === "official_lottery_mapping" && numberCount > 0) equivalents = getOfficialEquivalentNumbers({ raffleNumber: previewNumber, startNumber, numberCount, resultSpace, digits }); } catch { equivalents = null; }

  return <div className="grid gap-6">
    <section className="admin-card">
      <h2 className="admin-title">Método de sorteo</h2>
      <p className="mt-2 text-violet-600">Definí cómo se va a determinar el número ganador. Esta regla tiene que quedar fija <strong>antes</strong> del sorteo — una vez resuelto no se puede volver a cambiar.</p>
      {locked && <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-900"><Lock className="h-4 w-4"/> El sorteo ya fue resuelto: esta configuración quedó bloqueada.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><Label>Método</Label><Select value={method} onValueChange={(x) => set("draw_resolution_method", x)} disabled={locked}><SelectTrigger className="mt-2 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="direct">Directo (número ganador cargado a mano)</SelectItem><SelectItem value="official_lottery_mapping">Mapeo por lotería oficial (Quiniela)</SelectItem></SelectContent></Select></div>
        {method === "official_lottery_mapping" && <div><Label>Cifras del resultado oficial</Label><Input type="number" value={digits} onChange={(e) => set("official_result_digits", Number(e.target.value))} disabled={locked} className="mt-2 bg-white"/></div>}
      </div>
      {method === "official_lottery_mapping" && <>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nombre de la lotería" value={v.official_lottery_name} onChange={(x) => set("official_lottery_name", x)}/>
          <Field label="Nombre del sorteo" value={v.official_draw_name} onChange={(x) => set("official_draw_name", x)}/>
          <Field label="Fecha del sorteo" value={v.official_draw_date} onChange={(x) => set("official_draw_date", x)} type="date"/>
          <Field label="URL oficial del resultado" value={v.official_draw_url} onChange={(x) => set("official_draw_url", x)}/>
          <Field label="Posiciones del extracto oficial" value={v.official_result_count} onChange={(x) => set("official_result_count", Number(x))} type="number"/>
          <div><Label>Si el número no fue vendido</Label><Select value={String(v.unclaimed_winner_policy ?? "no_winner")} onValueChange={(x) => set("unclaimed_winner_policy", x)} disabled={locked}><SelectTrigger className="mt-2 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no_winner">No hay ganador</SelectItem><SelectItem value="next_valid_official_position">Pasar a la siguiente posición válida</SelectItem></SelectContent></Select></div>
        </div>
        <div className="mt-4"><Label>Nota que aparece en el comprobante y en el sitio</Label><Textarea value={String(v.draw_resolution_note ?? "")} onChange={(e) => set("draw_resolution_note", e.target.value)} className="mt-2 bg-white"/></div>
        <label className="mt-4 flex items-center gap-2 text-sm font-bold text-violet-800"><input type="checkbox" checked={Boolean(v.show_winner_buyer_name)} onChange={(e) => set("show_winner_buyer_name", e.target.checked)} disabled={locked} className="h-4 w-4"/> Mostrar el nombre del comprador ganador públicamente</label>

        {params && fairness && <div className="mt-5 rounded-2xl bg-violet-50 p-4 text-sm">
          <p className="font-black text-violet-900">Resumen matemático</p>
          <ul className="mt-2 grid gap-1 text-violet-800">
            <li>Números de la rifa: <strong>{numberCount}</strong></li>
            <li>Resultados posibles oficiales: <strong>{resultSpace}</strong></li>
            <li>Resultados válidos utilizados: <strong>{params.usableResults}</strong></li>
            <li>Resultados descartados: <strong>{params.discardedCount}</strong></li>
            <li>Equivalentes por número: <strong>{params.equivalentsPerNumber}</strong></li>
          </ul>
          {!fairness.fair && <p className="mt-3 rounded-xl bg-pink-100 p-3 font-bold text-pink-800">⚠ Esta configuración no es matemáticamente justa: {fairness.issues.join(" ")}</p>}
        </div>}

        {equivalents && <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4">
          <Label>Previsualizar equivalentes de un número</Label>
          <div className="mt-2 flex items-center gap-3"><Input type="number" value={previewNumber} onChange={(e) => setPreviewNumber(Number(e.target.value))} className="w-32"/><p className="text-sm text-violet-700">{equivalents.join(" · ")}</p></div>
        </div>}
      </>}
      <Button onClick={() => onSaveConfig(v)} disabled={locked || (fairness ? !fairness.fair && method === "official_lottery_mapping" : false)} className="mt-6 bg-violet-600"><Save/> Guardar método de sorteo</Button>
    </section>

    <RosterCard settings={settings} onCloseRoster={onCloseRoster}/>

    {method === "official_lottery_mapping" && <ResolveDrawCard settings={settings} onResolve={onResolve}/>}
  </div>;
}

function RosterCard({ settings, onCloseRoster }: { settings: Row; onCloseRoster: () => Promise<{ hash: string; soldCount: number } | null> }) {
  const closed = Boolean(settings.roster_closed_at);
  return <section className="admin-card">
    <h2 className="admin-title">Cierre del padrón</h2>
    <p className="mt-2 text-violet-600">Antes de resolver el sorteo, cerrá el padrón: se congela la lista de números vendidos (se guarda un hash reproducible) y dejan de aceptarse nuevas ventas o cambios.</p>
    {closed ? <div className="mt-4 rounded-2xl bg-emerald-50 p-4"><p className="font-black text-emerald-900">✓ Padrón cerrado el {String(settings.roster_closed_at).slice(0, 10)}</p><p className="mt-1 text-sm text-emerald-800">{String(settings.roster_sold_count)} números vendidos.</p><p className="mt-2 break-all rounded-lg bg-white p-2 font-mono text-xs text-violet-700">Hash: {String(settings.roster_hash)}</p></div>
      : <ConfirmButton title="¿Cerrar el padrón?" description="Deja de aceptarse cualquier venta, reserva o cambio de comprador hasta que se reinicien las ventas. Esta acción se audita." action="Cerrar padrón" onConfirm={() => void onCloseRoster()}><Lock/> Cerrar padrón</ConfirmButton>}
  </section>;
}

function ResolveDrawCard({ settings, onResolve }: { settings: Row; onResolve: (v: Row) => Promise<Row | null> }) {
  const [text, setText] = useState(""); const [confirmCorrection, setConfirmCorrection] = useState(false); const [correctionReason, setCorrectionReason] = useState("");
  const [result, setResult] = useState<Row | null>(null);
  const alreadyResolved = Boolean(settings.active_draw_resolution_id);
  const closed = Boolean(settings.roster_closed_at);
  async function submit() {
    const officialResults = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isInteger(n));
    if (!officialResults.length) return;
    const payload: Row = { officialResults };
    if (alreadyResolved) { payload.confirmCorrection = true; payload.correctionReason = correctionReason; }
    const resolution = await onResolve(payload);
    if (resolution) { setResult(resolution); setText(""); setConfirmCorrection(false); setCorrectionReason(""); }
  }
  return <section className="admin-card">
    <h2 className="admin-title">Cargar resultado oficial y resolver</h2>
    <p className="mt-2 text-violet-600">Pegá las posiciones del extracto oficial en orden (una por línea o separadas por coma). El sistema descarta automáticamente las que estén fuera de rango y usa la primera válida.</p>
    {!closed && <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-900">Cerrá el padrón primero.</p>}
    {alreadyResolved && <div className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-900"><label className="flex items-center gap-2"><input type="checkbox" checked={confirmCorrection} onChange={(e) => setConfirmCorrection(e.target.checked)} className="h-4 w-4"/> Confirmo que quiero corregir el sorteo ya resuelto</label>{confirmCorrection && <Textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Motivo de la corrección (obligatorio, queda auditado)" className="mt-2 bg-white"/>}</div>}
    <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"9347\n7826\n0021\n..."} disabled={!closed} className="mt-3 bg-white" rows={6}/>
    <Button onClick={() => void submit()} disabled={!closed || (alreadyResolved && (!confirmCorrection || !correctionReason.trim()))} className="mt-3 bg-violet-600"><Trophy/> Resolver sorteo</Button>
    {result && <div className="mt-5 rounded-2xl bg-violet-950 p-5 text-white">
      <p className="text-sm font-black uppercase tracking-wider text-pink-300">{String(result.status) === "resolved" ? "Sorteo resuelto" : "No se pudo resolver"}</p>
      {result.status === "resolved" ? <>
        <p className="mt-2 text-4xl font-black">{String(result.winnerNumber).padStart(4, "0")}</p>
        <p className="mt-1 text-sm text-violet-200">Posición {String(result.positionUsed)} · resultado {String(result.officialResultUsed)}</p>
        <p className="mt-1 text-sm text-violet-200">{String(result.formula)}</p>
        {result.winnerWasSold === false && <p className="mt-2 rounded-lg bg-pink-500/30 p-2 text-sm font-bold">Este número no estaba vendido.</p>}
      </> : <p className="mt-2 text-sm text-violet-200">Ninguna de las posiciones cargadas resultó válida{settings.unclaimed_winner_policy === "next_valid_official_position" ? " o vendida" : ""}. Cargá más posiciones del extracto.</p>}
      {Array.isArray(result.discarded) && result.discarded.length > 0 && <div className="mt-3 text-xs text-violet-300"><p className="font-bold">Descartados:</p><ul>{(result.discarded as Array<{ position: number; result: number; reason: string }>).map((d) => <li key={d.position}>#{d.position} → {String(d.result).padStart(4, "0")} ({d.reason === "out_of_range" ? "fuera de rango" : "no vendido"})</li>)}</ul></div>}
    </div>}
  </section>;
}

function BackupPanel({ onRestore, onDownload, onReset }: { onRestore: (v: unknown) => void; onDownload: (format: "json" | "csv") => Promise<void>; onReset: (mode: "sales" | "factory") => void }) { return <section className="admin-card"><h2 className="admin-title">Respaldos y reinicio</h2><p className="mt-2 max-w-2xl text-violet-600">Descargá una copia completa en JSON y una planilla CSV de ventas. Guardalas en dos lugares distintos.</p><div className="mt-5 flex flex-wrap gap-3"><Button className="bg-violet-600" onClick={() => void onDownload("json")}><DatabaseBackup/> Descargar copia completa</Button><Button variant="outline" onClick={() => void onDownload("csv")}><Download/> Descargar ventas CSV</Button><label className="inline-flex cursor-pointer items-center rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-bold"><input type="file" accept="application/json" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; onRestore(JSON.parse(await file.text())); }}/>Restaurar configuración JSON</label></div><div className="mt-8 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-black text-amber-950">Vaciar ventas de prueba</h3><p className="my-3 text-sm text-amber-900">Libera todos los números. Conserva vendedores, premios y diseño.</p><ConfirmButton title="¿Vaciar todas las ventas?" description="Todos los números volverán a estar libres. Los vendedores y la configuración se conservarán." action="Vaciar ventas" destructive={false} onConfirm={() => onReset("sales")}><RotateCcw/> Vaciar ventas</ConfirmButton></div><div className="rounded-2xl border border-pink-200 bg-pink-50 p-5"><h3 className="font-black text-pink-950">Reiniciar toda la rifa</h3><p className="my-3 text-sm text-pink-900">Borra vendedores, premios y ventas, y restablece configuración y diseño. Conserva la clave administradora.</p><ConfirmButton title="¿Reiniciar toda la rifa?" description="Esta acción borra vendedores, premios y ventas. La clave administradora se conserva." action="Reiniciar todo" onConfirm={() => onReset("factory")}><Trash2/> Reiniciar todo</ConfirmButton></div></div></section>; }
