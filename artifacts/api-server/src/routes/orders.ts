import { Router, type IRouter } from "express";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { eq, and, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, documentsTable, paymentProofsTable, documentFilesTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetOrderParams,
  GetOrderQueryParams,
  UploadPaymentProofParams,
  UploadPaymentProofBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerName, customerEmail, customerPhone, items } = parsed.data;

  if (!items || items.length === 0) {
    res.status(400).json({ error: "Le panier est vide" });
    return;
  }

  const docIds = items.map((i) => i.documentId);
  const docs = await db
    .select()
    .from(documentsTable)
    .where(
      docIds.length === 1
        ? eq(documentsTable.id, docIds[0])
        : inArray(documentsTable.id, docIds)
    );

  if (docs.length !== docIds.length) {
    res.status(400).json({ error: "Certains documents sont introuvables" });
    return;
  }

  const totalAmount = docs.reduce((sum, d) => sum + d.price, 0);

  const [order] = await db
    .insert(ordersTable)
    .values({ customerName, customerEmail, customerPhone, totalAmount, status: "pending" })
    .returning();

  await db.insert(orderItemsTable).values(
    docs.map((d) => ({ orderId: order.id, documentId: d.id, price: d.price }))
  );

  res.status(201).json({
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paymentMethod: order.paymentMethod ?? null,
    adminNote: order.adminNote ?? null,
  });
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const query = GetOrderQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Email requis" }); return; }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.customerEmail, query.data.email)));

  if (!order) { res.status(404).json({ error: "Commande introuvable" }); return; }

  const items = await db
    .select({
      id: orderItemsTable.id,
      documentId: orderItemsTable.documentId,
      documentTitle: documentsTable.title,
      documentSubject: documentsTable.subject,
      documentLevel: documentsTable.level,
      price: orderItemsTable.price,
      fileUrl: documentsTable.fileUrl,
    })
    .from(orderItemsTable)
    .leftJoin(documentsTable, eq(orderItemsTable.documentId, documentsTable.id))
    .where(eq(orderItemsTable.orderId, order.id));

  const approvedItems = order.status === "approved"
    ? items.map((i) => ({ ...i, documentTitle: i.documentTitle ?? "", documentSubject: i.documentSubject ?? "", documentLevel: i.documentLevel ?? "", fileUrl: i.fileUrl ?? null }))
    : items.map((i) => ({ ...i, documentTitle: i.documentTitle ?? "", documentSubject: i.documentSubject ?? "", documentLevel: i.documentLevel ?? "", fileUrl: null }));

  res.json({
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paymentMethod: order.paymentMethod ?? null,
    adminNote: order.adminNote ?? null,
    items: approvedItems,
  });
});

router.post("/orders/:id/payment-proof", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UploadPaymentProofParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UploadPaymentProofBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.customerEmail, parsed.data.customerEmail)));

  if (!order) { res.status(404).json({ error: "Commande introuvable" }); return; }

  await db
    .insert(paymentProofsTable)
    .values({ orderId: order.id, proofImageData: parsed.data.proofImageData, notes: parsed.data.notes ?? null })
    .onConflictDoUpdate({
      target: paymentProofsTable.orderId,
      set: { proofImageData: parsed.data.proofImageData, notes: parsed.data.notes ?? null, uploadedAt: new Date() },
    });

  const [updated] = await db
    .update(ordersTable)
    .set({ status: "payment_uploaded", paymentMethod: parsed.data.paymentMethod })
    .where(eq(ordersTable.id, order.id))
    .returning();

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    paymentMethod: updated.paymentMethod ?? null,
    adminNote: updated.adminNote ?? null,
  });
});

/**
 * GET /orders/:orderId/view-file/:fileId?email=xxx&download=1
 * Sert un fichier PDF depuis le disque de manière sécurisée.
 */
router.get("/orders/:orderId/view-file/:fileId", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  const fileId = parseInt(req.params.fileId, 10);
  const email = (req.query.email as string) ?? "";
  const forceDownload = req.query.download === "1";

  if (!orderId || !fileId || !email) {
    res.status(400).json({ error: "Paramètres manquants" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Commande introuvable" }); return; }
  if (order.customerEmail.toLowerCase() !== email.toLowerCase()) { res.status(403).json({ error: "Accès refusé" }); return; }
  if (order.status !== "approved") { res.status(403).json({ error: "Commande non encore approuvée" }); return; }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const docIds = items.map((i) => i.documentId);

  const [file] = await db
    .select()
    .from(documentFilesTable)
    .where(
      and(
        eq(documentFilesTable.id, fileId),
        docIds.length === 1
          ? eq(documentFilesTable.documentId, docIds[0])
          : inArray(documentFilesTable.documentId, docIds)
      )
    )
    .limit(1);

  if (!file) { res.status(404).json({ error: "Fichier introuvable ou accès refusé" }); return; }

  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(file.objectPath));
    await stat(filePath);

    const safeName = file.fileName.replace(/[^\w\s.-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${forceDownload ? "attachment" : "inline"}; filename="${safeName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(filePath).pipe(res);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      res.status(404).json({ error: "Fichier introuvable sur le disque" });
      return;
    }
    req.log.error({ err: error }, "Erreur lors de la lecture du fichier");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
