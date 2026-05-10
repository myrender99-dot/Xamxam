import { useState, useRef, useEffect } from "react";
import { useRoute, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle, Clock, XCircle, AlertCircle, Upload, Download, ArrowLeft, FileText, BookOpen, History } from "lucide-react";
import { Link } from "wouter";
import { useGetOrder, useUploadPaymentProof, useGetDocumentFiles, getGetOrderQueryKey, getGetDocumentFilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface SavedOrder { id: number; email: string; name: string; createdAt: string; }

function getSavedOrders(): SavedOrder[] {
  try { return JSON.parse(localStorage.getItem("xamxam_orders") ?? "[]"); } catch { return []; }
}

const emailSchema = z.object({ email: z.string().email("Email invalide") });

function DocumentFileDownloads({ documentId, orderId, email }: { documentId: number | null; orderId: number; email: string }) {
  const { data: files } = useGetDocumentFiles(documentId ?? 0, {
    query: { enabled: !!documentId, queryKey: getGetDocumentFilesQueryKey(documentId ?? 0) },
  });
  if (!files || files.length === 0) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {files.map((f) => {
        const viewUrl = `/order/${orderId}/view/${f.id}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(f.fileName)}`;
        const downloadUrl = `/api/orders/${orderId}/view-file/${f.id}?email=${encodeURIComponent(email)}&download=1`;
        return (
          <div key={f.id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <FileText className="w-4 h-4 text-green-700 flex-shrink-0" />
            <span className="text-xs font-medium text-green-800 truncate flex-1">{f.fileName}</span>
            {f.fileSize && <span className="text-xs text-green-600 flex-shrink-0">{(f.fileSize / 1024 / 1024).toFixed(1)} MB</span>}
            <Link href={viewUrl}>
              <Button size="sm" variant="default" className="gap-1 text-xs h-7 px-2.5 flex-shrink-0" data-testid={`button-read-file-${f.id}`}>
                <BookOpen className="w-3 h-3" /> Lire
              </Button>
            </Link>
            <a href={downloadUrl} download={f.fileName}>
              <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2 flex-shrink-0" data-testid={`button-download-file-${f.id}`}>
                <Download className="w-3 h-3" />
              </Button>
            </a>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200", label: "En attente de paiement" },
  payment_uploaded: { icon: AlertCircle, color: "text-blue-600 bg-blue-50 border-blue-200", label: "Preuve envoyée — En cours de validation" },
  approved: { icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200", label: "Paiement validé — Documents disponibles" },
  rejected: { icon: XCircle, color: "text-red-600 bg-red-50 border-red-200", label: "Paiement rejeté" },
};

const PAYMENT_NAMES: Record<string, string> = {
  wave: "Wave", orange_money: "Orange Money", free_money: "Free Money",
};

export default function OrderTracking() {
  const [, params] = useRoute("/order/:id");
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const rawId = parseInt(params?.id ?? "0", 10);
  const urlEmail = urlParams.get("email") ?? "";

  const [email, setEmail] = useState(urlEmail);
  const [confirmedEmail, setConfirmedEmail] = useState(urlEmail);
  const [uploadFile, setUploadFile] = useState<string | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [paymentMethodForUpload, setPaymentMethodForUpload] = useState("wave");
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uploadProof = useUploadPaymentProof();
  const emailForm = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email } });

  useEffect(() => {
    setSavedOrders(getSavedOrders());
  }, []);

  // Auto-fill email from localStorage if we have the order ID
  useEffect(() => {
    if (rawId && !confirmedEmail) {
      const saved = getSavedOrders().find((o) => o.id === rawId);
      if (saved) {
        setEmail(saved.email);
        setConfirmedEmail(saved.email);
      }
    }
  }, [rawId, confirmedEmail]);

  const enabled = !!rawId && rawId > 0 && !!confirmedEmail;
  const { data: order, isLoading } = useGetOrder(
    rawId,
    { email: confirmedEmail },
    { query: { enabled, queryKey: getGetOrderQueryKey(rawId, { email: confirmedEmail }) } }
  );

  const formatPrice = (p: number) => p.toLocaleString("fr-FR") + " FCFA";
  const formatDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadFile(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = () => {
    if (!uploadFile || !order) return;
    uploadProof.mutate(
      { id: rawId, data: { customerEmail: confirmedEmail, paymentMethod: paymentMethodForUpload, proofImageData: uploadFile, notes: uploadNotes || null } },
      {
        onSuccess: () => {
          toast({ title: "Preuve envoyée !", description: "Nous allons vérifier votre paiement sous peu." });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(rawId, { email: confirmedEmail }) });
          setUploadFile(null);
        },
        onError: () => { toast({ title: "Erreur lors de l'envoi", variant: "destructive" }); },
      }
    );
  };

  // No order ID — show search form + saved orders
  if (!rawId || rawId === 0) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-10">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--app-font-serif)" }}>Suivre ma commande</h1>
            <p className="text-muted-foreground">Entrez votre ID de commande et votre email</p>
          </div>

          {/* Saved orders */}
          {savedOrders.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">Mes commandes récentes</h2>
              </div>
              <div className="space-y-2">
                {savedOrders.map((o) => (
                  <a
                    key={o.id}
                    href={`/order/${o.id}?email=${encodeURIComponent(o.email)}`}
                    className="flex items-center justify-between bg-muted/50 hover:bg-muted rounded-lg px-3 py-2.5 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">Commande #{o.id}</p>
                      <p className="text-xs text-muted-foreground">{o.name} · {formatDate(o.createdAt)}</p>
                    </div>
                    <span className="text-xs text-primary font-medium">Voir →</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-card-border rounded-xl p-6">
            <h2 className="font-semibold mb-4 text-sm">Rechercher une commande</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">ID de commande</label>
                <Input placeholder="Ex: 42" type="number" id="order-id-input" data-testid="input-order-id" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Votre email</label>
                <Input placeholder="moussa@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email-track" />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const idEl = document.getElementById("order-id-input") as HTMLInputElement;
                  const id = parseInt(idEl?.value ?? "0", 10);
                  if (!id || !email) return;
                  window.location.href = `/order/${id}?email=${encodeURIComponent(email)}`;
                }}
                data-testid="button-search-order"
              >
                Rechercher ma commande
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!confirmedEmail) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-card border border-card-border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Confirmez votre email</h2>
          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit((d) => setConfirmedEmail(d.email))}>
              <FormField control={emailForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email utilisé lors de la commande</FormLabel>
                  <FormControl><Input type="email" placeholder="moussa@example.com" {...field} data-testid="input-email-confirm" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full mt-4" data-testid="button-confirm-email">Voir ma commande</Button>
            </form>
          </Form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Commande introuvable</h2>
          <p className="text-muted-foreground mb-4 text-sm">Vérifiez l'ID et l'email de votre commande.</p>
          <Button variant="outline" onClick={() => setConfirmedEmail("")}>Réessayer</Button>
        </div>
      </div>
    );
  }

  const statusKey = order.status as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Accueil
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Commande #{order.id}</h1>
          <span className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</span>
        </div>

        {/* Status */}
        <div className={`border rounded-xl p-4 flex items-center gap-3 mb-6 ${statusCfg.color}`}>
          <StatusIcon className="w-6 h-6 flex-shrink-0" />
          <div>
            <p className="font-semibold" data-testid="status-order">{statusCfg.label}</p>
            {order.adminNote && <p className="text-sm mt-0.5">Note : {order.adminNote}</p>}
          </div>
        </div>

        {/* Order items */}
        <div className="bg-card border border-card-border rounded-xl p-5 mb-5">
          <h2 className="font-bold mb-4">Documents commandés</h2>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.id} data-testid={`item-order-${item.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{item.documentTitle}</p>
                    <p className="text-xs text-muted-foreground">{item.documentSubject} — {item.documentLevel}</p>
                  </div>
                  <span className="font-bold text-sm text-primary">{formatPrice(item.price)}</span>
                </div>
                {order.status === "approved" && (
                  <DocumentFileDownloads documentId={item.documentId ?? null} orderId={order.id} email={confirmedEmail} />
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-4 pt-3 flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary">{formatPrice(order.totalAmount)}</span>
          </div>
        </div>

        {/* Upload payment proof */}
        {(order.status === "pending" || order.status === "payment_uploaded") && (
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h2 className="font-bold mb-2">
              {order.status === "payment_uploaded" ? "Modifier la preuve de paiement" : "Envoyer la preuve de paiement"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Envoyez {formatPrice(order.totalAmount)} par{" "}
              {order.paymentMethod ? PAYMENT_NAMES[order.paymentMethod] ?? order.paymentMethod : "Wave, Orange Money ou Free Money"}{" "}
              puis uploadez la capture d'écran.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Moyen de paiement utilisé</label>
                <select
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  value={paymentMethodForUpload}
                  onChange={(e) => setPaymentMethodForUpload(e.target.value)}
                  data-testid="select-payment-method"
                >
                  <option value="wave">Wave</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="free_money">Free Money</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Capture d'écran du paiement</label>
                <div
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  data-testid="upload-zone"
                >
                  {uploadFile ? (
                    <div>
                      <img src={uploadFile} alt="preuve" className="max-h-48 mx-auto rounded-lg object-contain" />
                      <p className="text-xs text-muted-foreground mt-2">Cliquez pour changer</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">Cliquez pour sélectionner une image</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, JPEG acceptés</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} data-testid="input-file-proof" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Note (optionnel)</label>
                <Input placeholder="Ex: Paiement envoyé à 14h30" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} data-testid="input-proof-note" />
              </div>

              <Button
                className="w-full gap-2"
                disabled={!uploadFile || uploadProof.isPending}
                onClick={handleUpload}
                data-testid="button-upload-proof"
              >
                <Upload className="w-4 h-4" />
                {uploadProof.isPending ? "Envoi en cours..." : "Envoyer la preuve"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
