import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import {
  Store, LogOut, Package, TrendingUp, BookOpen, FileText,
  Layers, Music, Code2, Image, Globe, Video, User, Mail, Phone,
  Plus, Upload, X, CheckCircle, Clock, AlertCircle, ChevronRight,
  ShoppingBag, Star, Eye, Send, HelpCircle, ExternalLink, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const PRODUCT_TYPE_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  documents:  { label: "Documents éducatifs", icon: BookOpen,  color: "text-blue-600 bg-blue-50" },
  ebooks:     { label: "Ebooks & Livres",      icon: FileText,  color: "text-purple-600 bg-purple-50" },
  templates:  { label: "Templates & CV",        icon: Layers,    color: "text-indigo-600 bg-indigo-50" },
  musique:    { label: "Musique & Audio",        icon: Music,     color: "text-pink-600 bg-pink-50" },
  logiciels:  { label: "Logiciels & Scripts",   icon: Code2,     color: "text-gray-600 bg-gray-50" },
  graphismes: { label: "Photos & Graphismes",   icon: Image,     color: "text-orange-600 bg-orange-50" },
  formations: { label: "Vidéos & Formations",   icon: Video,     color: "text-red-600 bg-red-50" },
  themes:     { label: "Sites Web & Thèmes",    icon: Globe,     color: "text-teal-600 bg-teal-50" },
};

const PRODUCT_TYPE_CATEGORY_SLUG: Record<string, string> = {
  documents:  "documents",
  ebooks:     "ebooks",
  templates:  "templates",
  musique:    "musique",
  logiciels:  "logiciels",
  graphismes: "graphismes",
  formations: "formations",
  themes:     "themes",
};

interface SellerInfo {
  id: number;
  name: string;
  email: string;
  phone: string;
  productType: string;
  createdAt: string;
}

interface SellerProduct {
  id: number;
  title: string;
  description: string;
  subject: string;
  price: number;
  categoryName: string | null;
  downloadCount: number;
  isFeatured: boolean;
  createdAt: string;
}

interface SellerStats {
  productCount: number;
  salesCount: number;
  revenue: number;
  totalViews: number;
}

type TabKey = "overview" | "submit" | "products" | "profile";

const FILE_ACCEPT_MAP: Record<string, string> = {
  documents:  ".pdf,application/pdf",
  ebooks:     ".pdf,.epub,application/pdf",
  templates:  ".pdf,.docx,.xlsx,.pptx,.zip,application/pdf",
  musique:    ".mp3,.wav,.flac,audio/*",
  logiciels:  ".zip,.rar,.tar.gz,application/zip",
  graphismes: ".jpg,.jpeg,.png,.zip,.psd,image/*",
  formations: ".mp4,.mov,.zip,video/*",
  themes:     ".zip,.tar.gz,application/zip",
};

const FILE_HINT_MAP: Record<string, string> = {
  documents:  "Fichiers PDF acceptés",
  ebooks:     "Fichiers PDF ou ePub acceptés",
  templates:  "PDF, Word, Excel, PowerPoint ou ZIP acceptés",
  musique:    "Fichiers MP3, WAV ou FLAC acceptés",
  logiciels:  "Archive ZIP ou RAR contenant le logiciel/script",
  graphismes: "Images JPG/PNG ou archive ZIP",
  formations: "Vidéo MP4 ou archive ZIP",
  themes:     "Archive ZIP contenant le thème complet",
};

function StatCard({ emoji, value, label, sub }: { emoji: string; value: string | number; label: string; sub?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-5">
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-3xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>{value}</div>
      <div className="text-sm font-semibold mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SubmitProductForm({
  seller,
  apiBase,
  onSuccess,
}: {
  seller: SellerInfo;
  apiBase: string;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const accept = FILE_ACCEPT_MAP[seller.productType] ?? "*/*";
  const hint = FILE_HINT_MAP[seller.productType] ?? "Tout fichier accepté";

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast({ title: "Le titre est obligatoire", variant: "destructive" }); return; }
    if (!price || isNaN(Number(price)) || Number(price) < 100) {
      toast({ title: "Entrez un prix valide (minimum 100 FCFA)", variant: "destructive" });
      return;
    }
    if (files.length === 0) { toast({ title: "Ajoutez au moins un fichier", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      setProgress("Création du produit…");

      const categorySlug = PRODUCT_TYPE_CATEGORY_SLUG[seller.productType];
      let categoryId: number | null = null;
      if (categorySlug) {
        const catRes = await fetch(`${apiBase}/api/categories`);
        if (catRes.ok) {
          const cats = await catRes.json() as Array<{ id: number; slug: string }>;
          categoryId = cats.find(c => c.slug === categorySlug)?.id ?? null;
        }
      }

      const createRes = await fetch(`${apiBase}/api/documents/admin/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || `Produit ${PRODUCT_TYPE_LABELS[seller.productType]?.label ?? seller.productType}`,
          subject: PRODUCT_TYPE_LABELS[seller.productType]?.label ?? seller.productType,
          level: "general",
          price: Number(price),
          isFeatured: false,
          categoryId,
          sellerId: seller.id,
        }),
      });
      if (!createRes.ok) throw new Error("Erreur lors de la création");
      const doc = await createRes.json() as { id: number };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Envoi du fichier ${i + 1}/${files.length} : ${file.name}…`);
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch(`${apiBase}/api/storage/upload`, { method: "POST", body: fd });
        if (!upRes.ok) continue;
        const { objectPath, fileSize } = await upRes.json() as { objectPath: string; fileSize: number };
        await fetch(`${apiBase}/api/documents/${doc.id}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath, fileName: file.name, fileSize: fileSize ?? file.size, sortOrder: i }),
        });
      }

      toast({ title: "Produit publié avec succès !" });
      setTitle(""); setDescription(""); setPrice(""); setFiles([]);
      onSuccess();
    } catch {
      toast({ title: "Une erreur s'est produite. Réessayez.", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">📋 Conseils pour un bon produit</p>
        <ul className="text-xs text-blue-700 mt-1.5 space-y-1">
          <li>• Choisissez un titre clair et précis qui explique ce que contient le produit</li>
          <li>• Rédigez une description utile — plus c'est clair, plus vous vendrez !</li>
          <li>• Vérifiez que vos fichiers sont lisibles et complets avant de les envoyer</li>
        </ul>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold">Titre du produit <span className="text-destructive">*</span></label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            seller.productType === "musique" ? "Ex : Album Acoustique Vol.1 — 10 titres inédits" :
            seller.productType === "templates" ? "Ex : Pack CV Professionnel — 5 modèles Word" :
            seller.productType === "ebooks" ? "Ex : Guide complet du Marketing Digital 2024" :
            "Ex : Cours complet de Mathématiques — Terminale S"
          }
          className="h-11"
          required
        />
        <p className="text-xs text-muted-foreground">Soyez précis : les clients achètent ce qu'ils comprennent</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold">Description <span className="text-muted-foreground font-normal">(fortement recommandé)</span></label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez ce que contient votre produit, à qui il s'adresse, ce qu'il apporte…"
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">Une bonne description augmente vos chances de vente</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold">Prix de vente (FCFA) <span className="text-destructive">*</span></label>
        <div className="relative">
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="500"
            min={100}
            step={100}
            className="h-11 pr-16"
            required
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">FCFA</span>
        </div>
        <p className="text-xs text-muted-foreground">Minimum 100 FCFA — vous recevrez une commission sur chaque vente</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold">Fichier(s) du produit <span className="text-destructive">*</span></label>
        <div
          className="border-2 border-dashed border-border rounded-xl p-5 hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => !submitting && fileRef.current?.click()}
        >
          {files.length === 0 ? (
            <div className="text-center">
              <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Cliquez pour choisir vos fichiers</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{hint}</p>
            </div>
          ) : (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeFile(i)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" className="w-full text-center text-xs text-primary hover:underline py-1" onClick={() => fileRef.current?.click()}>
                + Ajouter d'autres fichiers
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
            e.target.value = "";
          }}
        />
      </div>

      {progress && (
        <div className="flex items-center gap-2 text-sm text-primary animate-pulse">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          {progress}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full gap-2" disabled={submitting}>
        <Send className="w-4 h-4" />
        {submitting ? "Publication en cours…" : "Publier ce produit"}
      </Button>
    </form>
  );
}

export default function SellerDashboard() {
  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [stats, setStats] = useState<SellerStats>({ productCount: 0, salesCount: 0, revenue: 0, totalViews: 0 });
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const [prodRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/api/seller/products`, { credentials: "include" }),
        fetch(`${apiBase}/api/seller/stats`, { credentials: "include" }),
      ]);
      if (prodRes.ok) setProducts(await prodRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } finally {
      setLoadingProducts(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetch(`${apiBase}/api/seller/auth/me`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) { navigate("/seller/login"); return; }
        const data: SellerInfo = await res.json();
        setSeller(data);
        loadProducts();
      })
      .catch(() => navigate("/seller/login"))
      .finally(() => setLoading(false));
  }, [apiBase, navigate, loadProducts]);

  const handleLogout = async () => {
    await fetch(`${apiBase}/api/seller/auth/logout`, { method: "POST", credentials: "include" });
    toast({ title: "Déconnexion réussie" });
    navigate("/seller/login");
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("Supprimer ce produit définitivement ?")) return;
    const res = await fetch(`${apiBase}/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Produit supprimé" });
      loadProducts();
    } else {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Chargement de votre espace…</p>
        </div>
      </div>
    );
  }

  if (!seller) return null;

  const productInfo = PRODUCT_TYPE_LABELS[seller.productType] ?? { label: seller.productType, icon: Package, color: "text-gray-600 bg-gray-50" };
  const ProductIcon = productInfo.icon;
  const memberSince = new Date(seller.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview",  label: "Vue d'ensemble",    icon: TrendingUp },
    { key: "submit",    label: "Publier un produit", icon: Plus },
    { key: "products",  label: "Mes produits",       icon: Package },
    { key: "profile",   label: "Mon profil",         icon: User },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-card-border px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-sm" style={{ fontFamily: "var(--app-font-serif)" }}>XamXam</span>
            <span className="text-xs text-muted-foreground ml-1.5 hidden sm:inline">Espace Vendeur</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground hidden sm:block">{seller.name}</span>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-card border-b border-card-border sticky top-[61px] z-20">
        <div className="max-w-5xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSubmitSuccess(false); if (t.key === "products" || t.key === "overview") loadProducts(); }}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 flex-shrink-0 transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span className={t.key === "submit" ? "" : "hidden sm:inline"}>{t.label}</span>
              {t.key === "submit" && <span className="sm:hidden">Publier</span>}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* VUE D'ENSEMBLE */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Banner de bienvenue */}
            <div className="bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-primary-foreground/70 text-sm mb-1">Bienvenue,</p>
                  <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "var(--app-font-serif)" }}>{seller.name}</h1>
                  <p className="text-primary-foreground/70 text-sm">Vendeur depuis le {memberSince}</p>
                  <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-semibold bg-white/20">
                    <ProductIcon className="w-3.5 h-3.5" />
                    {productInfo.label}
                  </div>
                </div>
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <ProductIcon className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>

            {/* Stats réelles */}
            <div>
              <h2 className="font-bold text-lg mb-3">Statistiques</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard emoji="💰" value={stats.revenue.toLocaleString("fr-FR")} label="Revenus totaux" sub="en FCFA" />
                <StatCard emoji="📦" value={stats.salesCount} label="Ventes réalisées" sub="commandes validées" />
                <StatCard emoji="🗂️" value={stats.productCount} label="Produits publiés" sub="en ligne sur XamXam" />
                <StatCard emoji="👁️" value={stats.totalViews} label="Téléchargements" sub="depuis la création" />
              </div>
            </div>

            {/* Par où commencer */}
            <div className="bg-card border border-card-border rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <ChevronRight className="w-5 h-5 text-primary" /> Par où commencer ?
              </h2>
              <div className="space-y-3">
                {[
                  {
                    icon: CheckCircle, color: "text-green-600 bg-green-50",
                    title: "Compte approuvé",
                    desc: "Votre candidature a été acceptée. Félicitations !",
                    done: true,
                  },
                  {
                    icon: Upload, color: "text-primary bg-primary/10",
                    title: stats.productCount > 0 ? `${stats.productCount} produit${stats.productCount > 1 ? "s" : ""} publié${stats.productCount > 1 ? "s" : ""}` : "Publiez votre premier produit",
                    desc: stats.productCount > 0
                      ? "Vos produits sont visibles sur le catalogue XamXam."
                      : "Cliquez sur « Publier un produit » pour mettre votre contenu en vente immédiatement.",
                    done: stats.productCount > 0,
                    action: stats.productCount === 0 ? () => setTab("submit") : undefined,
                    actionLabel: "Publier maintenant",
                  },
                  {
                    icon: ShoppingBag, color: "text-purple-600 bg-purple-50",
                    title: stats.salesCount > 0 ? `${stats.salesCount} vente${stats.salesCount > 1 ? "s" : ""} réalisée${stats.salesCount > 1 ? "s" : ""}` : "Vos premières ventes",
                    desc: stats.salesCount > 0
                      ? `Revenus générés : ${stats.revenue.toLocaleString("fr-FR")} FCFA`
                      : "Les clients peuvent acheter vos produits et vous recevez une commission à chaque vente.",
                    done: stats.salesCount > 0,
                  },
                ].map((s, i) => (
                  <div key={i} className="flex gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>
                      <s.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                      {s.action && (
                        <button onClick={s.action} className="text-xs text-primary hover:underline mt-1 font-medium">
                          {s.actionLabel} →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Commission info */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                <Star className="w-4 h-4" /> Comment fonctionne la commission ?
              </h3>
              <div className="space-y-2 text-sm text-amber-800">
                <p>• À chaque vente de votre produit, vous recevez une commission sur le prix de vente.</p>
                <p>• Les paiements sont effectués chaque semaine par Wave, Orange Money ou Free Money.</p>
                <p>• Vous pouvez voir le détail de vos ventes dans l'onglet "Mes produits".</p>
              </div>
            </div>
          </div>
        )}

        {/* PUBLIER UN PRODUIT */}
        {tab === "submit" && (
          <div className="max-w-2xl">
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "var(--app-font-serif)" }}>
                Publier un produit
              </h1>
              <p className="text-muted-foreground text-sm">
                Remplissez le formulaire ci-dessous. Votre produit sera immédiatement visible sur le catalogue XamXam.
              </p>
            </div>

            {submitSuccess ? (
              <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-8 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Produit publié avec succès !</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Votre produit est maintenant visible sur le catalogue XamXam et disponible à l'achat.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button onClick={() => { setSubmitSuccess(false); loadProducts(); }} className="gap-2">
                    <Plus className="w-4 h-4" /> Publier un autre produit
                  </Button>
                  <Button variant="outline" onClick={() => { setTab("products"); loadProducts(); }}>Voir mes produits</Button>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-card-border rounded-2xl p-6">
                <SubmitProductForm
                  seller={seller}
                  apiBase={apiBase}
                  onSuccess={() => { setSubmitSuccess(true); loadProducts(); }}
                />
              </div>
            )}
          </div>
        )}

        {/* MES PRODUITS */}
        {tab === "products" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Mes produits</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {products.length > 0
                    ? `${products.length} produit${products.length > 1 ? "s" : ""} en ligne`
                    : "Aucun produit publié pour l'instant"}
                </p>
              </div>
              <Button onClick={() => setTab("submit")} className="gap-2">
                <Plus className="w-4 h-4" /> Publier un produit
              </Button>
            </div>

            {/* Mini stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-green-700">{stats.productCount}</p>
                  <p className="text-xs text-green-600">Publiés en ligne</p>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-3">
                <ShoppingBag className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{stats.salesCount}</p>
                  <p className="text-xs text-muted-foreground">Ventes validées</p>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-3">
                <Eye className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{stats.revenue.toLocaleString("fr-FR")}</p>
                  <p className="text-xs text-muted-foreground">FCFA générés</p>
                </div>
              </div>
            </div>

            {loadingProducts ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="bg-card border border-card-border rounded-2xl p-12 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
                <h3 className="font-bold text-lg mb-2">Aucun produit pour l'instant</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Vous n'avez pas encore publié de produit. Cliquez sur le bouton ci-dessous pour commencer.
                </p>
                <Button onClick={() => setTab("submit")} size="lg" className="gap-2">
                  <Plus className="w-5 h-5" /> Publier mon premier produit
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((p) => (
                  <div key={p.id} className="bg-card border border-card-border rounded-2xl p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{p.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                        </div>
                        <span className="text-sm font-bold text-primary flex-shrink-0 ml-2">
                          {p.price.toLocaleString("fr-FR")} FCFA
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle className="w-3 h-3" /> En ligne
                        </span>
                        {p.categoryName && (
                          <span className="text-xs text-muted-foreground">{p.categoryName}</span>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {p.downloadCount} téléchargement{p.downloadCount !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link href={`/documents/${p.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Voir sur le catalogue">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Supprimer"
                        onClick={() => handleDeleteProduct(p.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MON PROFIL */}
        {tab === "profile" && (
          <div className="max-w-xl space-y-5">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Mon profil</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Vos informations de compte vendeur</p>
            </div>

            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${productInfo.color}`}>
                  <ProductIcon className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="font-bold text-xl">{seller.name}</h2>
                  <p className="text-sm text-muted-foreground">Membre depuis le {memberSince}</p>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                {[
                  { icon: User, label: "Nom complet", value: seller.name },
                  { icon: Mail, label: "Adresse email", value: seller.email },
                  { icon: Phone, label: "Téléphone", value: seller.phone },
                  { icon: ProductIcon, label: "Catégorie de produits", value: productInfo.label },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                    <row.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{row.label}</p>
                      <p className="text-sm font-medium truncate">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-2xl p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-primary" /> Besoin de modifier vos informations ?
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Pour modifier votre nom, email, téléphone ou catégorie de produits, contactez notre équipe directement.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span>📧</span>
                  <a href="mailto:support@xamxam.sn" className="text-primary hover:underline">support@xamxam.sn</a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>📱</span>
                  <span className="text-muted-foreground">WhatsApp : +221 77 577 14 43</span>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={handleLogout} className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
              <LogOut className="w-4 h-4" /> Se déconnecter
            </Button>
          </div>
        )}

      </main>
    </div>
  );
}
