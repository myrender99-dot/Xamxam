import { useRoute, Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, Clock, User, Mail, Phone, FileText, Download } from "lucide-react";
import { useGetAdminOrder, useReviewOrder, getListAdminOrdersQueryKey, getGetAdminStatsQueryKey, getGetAdminOrderQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  payment_uploaded: { label: "Preuve envoyee", className: "bg-blue-100 text-blue-800 border-blue-200" },
  approved: { label: "Approuve", className: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Rejete", className: "bg-red-100 text-red-800 border-red-200" },
};

export default function AdminOrderDetail() {
  const [, params] = useRoute("/admin/orders/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const { data: order, isLoading } = useGetAdminOrder(id, { query: { enabled: !!id, queryKey: getGetAdminOrderQueryKey(id) } });
  const reviewOrder = useReviewOrder();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const formatPrice = (p: number) => p.toLocaleString("fr-FR") + " FCFA";
  const formatDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const handleReview = (status: "approved" | "rejected") => {
    reviewOrder.mutate(
      { id, data: { status, adminNote: note || null } },
      {
        onSuccess: () => {
          toast({ title: status === "approved" ? "Commande approuvee !" : "Commande rejetee" });
          queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
        },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Commande introuvable</h2>
          <Link href="/admin"><Button variant="outline">Retour</Button></Link>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending;
  const canReview = order.status === "payment_uploaded";

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Retour aux commandes
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>
            Commande #{order.id}
          </h1>
          <span className={`text-sm px-3 py-1 rounded-full border font-medium ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Customer info */}
        <div className="bg-card border border-card-border rounded-xl p-5 mb-5">
          <h2 className="font-bold mb-4">Informations client</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Nom</div>
                <div className="font-medium text-sm">{order.customerName}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="font-medium text-sm">{order.customerEmail}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Telephone</div>
                <div className="font-medium text-sm">{order.customerPhone}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            Commande le {formatDate(order.createdAt)}
            {order.paymentMethod && <span className="ml-3">Methode : <strong>{order.paymentMethod}</strong></span>}
          </div>
        </div>

        {/* Order items */}
        <div className="bg-card border border-card-border rounded-xl p-5 mb-5">
          <h2 className="font-bold mb-4">Documents commandes</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.documentTitle}</p>
                  <p className="text-xs text-muted-foreground">{item.documentSubject} — {item.documentLevel}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-primary">{formatPrice(item.price)}</span>
                  {item.fileUrl && (
                    <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                        <Download className="w-3.5 h-3.5" /> Fichier
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-4 pt-3 flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary">{formatPrice(order.totalAmount)}</span>
          </div>
        </div>

        {/* Payment proof */}
        {order.proofImageData ? (
          <div className="bg-card border border-card-border rounded-xl p-5 mb-5">
            <h2 className="font-bold mb-2">Preuve de paiement</h2>
            {order.proofUploadedAt && (
              <p className="text-xs text-muted-foreground mb-3">Envoyee le {formatDate(order.proofUploadedAt)}</p>
            )}
            {order.proofNotes && (
              <p className="text-sm text-muted-foreground mb-3 italic">Note : {order.proofNotes}</p>
            )}
            <img
              src={order.proofImageData}
              alt="Preuve de paiement"
              className="max-h-96 rounded-xl border border-border object-contain w-full"
              data-testid="img-payment-proof"
            />
          </div>
        ) : (
          <div className="bg-muted border border-border rounded-xl p-5 mb-5 text-center text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucune preuve de paiement envoyee</p>
          </div>
        )}

        {/* Review */}
        {canReview && (
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h2 className="font-bold mb-4">Valider le paiement</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5">Note (optionnel)</label>
              <Input
                placeholder="Paiement confirme / Montant incorrect..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="input-admin-note"
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => handleReview("approved")}
                disabled={reviewOrder.isPending}
                data-testid="button-approve"
              >
                <CheckCircle className="w-4 h-4" /> Approuver
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={() => handleReview("rejected")}
                disabled={reviewOrder.isPending}
                data-testid="button-reject"
              >
                <XCircle className="w-4 h-4" /> Rejeter
              </Button>
            </div>
          </div>
        )}

        {order.adminNote && (
          <div className="mt-4 bg-muted rounded-xl p-4 text-sm">
            <strong>Note admin :</strong> {order.adminNote}
          </div>
        )}
      </div>
    </div>
  );
}
