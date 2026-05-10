import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle, Copy, Check, Upload, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { useCreateOrder } from "@workspace/api-client-react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  customerName: z.string().min(2, "Nom requis"),
  customerEmail: z.string().email("Email invalide"),
  customerPhone: z.string().min(9, "Téléphone requis"),
  paymentMethod: z.enum(["wave", "orange_money", "free_money"], {
    required_error: "Choisissez un moyen de paiement",
  }),
});

type FormData = z.infer<typeof schema>;

const METHODS = {
  wave:         { name: "Wave",         emoji: "🌊", hint: "Ouvrez Wave → Envoyer",                number: "+221 77 577 14 43" },
  orange_money: { name: "Orange Money", emoji: "🟠", hint: "Composez le code sur votre téléphone", number: "#144*391*778900#"  },
  free_money:   { name: "Free Money",   emoji: "🟢", hint: "Appelez le 36400",                      number: "36400"            },
} as const;

type MethodKey = keyof typeof METHODS;

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button type="button" onClick={copy}
      className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors">
      {done ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copié</> : <><Copy className="w-3.5 h-3.5" /> Copier</>}
    </button>
  );
}

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { toast } = useToast();
  const createOrder = useCreateOrder();
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderMethod, setOrderMethod] = useState<MethodKey>("wave");
  const [successEmail, setSuccessEmail] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { customerName: "", customerEmail: "", customerPhone: "", paymentMethod: "wave" },
  });

  const method = form.watch("paymentMethod") as MethodKey;
  const pay = METHODS[method];
  const fmt = (p: number) => p.toLocaleString("fr-FR") + " FCFA";

  const onSubmit = (data: FormData) => {
    if (!items.length) { toast({ title: "Panier vide", variant: "destructive" }); return; }
    createOrder.mutate(
      { data: { customerName: data.customerName, customerEmail: data.customerEmail, customerPhone: data.customerPhone, items: items.map(i => ({ documentId: i.id })) } },
      {
        onSuccess: order => {
          setOrderId(order.id);
          setOrderMethod(data.paymentMethod as MethodKey);
          setSuccessEmail(data.customerEmail);
          clearCart();
          try {
            const saved = JSON.parse(localStorage.getItem("xamxam_orders") ?? "[]");
            saved.unshift({ id: order.id, email: data.customerEmail, name: data.customerName, createdAt: new Date().toISOString() });
            localStorage.setItem("xamxam_orders", JSON.stringify(saved.slice(0, 10)));
          } catch {}
        },
        onError: () => toast({ title: "Erreur, veuillez réessayer.", variant: "destructive" }),
      }
    );
  };

  /* Panier vide */
  if (!items.length && orderId === null) {
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

  /* Confirmation après commande */
  if (orderId !== null) {
    const pm = METHODS[orderMethod];
    return (
      <div className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-5 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <h2 className="text-xl font-bold">Commande #{orderId} créée !</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Envoyez maintenant le paiement par <strong>{pm.name}</strong>
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Montant à envoyer</p>
              <p className="text-3xl font-bold text-primary">{fmt(total)}</p>
            </div>

            <div className="bg-muted rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">{pm.hint}</p>
              <div className="flex items-center gap-2">
                <p className="font-mono font-bold text-lg flex-1 break-all">{pm.number}</p>
                <CopyBtn text={pm.number} />
              </div>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Après le paiement, envoyez une capture d'écran de confirmation
            </p>
          </div>

          <Link href={`/order/${orderId}?email=${encodeURIComponent(successEmail)}`}>
            <Button size="lg" className="w-full gap-2">
              <Upload className="w-4 h-4" /> Envoyer ma preuve de paiement
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  /* Formulaire principal */
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

              {/* Colonne gauche — Infos + paiement */}
              <div className="md:col-span-2 space-y-4">

                {/* Infos client */}
                <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
                  <h2 className="font-semibold">Vos informations</h2>

                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Nom complet</FormLabel>
                      <FormControl>
                        <Input placeholder="Moussa Diallo" className="h-11" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="customerEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="moussa@gmail.com" className="h-11" {...field} data-testid="input-email" />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Votre commande sera envoyée ici</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="customerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Téléphone</FormLabel>
                      <FormControl>
                        <Input placeholder="+221 77 000 00 00" className="h-11" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Paiement */}
                <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
                  <h2 className="font-semibold">Moyen de paiement</h2>

                  <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                    <FormItem>
                      <div className="grid grid-cols-3 gap-2">
                        {(Object.keys(METHODS) as MethodKey[]).map(m => (
                          <button key={m} type="button"
                            onClick={() => field.onChange(m)}
                            data-testid={`button-payment-${m}`}
                            className={`border-2 rounded-xl py-3 text-center transition-all ${
                              field.value === m
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/40"
                            }`}>
                            <div className="text-2xl mb-1">{METHODS[m].emoji}</div>
                            <div className="text-xs font-bold">{METHODS[m].name}</div>
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Numéro à utiliser */}
                  <div className="bg-muted rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">{pay.hint}</p>
                    <div className="flex items-center gap-3">
                      <p className="font-mono font-bold text-lg flex-1 break-all leading-snug">{pay.number}</p>
                      <CopyBtn text={pay.number} />
                    </div>
                    <div className="border-t border-border mt-3 pt-3 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Montant à envoyer</p>
                      <p className="font-bold text-primary text-lg">{fmt(total)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    Après le paiement, vous enverrez une photo de confirmation
                  </p>
                </div>

                <Button type="submit" size="lg" className="w-full gap-2"
                  disabled={createOrder.isPending} data-testid="button-submit-order">
                  {createOrder.isPending
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Traitement…</>
                    : <><CheckCircle className="w-4 h-4" /> Commander — {fmt(total)}</>}
                </Button>
              </div>

              {/* Colonne droite — Résumé */}
              <div>
                <div className="bg-card border border-card-border rounded-2xl p-5 sticky top-24">
                  <h2 className="font-semibold mb-3">Résumé ({items.length})</h2>
                  <div className="space-y-2.5 mb-4">
                    {items.map(item => (
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
