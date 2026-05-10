import { Router, type IRouter, type Request, type Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, documentsTable, documentFilesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendOrderApprovalEmail } from "../lib/mailer";

const router: IRouter = Router();

const DIAMANOPAY_API_URL = "https://api.diamanopay.com";

function getApiKey(): string {
  const key = process.env.DIAMANOPAY_API_KEY;
  if (!key) throw new Error("DIAMANOPAY_API_KEY environment variable is not set");
  return key;
}

function getAppBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const domains = process.env.REPLIT_DOMAINS ?? "";
  const first = domains.split(",")[0]?.trim();
  if (first) return `https://${first}`;
  return "http://localhost:80";
}

/**
 * POST /payments/initiate
 * Crée une commande et initie une charge DiamanoPay.
 * Retourne l'URL de paiement vers laquelle rediriger l'utilisateur.
 */
router.post("/payments/initiate", async (req: Request, res: Response): Promise<void> => {
  const { customerName, customerEmail, customerPhone, items } = req.body as {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    items?: { documentId: number }[];
  };

  if (!customerName || !customerEmail || !customerPhone || !items?.length) {
    res.status(400).json({ error: "Paramètres manquants (nom, email, téléphone, articles)" });
    return;
  }

  const docIds = items.map((i) => i.documentId);
  const docs = await db
    .select()
    .from(documentsTable)
    .where(docIds.length === 1 ? eq(documentsTable.id, docIds[0]) : inArray(documentsTable.id, docIds));

  if (docs.length !== docIds.length) {
    res.status(400).json({ error: "Certains documents sont introuvables" });
    return;
  }

  const totalAmount = docs.reduce((sum, d) => sum + d.price, 0);

  const [order] = await db
    .insert(ordersTable)
    .values({ customerName, customerEmail, customerPhone, totalAmount, status: "pending", paymentMethod: "diamanopay" })
    .returning();

  await db.insert(orderItemsTable).values(
    docs.map((d) => ({ orderId: order.id, documentId: d.id, price: d.price }))
  );

  const base = getAppBaseUrl();
  const successUrl = `${base}/order/${order.id}?email=${encodeURIComponent(customerEmail)}&payment=success`;
  const cancelUrl  = `${base}/order/${order.id}?email=${encodeURIComponent(customerEmail)}&payment=cancelled`;
  const webhookUrl = `${base}/api/payments/webhook`;

  let checkoutUrl: string;
  let chargeId: string;

  try {
    const apiKey = getApiKey();
    const payload = {
      amount: totalAmount,
      currency: "XOF",
      description: `Commande XamXam #${order.id} (${docs.map(d => d.title).join(", ").slice(0, 100)})`,
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
      },
      metadata: {
        orderId: order.id,
        customerEmail,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      webhook_url: webhookUrl,
    };

    const dpRes = await fetch(`${DIAMANOPAY_API_URL}/api/charges`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!dpRes.ok) {
      const errorText = await dpRes.text();
      logger.error({ status: dpRes.status, body: errorText }, "DiamanoPay charge creation failed");
      // Annuler la commande créée
      await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
      res.status(502).json({ error: "Erreur lors de l'initialisation du paiement. Veuillez réessayer." });
      return;
    }

    const dpData = await dpRes.json() as { id?: string; checkout_url?: string; payment_url?: string; url?: string };
    chargeId = dpData.id ?? "";
    checkoutUrl = dpData.checkout_url ?? dpData.payment_url ?? dpData.url ?? "";

    if (!checkoutUrl) {
      logger.error({ dpData }, "DiamanoPay response missing checkout URL");
      await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
      res.status(502).json({ error: "Réponse DiamanoPay invalide. Veuillez réessayer." });
      return;
    }
  } catch (err) {
    logger.error({ err }, "DiamanoPay API call failed");
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
    res.status(502).json({ error: "Impossible de joindre le service de paiement. Veuillez réessayer." });
    return;
  }

  await db
    .update(ordersTable)
    .set({ diamanopayChargeId: chargeId, diamanopayCheckoutUrl: checkoutUrl })
    .where(eq(ordersTable.id, order.id));

  logger.info({ orderId: order.id, chargeId, totalAmount }, "DiamanoPay charge created");

  res.status(201).json({
    orderId: order.id,
    checkoutUrl,
    totalAmount,
  });
});

/**
 * POST /payments/webhook
 * Reçoit les notifications DiamanoPay et met à jour le statut des commandes.
 */
router.post("/payments/webhook", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  logger.info({ body }, "DiamanoPay webhook received");

  // Récupérer l'identifiant de charge et le statut
  const chargeId  = (body.id ?? body.charge_id ?? body.reference) as string | undefined;
  const status    = (body.status ?? body.payment_status) as string | undefined;
  const metadata  = (body.metadata ?? body.meta) as Record<string, unknown> | undefined;

  // Vérification de la signature si DiamanoPay l'envoie
  const signature = req.headers["x-diamanopay-signature"] as string | undefined;
  if (signature && process.env.DIAMANOPAY_WEBHOOK_SECRET) {
    const { createHmac } = await import("crypto");
    const rawBody = JSON.stringify(body);
    const expected = createHmac("sha256", process.env.DIAMANOPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    if (signature !== expected && `sha256=${expected}` !== signature) {
      logger.warn({ signature }, "Invalid webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  // Répondre 200 immédiatement pour éviter les retries
  res.json({ received: true });

  if (!chargeId || !status) {
    logger.warn({ body }, "Webhook missing chargeId or status — ignored");
    return;
  }

  // Chercher la commande par chargeId ou par metadata.orderId
  let order = (await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.diamanopayChargeId, chargeId))
    .limit(1))[0];

  if (!order && metadata?.orderId) {
    const id = parseInt(String(metadata.orderId), 10);
    if (!isNaN(id)) {
      order = (await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1))[0];
    }
  }

  if (!order) {
    logger.warn({ chargeId }, "Webhook: no matching order found");
    return;
  }

  const isSuccess = ["success", "paid", "completed", "succeeded"].includes(status.toLowerCase());
  const isFailed  = ["failed", "cancelled", "canceled", "expired", "rejected"].includes(status.toLowerCase());

  if (isSuccess && order.status !== "approved") {
    await db
      .update(ordersTable)
      .set({ status: "approved", paymentMethod: "diamanopay", updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id));

    logger.info({ orderId: order.id, chargeId }, "Order approved via webhook");

    // Incrémenter les compteurs et envoyer l'email d'approbation
    const items = await db
      .select({
        id: orderItemsTable.id,
        documentId: orderItemsTable.documentId,
        documentTitle: documentsTable.title,
        documentSubject: documentsTable.subject,
        documentLevel: documentsTable.level,
        price: orderItemsTable.price,
      })
      .from(orderItemsTable)
      .leftJoin(documentsTable, eq(orderItemsTable.documentId, documentsTable.id))
      .where(eq(orderItemsTable.orderId, order.id));

    if (items.length > 0) {
      const docIds = items.map((i) => i.documentId);
      const { sql } = await import("drizzle-orm");
      await db
        .update(documentsTable)
        .set({ downloadCount: sql`${documentsTable.downloadCount} + 1` })
        .where(docIds.length === 1 ? eq(documentsTable.id, docIds[0]) : inArray(documentsTable.id, docIds));

      const allFiles = docIds.length > 0
        ? await db.select().from(documentFilesTable).where(
            docIds.length === 1
              ? eq(documentFilesTable.documentId, docIds[0])
              : inArray(documentFilesTable.documentId, docIds)
          )
        : [];

      const filesByDoc = new Map<number, typeof allFiles>();
      for (const f of allFiles) {
        const arr = filesByDoc.get(f.documentId) ?? [];
        arr.push(f);
        filesByDoc.set(f.documentId, arr);
      }

      sendOrderApprovalEmail({
        orderId: order.id,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        totalAmount: order.totalAmount,
        adminNote: null,
        items: items.map((item) => ({
          documentTitle: item.documentTitle ?? "",
          documentSubject: item.documentSubject ?? "",
          documentLevel: item.documentLevel ?? "",
          price: item.price,
          files: (filesByDoc.get(item.documentId) ?? []).map((f) => ({
            id: f.id,
            fileName: f.fileName,
            fileSize: f.fileSize ?? null,
          })),
        })),
      }).catch(() => {});
    }
  } else if (isFailed && order.status === "pending") {
    await db
      .update(ordersTable)
      .set({ status: "rejected", adminNote: `Paiement ${status} via DiamanoPay`, updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id));

    logger.info({ orderId: order.id, chargeId, status }, "Order rejected via webhook");
  }
});

/**
 * GET /payments/verify/:chargeId
 * Vérifie manuellement le statut d'un paiement DiamanoPay (utilisé en retour de paiement).
 */
router.get("/payments/verify/:chargeId", async (req: Request, res: Response): Promise<void> => {
  const { chargeId } = req.params;

  if (!chargeId) {
    res.status(400).json({ error: "chargeId requis" });
    return;
  }

  try {
    const apiKey = getApiKey();
    const dpRes = await fetch(`${DIAMANOPAY_API_URL}/api/charges/${chargeId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!dpRes.ok) {
      res.status(dpRes.status).json({ error: "Charge introuvable" });
      return;
    }

    const data = await dpRes.json() as { id?: string; status?: string; amount?: number; metadata?: Record<string, unknown> };

    // Mettre à jour la commande si le paiement est validé
    const status = data.status?.toLowerCase() ?? "";
    if (["success", "paid", "completed", "succeeded"].includes(status)) {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.diamanopayChargeId, chargeId))
        .limit(1);

      if (order && order.status !== "approved") {
        await db
          .update(ordersTable)
          .set({ status: "approved", paymentMethod: "diamanopay", updatedAt: new Date() })
          .where(eq(ordersTable.id, order.id));
        logger.info({ orderId: order.id, chargeId }, "Order approved via manual verify");
      }
    }

    res.json({ status: data.status, amount: data.amount });
  } catch (err) {
    logger.error({ err, chargeId }, "DiamanoPay verify failed");
    res.status(502).json({ error: "Impossible de vérifier le paiement" });
  }
});

export default router;
