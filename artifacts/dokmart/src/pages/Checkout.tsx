import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ShoppingCart, CreditCard, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useCreateOrder } from "@workspace/api-client-react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  customerName:  z.string().min(2, "Nom requis (2 caractères minimum)"),
  customerEmail: z.string().email("Email invalide"),
  customerPhone: z.string().min(9, "Téléphone requis"),
});

type FormData = z.infer<typeof schema>;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { customerName: "", customerEmail: "", customerPhone: "" },
  });

  const fmt = (p: number) => p.toLocaleString("fr-FR") + " FCFA";

  const onSubmit = async (data: FormData) => {
    if (!items.length) {
      toast({ title: "Panier vide", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/payments/initiate`.replace("//", "/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName:  data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          items: items.map((i) => ({ documentId: i.id })),
        }),
      });

      const result = await res.json() as { orderId?: number; checkoutUrl?: string; error?: string };

      if (!res.ok || !result.checkoutUrl) {
        toast({ title: result.error ?? "Erreur lors de l'initialisation du paiement", variant: "destructive" });
        return;
      }

      // Sauvegarder la commande localement avant la redirection
      try {
        const saved = JSON.parse(localStorage.getItem("xamxam_orders") ?? "[]");
        saved.unshift({
          id: result.orderId,
          email: data.customerEmail,
          name: data.customerName,
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem("xamxam_orders", JSON.stringify(saved.slice(0, 10)));
      } catch {}

      clearCart();

      // Rediriger vers la page de paiement DiamanoPay
      window.location.href = result.checkoutUrl;
    } catch {
      toast({ title: "Erreur réseau. Veuillez réessayer.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!items.length) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <ShoppingCart className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="text-xl font-bold mb-2">Votre panier est vide</h2>
          <Link href="/catalog"><Button>Voir le catalogue</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/cart" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Retour au panier
        </Link>

        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: "var(--app-font-serif)" }}>
          Commander
        </h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid md:grid-cols-3 gap-5">

              {/* Colonne gauche */}
              <div className="md:col-span-2 space-y-4">

                {/* Infos client */}
                <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
                  <h2 className="font-semibold">Vos informations</h2>

                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Nom complet</FormLabel>
                      <FormControl>
                        <Input placeholder="Moussa Diallo" className="h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="customerEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="moussa@gmail.com" className="h-11" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Vos documents seront envoyés à cet email</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="customerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Téléphone</FormLabel>
                      <FormControl>
                        <Input placeholder="+221 77 000 00 00" className="h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Paiement */}
                <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
                  <h2 className="font-semibold">Paiement sécurisé</h2>

                  <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Vous serez redirigé vers <strong>DiamanoPay</strong> pour finaliser votre paiement en toute sécurité.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Wave",         emoji: "🌊" },
                        { label: "Orange Money", emoji: "🟠" },
                        { label: "Free Money",   emoji: "🟢" },
                        { label: "Carte bancaire", emoji: "💳" },
                      ].map((m) => (
                        <span key={m.label}
                          className="inline-flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">
                          {m.emoji} {m.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Paiement 100% sécurisé — vos données ne transitent pas par nos serveurs
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full gap-2 h-13 text-base" disabled={loading}>
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirection en cours…</>
                    : <><CreditCard className="w-4 h-4" /> Payer {fmt(total)} →</>}
                </Button>
              </div>

              {/* Résumé */}
              <div>
                <div className="bg-card border border-card-border rounded-2xl p-5 sticky top-24">
                  <h2 className="font-semibold mb-3">Résumé ({items.length})</h2>
                  <div className="space-y-2.5 mb-4">
                    {items.map((item) => (
                      <div key={item.id} className="flex justify-between gap-2 text-sm">
                        <span className="text-muted-foreground line-clamp-2 flex-1">{item.title}</span>
                        <span className="font-semibold flex-shrink-0">{fmt(item.price)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-primary">{fmt(total)}</span>
                  </div>
                </div>
              </div>

            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
